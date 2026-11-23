'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { listRehearsals } from '@/lib/data/rehearsals';
import type { Rehearsal } from '@/lib/data/types';
import { PURPOSE_BY_ID } from '@/lib/scenarios';

const coverOf = (n: number | null) => (n === null ? 4 : n >= 80 ? 3 : n >= 55 ? 2 : 4);

/**
 * 최근 리허설. 다시 찾아온 사용자는 히어로 바로 아래(top)에서, 처음 온 사람은 CTA 위(bottom)에서 봐요.
 * 같은 컴포넌트를 두 자리에 두고 한쪽만 그려요.
 */
export function RecentRehearsals({ slot }: { slot: 'top' | 'bottom' }) {
  const { user, ready, openAuth } = useAuth();
  const [got, setGot] = useState<{ uid: string; rows: Rehearsal[] } | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    listRehearsals().then((r) => { if (live) setGot({ uid: user.id, rows: r.slice(0, 5) }); }).catch(() => { if (live) setGot({ uid: user.id, rows: [] }); });
    return () => { live = false; };
  }, [user]);
  const rows = user && got?.uid === user.id ? got.rows : null;

  if (!ready) return null;
  const top = !!user && !!rows?.length;
  if ((slot === 'top') !== top) return null;

  return (
    <section className="block" id="recentBlock">
      <h2 className="h2 rv">{user ? `${user.name}님의 최근 리허설` : '최근 리허설'}</h2>
      <ul className="group recent rv">
        {!user && (
          <li className="cell cell-login">
            <span className="cell-t"><b>로그인하고 기록을 모아 보세요</b><small>리허설할 때마다 점수가 쌓이고, 같은 상황의 지난 리허설과 비교해 드려요.</small></span>
            <button type="button" className="btn" onClick={() => openAuth({ mode: 'in' })}>로그인</button>
          </li>
        )}
        {user && rows && !rows.length && <li className="cell cell-empty">아직 리허설 기록이 없어요. 첫 리허설을 시작해 보세요.</li>}
        {rows?.map((h) => {
          const p = PURPOSE_BY_ID[h.purpose_id];
          return (
            <li key={h.id} className="cell">
              <span className={`cover cover-${coverOf(h.overall)}`}>{h.overall ?? '–'}</span>
              <span className="cell-t">
                <b>{h.topic || p?.label || '발표'}</b>
                <small>{p?.label ?? ''} · {h.posture === 'standing' ? '서서' : '앉아서'} · {new Date(h.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</small>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
