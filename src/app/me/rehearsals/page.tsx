'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listRehearsals, deleteRehearsal } from '@/lib/data/rehearsals';
import type { Rehearsal } from '@/lib/data/types';
import { PURPOSE_BY_ID, fmtTime } from '@/lib/scenarios';
import { useToast } from '@/components/ui/Toast';

const coverOf = (n: number | null) => (n === null ? 4 : n >= 80 ? 3 : n >= 55 ? 2 : 4);

export default function MyRehearsals() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Rehearsal[] | null>(null);

  useEffect(() => {
    listRehearsals().then(setRows).catch(() => { setRows([]); toast('기록을 불러오지 못했어요.'); });
  }, [toast]);

  async function remove(h: Rehearsal) {
    const name = h.topic || PURPOSE_BY_ID[h.purpose_id]?.label || '발표';
    if (!confirm(`‘${name}’ 기록을 지울까요? 되돌릴 수 없어요.`)) return;
    try { await deleteRehearsal(h.id); setRows((r) => r?.filter((x) => x.id !== h.id) ?? null); toast('기록을 지웠어요.'); }
    catch { toast('기록을 지우지 못했어요.'); }
  }

  return (
    <>
      <div className="hub-h">
        <h1 className="title1">내 리허설</h1>
        <button type="button" className="btn-fill btn-sm" onClick={() => router.push('/rehearsal/new')}>새 리허설 시작하기</button>
      </div>
      <p className="subtitle">지금까지 한 리허설이에요. 같은 설정으로 다시 하면 지난 점수와 비교해 드려요.</p>
      {rows === null ? null : rows.length ? (
        <ul className="group hub-list">
          {rows.map((h) => {
            const p = PURPOSE_BY_ID[h.purpose_id];
            return (
              <li key={h.id} className="cell">
                <span className={`cover cover-${coverOf(h.overall)}`}>{h.overall ?? '–'}</span>
                <span className="cell-t">
                  <b>{h.topic || p?.label || '발표'}</b>
                  <small>
                    {p?.label ?? ''} · {h.posture === 'standing' ? '서서' : '앉아서'}
                    {h.duration_sec ? ` · ${fmtTime(h.duration_sec)}` : ''} · {new Date(h.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </small>
                </span>
                <span className="hub-act">
                  <button type="button" className="btn-plain btn-sm" onClick={() => router.push(`/rehearsal/new?purpose=${h.purpose_id}&posture=${h.posture}&step=2`)}>다시 연습</button>
                  <button type="button" className="hub-del" aria-label="기록 삭제" onClick={() => remove(h)}>삭제</button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="hub-empty"><b>아직 리허설 기록이 없어요.</b><span>첫 리허설을 시작하면 여기에 쌓여요.</span></div>
      )}
    </>
  );
}
