'use client';
import { useEffect, useState } from 'react';
import { CREDIT_PER_REHEARSAL, PLANS } from '@/lib/plans';
import { countRehearsalsSince } from './rehearsals';
import type { Profile } from './types';

export const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };

/** 이번 달 남은 크레딧. 불러오기 전이거나 로그아웃 상태면 null. */
export function useCreditsLeft(user: Profile | null) {
  const [got, setGot] = useState<{ key: string; left: number } | null>(null);
  const key = user ? `${user.id}:${user.plan}` : null;
  useEffect(() => {
    if (!user) return;
    let live = true;
    const k = `${user.id}:${user.plan}`;
    countRehearsalsSince(monthStart())
      .then((n) => { if (live) setGot({ key: k, left: Math.max(0, PLANS[user.plan].credits - n * CREDIT_PER_REHEARSAL) }); })
      .catch(() => { if (live) setGot({ key: k, left: PLANS[user.plan].credits }); });
    return () => { live = false; };
  }, [user]);
  return got && got.key === key ? got.left : null;
}
