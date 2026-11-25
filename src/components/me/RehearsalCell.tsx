import type { Rehearsal } from '@/lib/data/types';
import { PURPOSE_BY_ID, fmtTime } from '@/lib/scenarios';

/** 점수에 따라 표지 색: 80 이상 노랑, 55 이상 파랑, 그 밖은 초록 */
export const coverOf = (n: number | null) => (n === null ? 4 : n >= 80 ? 3 : n >= 55 ? 2 : 4);

/** 리허설 기록 한 줄(점수 표지 · 제목 · 상황/자세/길이/날짜). 오른쪽 버튼은 children 으로 받아요. */
export function RehearsalCell({ h, label, children }: { h: Rehearsal; /** 제목 대신 보여 줄 이름(예: 3회차) */ label?: string; children?: React.ReactNode }) {
  const p = PURPOSE_BY_ID[h.purpose_id];
  return (
    <li className="cell">
      <span className={`cover cover-${coverOf(h.overall)}`}>{h.overall ?? '–'}</span>
      <span className="cell-t">
        <b>{label ?? (h.topic || p?.label || '발표')}</b>
        <small>
          {p?.label ?? ''} · {h.posture === 'standing' ? '서서' : '앉아서'}{h.mode === 'voice' ? ' · 음성만' : ''}
          {h.duration_sec ? ` · ${fmtTime(h.duration_sec)}` : ''} · {new Date(h.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
        </small>
      </span>
      {children}
    </li>
  );
}
