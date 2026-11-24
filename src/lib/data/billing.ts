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
