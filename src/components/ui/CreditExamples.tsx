import { AI_COACH_TIERS } from '@/lib/coach/scriptCoach';
import { CREDIT_PER_REHEARSAL, CREDIT_PER_TALK } from '@/lib/plans';

// 크레딧을 살 때 "어떻게 쓰면 대략 얼마 드는지". 숫자는 plans.ts·scriptCoach.ts 에서 계산해요(손으로 적지 말 것).
const R = CREDIT_PER_REHEARSAL, AI5 = AI_COACH_TIERS[0].credits, AI15 = AI_COACH_TIERS[1].credits;
export const CREDIT_EXAMPLES: { what: string; how: string; credits: number }[] = [
  { what: '리허설 1번', how: '녹화 길이와 관계없이 같아요', credits: R },
  { what: '5분 발표 대본 AI 코칭 1번', how: AI_COACH_TIERS[0].label, credits: AI5 },
  { what: '발표 하나 준비', how: 'AI 코칭 1번 + 같은 발표 3~4번 연습', credits: CREDIT_PER_TALK },
  { what: '긴 발표(15분) 하나 준비', how: 'AI 코칭 1번 + 같은 발표 4번 연습', credits: AI15 + 4 * R },
];

export function CreditExamples() {
  return (
    <div className="cr-ex">
      <p className="cr-ex-h">이렇게 쓰면 대략 이만큼 들어요 <small>(예상)</small></p>
      <ul>
        {CREDIT_EXAMPLES.map((e) => (
          <li key={e.what}><span><b>{e.what}</b><small>{e.how}</small></span><em>{e.credits === R || e.credits === AI5 ? '' : '약 '}{e.credits}크레딧</em></li>
        ))}
      </ul>
    </div>
  );
}
