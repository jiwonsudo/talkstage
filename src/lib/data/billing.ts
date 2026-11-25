'use client';
import { getSupabase } from '@/lib/supabase/client';
import type { PlanId } from '@/lib/plans';

export type SubStatus = 'active' | 'canceled' | 'past_due' | 'ended';
export type Subscription = {
  customerKey: string;
  /** 등록된 카드 이름(예: "카드 ····1234"), 없으면 null */
  card: string | null;
  status: SubStatus | null;
  plan: PlanId | null;
  nextPlan: PlanId | null;
  periodEnd: string | null;
  /** 다음 결제 금액 */
  price: number | null;
};

const db = () => {
  const s = getSupabase();
  if (!s) throw new Error('Supabase 설정이 필요해요.');
  return s;
};

/** 내 구독·카드 현황(처음이면 카드 등록용 customerKey 도 만들어요) */
export async function fetchSubscription(): Promise<Subscription> {
  const { data, error } = await db().rpc('my_subscription');
  if (error) throw new Error('구독 정보를 불러오지 못했어요.');
  return data as Subscription;
}

/** 등록된 카드로 요금제 결제(시작·업그레이드), 또는 카드 등록창에서 돌아온 authKey 로 카드 저장(+결제) */
export async function startPlan(p: { plan?: PlanId; authKey?: string; customerKey?: string }): Promise<{ plan?: PlanId; periodEnd?: string; card?: boolean }> {
  const r = await fetch('/api/billing/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
  const body = (await r.json().catch(() => ({}))) as { plan?: PlanId; periodEnd?: string; card?: boolean; error?: string };
  if (!r.ok) throw new Error(body.error ?? '결제하지 못했어요.');
  return body;
}

/** 해지 예약(결제한 기간까지는 그대로 써요) */
export async function cancelPlan() {
  const { error } = await db().rpc('sub_cancel');
  if (error) throw new Error('해지하지 못했어요.');
}

/** 해지 예약 취소 */
export async function resumePlan() {
  const { error } = await db().rpc('sub_resume');
  if (error) throw new Error('해지를 취소하지 못했어요.');
}

/** 다음 결제일부터 낮은 유료 요금제로(같은 요금제를 고르면 예약 취소) */
export async function schedulePlan(plan: PlanId) {
  const { error } = await db().rpc('sub_schedule', { p_plan: plan });
  if (error) throw new Error('요금제 변경을 예약하지 못했어요.');
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

// ── 요금제 내릴 때 사유(0008 plan_changes) ──
export const DOWN_REASONS: { id: string; label: string }[] = [
  { id: 'price', label: '가격이 부담돼요' },
  { id: 'done', label: '준비하던 발표가 끝났어요' },
  { id: 'rarely', label: '생각보다 자주 쓰지 않아요' },
  { id: 'accuracy', label: '분석·코칭이 기대만큼 정확하지 않아요' },
  { id: 'feature', label: '필요한 기능이 없어요' },
  { id: 'other', label: '직접 작성' },
];
/** 다운그레이드 사유 저장. reasons 는 우선순위 순(최대 3개), reason 은 1순위. reasons 칸(0009)이 아직 없으면 1순위만 저장해요. */
export async function savePlanChange(p: { from: PlanId; to: PlanId; reasons: string[]; detail: string }) {
  const base = { from_plan: p.from, to_plan: p.to, reason: p.reasons[0], detail: p.detail.trim() || null };
  const { error } = await db().from('plan_changes').insert({ ...base, reasons: p.reasons.slice(0, 3) });
  if (!error) return;
  if (error.code === 'PGRST204' || /reasons/.test(error.message)) {
    const { error: e2 } = await db().from('plan_changes').insert(base);
    if (e2) throw e2;
    return;
  }
  throw error;
}

// ── 결제 관리: 결제·크레딧 사용 내역(내 것만 읽을 수 있어요, RLS) ──
export type PaymentRow = { id: string; src: 'order' | 'sub'; at: string; title: string; amount: number; status: 'paid' | 'failed' | 'ready'; method?: string | null };
export type LedgerRow = { id: string; at: string; amount: number; reason: string; source: 'monthly' | 'bonus' };

export async function listPayments(): Promise<PaymentRow[]> {
  const [subs, orders] = await Promise.all([
    db().from('subscription_payments').select('id, plan, kind, amount, status, created_at, paid_at').order('created_at', { ascending: false }).limit(50),
    db().from('orders').select('id, credits, amount, status, method, created_at, paid_at').order('created_at', { ascending: false }).limit(50),
  ]);
  if (subs.error) throw subs.error;
  if (orders.error) throw orders.error;
  const KIND: Record<string, string> = { start: '시작', upgrade: '업그레이드', renew: '월 결제' };
  type S = { id: string; plan: string; kind: string; amount: number; status: string; created_at: string; paid_at: string | null };
  type O = { id: string; credits: number; amount: number; status: string; method: string | null; created_at: string; paid_at: string | null };
  const a: PaymentRow[] = (subs.data as S[]).map((r) => ({ id: r.id, src: 'sub' as const, at: r.paid_at ?? r.created_at, title: `${r.plan} ${KIND[r.kind] ?? ''}`.trim(), amount: r.amount, status: r.status === 'paid' ? 'paid' : r.status === 'failed' ? 'failed' : 'ready' }));
  const b: PaymentRow[] = (orders.data as O[]).map((r) => ({ id: r.id, src: 'order' as const, at: r.paid_at ?? r.created_at, title: `크레딧 ${r.credits} 구매`, amount: r.amount, status: r.status === 'paid' ? 'paid' : 'ready', method: r.method }));
  // 결제창만 열고 끝내지 않은 주문(ready)은 내역에서 빼요
  return [...a, ...b].filter((r) => r.status !== 'ready').sort((x, y) => y.at.localeCompare(x.at));
}

export async function listLedger(): Promise<LedgerRow[]> {
  const { data, error } = await db().from('credit_ledger').select('id, amount, reason, source, created_at').order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  return (data as { id: string; amount: number; reason: string; source: 'monthly' | 'bonus'; created_at: string }[]).map((r) => ({ id: r.id, at: r.created_at, amount: r.amount, reason: r.reason, source: r.source }));
}

/** 결제 영수증(토스 매출전표) 주소 */
export async function receiptUrl(r: Pick<PaymentRow, 'id' | 'src'>): Promise<string> {
  const res = await fetch(`/api/payments/receipt?id=${encodeURIComponent(r.id)}&src=${r.src}`, { cache: 'no-store' });
  const b = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !b.url) throw new Error(b.error ?? '영수증을 불러오지 못했어요.');
  return b.url;
}
