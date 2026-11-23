export type PlanId = 'Opening' | 'Spotlight' | 'Headliner';

// 크레딧을 바꾸면 SQL plan_credits() 도 같이 바꿔요(supabase/migrations, 최신은 0004).
export const PLANS: Record<PlanId, { credits: number; price: string; who: string }> = {
  Opening: { credits: 36, price: '무료', who: '처음 서 보는 무대' },
  Spotlight: { credits: 120, price: '월 4,900원', who: '매주 연습하는 사람' },
  Headliner: { credits: 360, price: '월 9,900원', who: '큰 발표를 앞둔 사람' },
};

/** 리허설 한 번(녹화 10분 + 대본 점검)에 쓰는 크레딧 */
export const CREDIT_PER_REHEARSAL = 12;

export const isPaidPlan = (plan: PlanId | undefined) => !!plan && plan !== 'Opening';
