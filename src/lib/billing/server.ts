import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 토스페이먼츠 자동결제(빌링) 서버 전용 도우미. 라우트 핸들러에서만 써요.
 * 자동결제는 결제위젯 키가 아니라 "API 개별 연동 키"(test_ck / test_sk)를 써요.
 */
const API = 'https://api.tosspayments.com/v1';

export const billingSecret = () => process.env.TOSS_BILLING_SECRET_KEY ?? '';

type TossError = { code?: string; message?: string };

async function toss<T>(path: string, init: { method: 'POST' | 'DELETE'; body?: unknown; idem?: string }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${billingSecret()}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...(init.idem ? { 'Idempotency-Key': init.idem } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(60_000), // 토스 권장: 자동결제 승인은 60초 이상 기다리기
  });
  const data = (await res.json().catch(() => ({}))) as T & TossError;
  if (!res.ok) throw new Error(data.message ?? `토스 요청 실패(${res.status})`);
  return data;
}

/** 카드 등록창에서 받은 authKey 로 빌링키 발급 */
export async function issueBillingKey(authKey: string, customerKey: string) {
  const b = await toss<{ billingKey: string; card?: { number?: string; issuerCode?: string; cardType?: string } }>(
    '/billing/authorizations/issue', { method: 'POST', body: { authKey, customerKey } });
  // 토스가 가려서 주는 번호(예: 53651234****789*)를 4자리씩 끊어서 보여 줘요
  const num = b.card?.number?.replace(/[^0-9*]/g, '').match(/.{1,4}/g)?.join(' ');
  return { billingKey: b.billingKey, label: num ? `카드 ${num}` : '등록된 카드' };
}

/** 빌링키로 결제. 같은 주문번호로 다시 보내도 한 번만 결제되게 멱등 키를 붙여요. */
export async function chargeBilling(p: { billingKey: string; customerKey: string; orderId: string; amount: number; orderName: string; email?: string; name?: string }) {
  const r = await toss<{ status?: string; totalAmount?: number; paymentKey?: string }>(`/billing/${encodeURIComponent(p.billingKey)}`, {
    method: 'POST',
    idem: `bill-${p.orderId}`,
    body: { customerKey: p.customerKey, orderId: p.orderId, amount: p.amount, orderName: p.orderName, customerEmail: p.email, customerName: p.name },
  });
  if (r.status !== 'DONE' || r.totalAmount !== p.amount || !r.paymentKey) throw new Error('결제가 완료되지 않았어요.');
  return { paymentKey: r.paymentKey };
}

/** 빌링키 삭제(계정 삭제 때). 실패해도 계정 삭제는 계속해요. */
export async function deleteBillingKey(billingKey: string) {
  await toss(`/billing/${encodeURIComponent(billingKey)}`, { method: 'DELETE' });
}

type Paid = { plan: string; periodEnd: string; already: boolean };

/**
 * 주문 만들기(금액은 DB) → 토스 결제 → 성공이면 구독 반영, 실패면 실패 기록.
 * 결제는 됐는데 DB 반영이 실패하면 예외를 던져요(로그에 주문번호가 남아요).
 */
export async function payPlan(admin: SupabaseClient, p: { uid: string; plan: string; kind: 'start' | 'upgrade' | 'renew'; billingKey: string; customerKey: string; email?: string; name?: string }): Promise<Paid> {
  const { data: o, error: oe } = await admin.rpc('sub_new_payment', { p_uid: p.uid, p_plan: p.plan, p_kind: p.kind });
  if (oe) throw new Error(oe.message === 'ALREADY_SUBSCRIBED' ? '이미 이 요금제를 쓰고 있어요.' : oe.message === 'NOT_AN_UPGRADE' ? '지금 요금제보다 높은 요금제만 바로 바꿀 수 있어요.' : '주문을 만들지 못했어요.');
  const order = o as { orderId: string; amount: number; orderName: string };
  let paymentKey: string;
  try {
    ({ paymentKey } = await chargeBilling({ billingKey: p.billingKey, customerKey: p.customerKey, orderId: order.orderId, amount: order.amount, orderName: order.orderName, email: p.email, name: p.name }));
  } catch (e) {
    await admin.rpc('sub_payment_failed', { p_order_id: order.orderId, p_error: (e as Error).message });
    throw e;
  }
  const { data, error } = await admin.rpc('sub_payment_paid', { p_order_id: order.orderId, p_payment_key: paymentKey, p_amount: order.amount });
  if (error) {
    console.error('sub_payment_paid failed', order.orderId, error.message);
    throw new Error('결제는 됐지만 요금제 반영에 실패했어요. 지원 받기로 알려 주세요.');
  }
  return data as Paid;
}
