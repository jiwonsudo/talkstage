export type PlanId = 'Opening' | 'Spotlight' | 'Headliner';

// 크레딧을 바꾸면 SQL plan_credits() 도 같이 바꿔요(supabase/migrations, 최신은 0004).
export const PLANS: Record<PlanId, { credits: number; price: string; who: string }> = {
  Opening: { credits: 36, price: '무료', who: '처음 서 보는 무대' },
  Spotlight: { credits: 120, price: '월 4,900원', who: '매주 연습하는 사람' },
  Headliner: { credits: 360, price: '월 9,900원', who: '큰 발표를 앞둔 사람' },
};

/**
 * 크레딧 추가 구매(기한 없음). 구독보다 크레딧당 값이 비싸게 둬서 자주 쓰면 구독이 낫게 해요.
 * 1크레딧: Spotlight 약 41원 · Headliner 약 28원 / 36크레딧 1,900원(약 53원) · 72크레딧 3,500원(약 49원).
 * 가격·크레딧을 바꾸면 SQL pack_info() 도 같이 바꿔요(최신 0008).
 */
export type PackId = 'pack3' | 'pack6';
export const PACKS: Record<PackId, { credits: number; amount: number }> = {
  pack3: { credits: 36, amount: 1900 },
  pack6: { credits: 72, amount: 3500 },
};
/** 크레딧 1개 값(원, 반올림) */
export const perCredit = (amount: number, credits: number) => Math.round(amount / credits);
export const isPackId = (v: string | null): v is PackId => v === 'pack3' || v === 'pack6';
export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/** 리허설 한 번(녹화 분석)에 쓰는 크레딧. 녹화 길이와 관계없이 같아요. */
export const CREDIT_PER_REHEARSAL = 12;

/** 월 요금제 가격(원). 바꾸면 SQL plan_price() 도 같이 바꿔요(0006). */
export const PLAN_PRICE: Record<PlanId, number> = { Opening: 0, Spotlight: 4900, Headliner: 9900 };
export const isPlanId = (v: string | null): v is PlanId => v === 'Opening' || v === 'Spotlight' || v === 'Headliner';

export const isPaidPlan = (plan: PlanId | undefined) => !!plan && plan !== 'Opening';

/** 리허설 예상 횟수(항상 '약'을 붙여 보여 줘요 — 예상치예요) */
export const approxRuns = (credits: number) => Math.floor(credits / CREDIT_PER_REHEARSAL);
const ratio = (a: number, b: number) => `${Math.round((a / b) * 10) / 10}`.replace(/\.0$/, '');
/** 유료 요금제가 아래 요금제보다 더 쓰는 것(요금제 카드 뱃지) */
export const PLAN_PERKS: Record<PlanId, string[]> = {
  Opening: [],
  Spotlight: [`무료의 ${ratio(PLANS.Spotlight.credits, PLANS.Opening.credits)}배 크레딧`, 'AI 대본 코칭', '회차별 비교'],
  Headliner: [`Spotlight의 ${ratio(PLANS.Headliner.credits, PLANS.Spotlight.credits)}배 크레딧`, 'AI 대본 코칭', '리포트 PDF'],
};
