export type PlanId = 'Opening' | 'Spotlight' | 'Headliner';

// 크레딧을 바꾸면 SQL plan_credits() 도 같이 바꿔요(supabase/migrations, 최신은 0004).
export const PLANS: Record<PlanId, { credits: number; price: string; who: string }> = {
  Opening: { credits: 36, price: '무료', who: '처음 서 보는 무대' },
  Spotlight: { credits: 120, price: '월 4,900원', who: '매주 연습하는 사람' },
  Headliner: { credits: 360, price: '월 9,900원', who: '큰 발표를 앞둔 사람' },
};

/** 회차 추가 구매(기한 없음). 가격·크레딧을 바꾸면 SQL pack_info() 도 같이 바꿔요(0005). */
export type PackId = 'pack3' | 'pack6';
export const PACKS: Record<PackId, { times: number; credits: number; amount: number }> = {
  pack3: { times: 3, credits: 36, amount: 1500 },
  pack6: { times: 6, credits: 72, amount: 2500 },
};
export const isPackId = (v: string | null): v is PackId => v === 'pack3' || v === 'pack6';
export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/** 리허설 한 번(녹화 10분 + 대본 점검)에 쓰는 크레딧 */
export const CREDIT_PER_REHEARSAL = 12;

export const isPaidPlan = (plan: PlanId | undefined) => !!plan && plan !== 'Opening';
