'use client';
import { Picto } from '@/components/ui/Picto';
import { PURPOSES, fmtMin } from '@/lib/scenarios';
import { useStartRehearsal } from './actions';

const ART_OF: Record<string, number> = { interview: 1, ir: 3, report: 2, lecture: 4, conference: 7, capstone: 6, speech: 5 };

/** 발표 상황 고르기: 고르면 로그인 확인 뒤 그 상황으로 새 리허설을 열어요. */
export function ScenarioGrid() {
  const start = useStartRehearsal();
  return (
    <div className="scen-grid">
      {PURPOSES.map((p) => (
        <button key={p.id} type="button" className={`pcard art-${ART_OF[p.id] ?? 2}`} onClick={() => start(p.id)}>
          <span className="pc-time">{fmtMin(p.targetSec)}</span>
          <b>{p.label}</b><small>{p.summary}</small>
          <span className="pc-go" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7" /></svg></span>
          <Picto name={p.id} />
        </button>
      ))}
    </div>
  );
}
