export type PlanId = 'Opening' | 'Spotlight' | 'Headliner';
/** 리허설 한 번(녹화 분석)에 쓰는 크레딧. 녹화 길이와 관계없이 같아요. */
export const CREDIT_PER_REHEARSAL = 12;
/**
 * 크레딧 기준 단위: 발표 하나 준비 ≈ 48크레딧.
 * AI 대본 코칭 1번(3~9) + 같은 발표 리허설 3~4번(36~48) 이 대략 39~57 이라 그 가운데쯤인 리허설 4번 값으로 잡았어요.
 * 유료 요금제·크레딧 묶음은 이 단위의 배수예요(무료 Opening 36 = 리허설 3번만, AI 코칭 없음).
 */
export const CREDIT_PER_TALK = 4 * CREDIT_PER_REHEARSAL;

// 크레딧을 바꾸면 SQL plan_credits() 도 같이 바꿔요(supabase/migrations, 최신은 0009).
export const PLANS: Record<PlanId, { credits: number; price: string; who: string }> = {
  Opening: { credits: 36, price: '무료', who: '처음 서 보는 무대' },
  Spotlight: { credits: 144, price: '월 4,900원', who: '한 달에 발표가 몇 번 있는 사람' },
  Headliner: { credits: 384, price: '월 9,900원', who: '발표가 잦은 사람' },
};

/**
 * 크레딧 추가 구매(기한 없음). 묶음은 발표 하나(48크레딧)의 배수예요.
 * 많이 살수록 정가(48묶음 값 기준)에서 할인하지만, 어떤 묶음도 구독보다 1크레딧이 비싸요
 * (구독 중 1크레딧이 가장 비싼 Spotlight 약 34원보다 위). 바꾸면 SQL pack_info() 도 같이(최신 0009).
 * PACKS_ABOVE_SUBS 가 false 면 잘못 정한 거예요.
 */
export type PackId = 'pack48' | 'pack96' | 'pack192' | 'pack288' | 'pack480';
export const PACKS: Record<PackId, { credits: number; amount: number }> = {
  pack48: { credits: 48, amount: 2400 },
  pack96: { credits: 96, amount: 4500 },
  pack192: { credits: 192, amount: 8600 },
  pack288: { credits: 288, amount: 12400 },
  pack480: { credits: 480, amount: 19200 },
};
export const PACK_IDS = Object.keys(PACKS) as PackId[];
/** 크레딧 1개 값(원, 반올림) */
export const perCredit = (amount: number, credits: number) => Math.round(amount / credits);
export const isPackId = (v: string | null): v is PackId => v != null && v in PACKS;
/** 정가: 48묶음과 같은 1크레딧 값으로 샀을 때(100원 단위) */
export const packList = (id: PackId) => Math.round((PACKS.pack48.amount / PACKS.pack48.credits) * PACKS[id].credits / 100) * 100;
/** 정가 대비 할인율(%) */
export const packSave = (id: PackId) => Math.max(0, Math.round((1 - PACKS[id].amount / packList(id)) * 100));
export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/** 월 요금제 가격(원). 바꾸면 SQL plan_price() 도 같이 바꿔요(0006). */
export const PLAN_PRICE: Record<PlanId, number> = { Opening: 0, Spotlight: 4900, Headliner: 9900 };
/** 모든 크레딧 묶음이 모든 유료 구독보다 1크레딧이 비싼지(가격을 바꿀 때 확인용) */
export const PACKS_ABOVE_SUBS = PACK_IDS.every((id) => PACKS[id].amount / PACKS[id].credits > Math.max(PLAN_PRICE.Spotlight / PLANS.Spotlight.credits, PLAN_PRICE.Headliner / PLANS.Headliner.credits));
export const isPlanId = (v: string | null): v is PlanId => v === 'Opening' || v === 'Spotlight' || v === 'Headliner';

export const isPaidPlan = (plan: PlanId | undefined) => !!plan && plan !== 'Opening';

/** 리허설 예상 횟수(항상 '약'을 붙여 보여 줘요 — 예상치예요) */
export const approxRuns = (credits: number) => Math.floor(credits / CREDIT_PER_REHEARSAL);
/** 발표 준비 예상 개수(발표 하나 ≈ CREDIT_PER_TALK). 항상 '약'·'(예상)'을 붙여요 */
export const approxTalks = (credits: number) => Math.floor(credits / CREDIT_PER_TALK);
/** 요금제 한 줄 설명: 무료는 리허설 횟수(AI 코칭 없음), 유료는 발표 개수. 뒤에 '(예상)'·'예상'을 붙여 쓰세요 */
export const planUsage = (id: PlanId) => id === 'Opening'
  ? `리허설 약 ${approxRuns(PLANS[id].credits)}회`
  : `발표 약 ${approxTalks(PLANS[id].credits)}개 준비`;
const ratio = (a: number, b: number) => `${Math.round((a / b) * 10) / 10}`.replace(/\.0$/, '');
/** 유료 요금제가 아래 요금제보다 더 쓰는 것(요금제 카드 뱃지) */
export const PLAN_PERKS: Record<PlanId, string[]> = {
  Opening: [],
  Spotlight: [`무료의 ${ratio(PLANS.Spotlight.credits, PLANS.Opening.credits)}배 크레딧`, 'AI 대본 코칭', '회차별 비교'],
  Headliner: [`Spotlight의 ${ratio(PLANS.Headliner.credits, PLANS.Spotlight.credits)}배 크레딧`, 'AI 대본 코칭', '리포트 PDF'],
};
