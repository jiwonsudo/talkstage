import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

type Body = { paymentKey?: unknown; orderId?: unknown; amount?: unknown };
type OrderRow = { orderId: string; userId: string; amount: number; credits: number; status: 'ready' | 'paid'; paymentKey: string | null };

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * 토스 결제 승인. successUrl 로 돌아온 값을 받아서
 * 1) DB 에 저장된 주문 금액과 같은지 보고  2) 토스에 승인을 요청한 뒤  3) 성공하면 주문을 '결제됨'으로 바꿔 크레딧을 줘요.
 * 금액은 항상 DB 값을 써요. 같은 주문을 두 번 불러도(새로 고침 등) 크레딧은 한 번만 들어가요.
 */
export async function POST(req: Request) {
  const secret = process.env.TOSS_SECRET_KEY;
  const admin = getAdminSupabase();
  if (!secret || !admin) return fail('서버에 결제 설정이 없어요.', 501);

  const b = (await req.json().catch(() => ({}))) as Body;
  const paymentKey = typeof b.paymentKey === 'string' ? b.paymentKey : '';
  const orderId = typeof b.orderId === 'string' ? b.orderId : '';
  const amount = Number(b.amount);
  if (!paymentKey || paymentKey.length > 200 || !/^[A-Za-z0-9_=-]{6,64}$/.test(orderId) || !Number.isInteger(amount)) return fail('결제 정보가 올바르지 않아요.');

  const { data: order, error: oe } = await admin.rpc('order_for_confirm', { p_order_id: orderId });
  const o = order as OrderRow | null;
  if (oe || !o) return fail('주문을 찾지 못했어요.', 404);
  if (o.amount !== amount) return fail('결제 금액이 주문과 달라요.');
  if (o.status === 'paid') {
    return o.paymentKey === paymentKey ? NextResponse.json({ credits: o.credits, already: true }) : fail('이미 결제된 주문이에요.', 409);
  }

  // 토스 승인. 같은 주문으로 다시 보내도 첫 응답을 돌려받도록 주문번호를 멱등 키로 써요.
  const res = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `confirm-${orderId}`,
    },
    body: JSON.stringify({ paymentKey, orderId, amount: o.amount }),
  });
  const pay = (await res.json().catch(() => ({}))) as { status?: string; totalAmount?: number; method?: string; code?: string; message?: string };
  if (!res.ok) return fail(pay.message ?? '결제 승인에 실패했어요.', res.status === 409 ? 409 : 400);
  if (pay.status !== 'DONE' || pay.totalAmount !== o.amount) return fail('결제가 완료되지 않았어요.');

  const { data: done, error: ce } = await admin.rpc('complete_order', { p_order_id: orderId, p_payment_key: paymentKey, p_amount: o.amount, p_method: pay.method ?? '' });
  if (ce) {
    // 토스는 승인됐는데 우리 DB 반영이 실패한 경우: 다시 불러도 같은 결과가 오도록 멱등 처리돼 있어서, 새로 고침하면 다시 시도돼요.
    console.error('complete_order failed', orderId, ce.message);
    return fail('결제는 됐지만 크레딧 반영에 실패했어요. 새로 고침해 주세요. 계속 안 되면 지원 받기로 알려 주세요.', 500);
  }
  return NextResponse.json({ credits: (done as { credits: number }).credits });
}
