import type { Rehearsal } from './types';
import { PURPOSE_BY_ID } from '@/lib/scenarios';

/** 기록의 제목. 예전 기록(제목 없음)은 상황 이름으로 묶어요. */
export const titleOf = (h: Rehearsal) => h.topic?.trim() || `${PURPOSE_BY_ID[h.purpose_id]?.label ?? '발표'} 리허설`;

export type Practice = {
  title: string;
  /** 오래된 회차 → 최근 회차 */
  runs: Rehearsal[];
  last: Rehearsal;
  best: number | null;
};

/** 같은 제목끼리 한 발표로 묶어요. 최근에 연습한 발표가 먼저. rows 는 최근 → 오래된 순. */
export function groupPractices(rows: Rehearsal[]): Practice[] {
  const m = new Map<string, Rehearsal[]>();
  for (const h of rows) { const t = titleOf(h); (m.get(t) ?? m.set(t, []).get(t)!).push(h); }
  return [...m].map(([title, rs]) => {
    const runs = [...rs].reverse();
    const sc = runs.map((r) => r.overall).filter((x): x is number => x !== null);
    return { title, runs, last: runs.at(-1)!, best: sc.length ? Math.max(...sc) : null };
  });
}

export const practiceHref = (title: string) => `/me/rehearsals/${encodeURIComponent(title)}`;
