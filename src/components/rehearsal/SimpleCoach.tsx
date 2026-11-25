'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { analyzeScript } from '@/lib/coach/script';
import { purposeOf, targetSecOf, type Draft } from '@/lib/rehearsal/draft';
import { fmtTime } from '@/lib/scenarios';

/**
 * 무료 요금제용 간단 코칭: AI 없이 브라우저 규칙으로 가장 중요한 것 3가지만, 항상 근거와 함께.
 * 자세한 대본 점검(흐름·읽기 가이드)과 AI 코칭은 요금제를 올리면 받을 수 있다고 안내해요.
 */
export function SimpleCoach({ draft }: { draft: Draft }) {
  const p = purposeOf(draft);
  const targetSec = targetSecOf(draft);
  const r = useMemo(() => analyzeScript(draft.script, { purpose: p, targetSec, keyMessage: draft.key.trim() }), [draft.script, draft.key, p, targetSec]);
  if (!r.stats.n) return null;
  const top = r.issues.slice(0, 3);
  return (
    <section className="simple-coach" aria-live="polite">
      <h3>간단 코칭 <small>{p.label} 기준</small></h3>
      <p className="sc-time">
        예상 <b>{fmtTime(r.stats.estSec)}</b> · 목표 {fmtTime(targetSec)}
        <span className="basis">근거: 대본 {r.stats.totalSyl}음절 ÷ 분당 {Math.round(r.stats.spm ?? 0)}음절(이 상황의 적정 속도) + 문장 사이 쉼</span>
      </p>
      {top.length ? (
        <ol>
          {top.map((x, k) => (
            <li key={k} data-sev={x.sev}>
              <b>{x.title}</b>
              <p>{x.detail}</p>
              {x.basis && <p className="basis">근거: {x.basis}</p>}
            </li>
          ))}
        </ol>
      ) : <p className="sc-good">{r.good[0] ?? '큰 문제는 보이지 않아요.'}</p>}
      <p className="sc-up">
        요금제를 올리면 <b>AI 코칭</b>으로 대본을 먼저 이해한 뒤 고칠 문장을 고쳐 쓰고, 문장마다 어떻게 말할지(쉬기·강조·가리키기·시선)까지 받을 수 있어요.{' '}
        <Link href="/me/plan?pick=Spotlight&from=wizard">요금제 보기</Link>
      </p>
    </section>
  );
}
