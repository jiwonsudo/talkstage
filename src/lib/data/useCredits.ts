'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchCredits, REHEARSALS_CHANGED } from './rehearsals';
import type { Credits, Profile } from './types';

export type CreditsState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | ({ status: 'ok' } & Credits);

/**
 * 이번 달 크레딧 현황(서버 계산). 기록을 저장·삭제하거나 요금제가 바뀌면 다시 불러와요.
 * 못 불러오면 'error' — 이때는 녹화를 막아요(모르는 채로 꽉 찬 것처럼 보여 주지 않아요).
 * 로그아웃 상태면 null.
 */
export function useCredits(user: Profile | null): CreditsState | null {
  const [got, setGot] = useState<{ key: string; state: CreditsState } | null>(null);
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);
  const key = user ? `${user.id}:${user.plan}:${tick}` : null;

  useEffect(() => {
    if (!user) return;
    const k = `${user.id}:${user.plan}:${tick}`;
    let gen = 0; // 늦게 온 이전 결과는 버려요
    const load = () => {
      const g = ++gen;
      fetchCredits()
        .then((c) => { if (g === gen) setGot({ key: k, state: { status: 'ok', ...c } }); })
        .catch(() => { if (g === gen) setGot({ key: k, state: { status: 'error', retry } }); });
    };
    load();
    window.addEventListener(REHEARSALS_CHANGED, load);
    return () => { gen = -1; window.removeEventListener(REHEARSALS_CHANGED, load); };
  }, [user, tick, retry]);

  if (!user) return null;
  return got?.key === key ? got.state : { status: 'loading' };
}
