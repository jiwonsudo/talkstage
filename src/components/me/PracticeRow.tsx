import Link from 'next/link';
import { PURPOSE_BY_ID } from '@/lib/scenarios';
import { practiceHref, type Practice } from '@/lib/data/groups';
import { coverOf } from './RehearsalCell';

/** 회차 점수 작은 선(마지막 점만 강조). 점수가 하나면 점 하나. */
function Spark({ g }: { g: Practice }) {
  const v = g.runs.map((r) => r.overall).filter((x): x is number => x !== null).slice(-8);
  if (!v.length) return null;
  const W = 84, H = 30, x = (i: number) => (v.length < 2 ? W - 4 : 4 + (i * (W - 8)) / (v.length - 1)), y = (n: number) => 4 + ((100 - n) * (H - 8)) / 100;
  return (
    <svg className="pr-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      {v.length > 1 && <polyline points={v.map((n, i) => `${x(i)},${y(n)}`).join(' ')} />}
      <circle cx={x(v.length - 1)} cy={y(v.at(-1)!)} r="3.5" />
    </svg>
  );
}

/** 대시보드의 발표 한 줄: 최근 점수 · 제목 · 회차 · 작은 흐름 → 발표 화면으로 */
export function PracticeRow({ g }: { g: Practice }) {
  const p = PURPOSE_BY_ID[g.last.purpose_id];
  const first = g.runs.find((r) => r.overall !== null)?.overall ?? null;
  const diff = first !== null && g.last.overall !== null && g.runs.length > 1 ? g.last.overall - first : null;
  return (
    <li>
      <Link href={practiceHref(g.title)} className="pr-row">
        <span className={`cover cover-${coverOf(g.last.overall)}`}>{g.last.overall ?? '–'}</span>
        <span className="cell-t">
          <b>{g.title}</b>
          <small>{p?.label ?? ''} · {g.runs.length}회 연습 · {new Date(g.last.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</small>
        </span>
        {diff !== null && diff !== 0 && <span className={`pr-diff ${diff > 0 ? 'is-up' : 'is-down'}`}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff)}</span>}
        <Spark g={g} />
        <svg className="pr-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </Link>
    </li>
  );
}
