'use client';
import { useEffect, useState } from 'react';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabaseReady } from './config';

export type Social = 'kakao' | 'google';
type Enabled = Record<Social, boolean>;
let cache: Promise<Enabled> | null = null;

/**
 * Supabase 에 켜 둔 소셜 로그인. 꺼진 곳을 누르면 Supabase 의 JSON 오류 화면으로 가 버려서,
 * 켜지기 전에는 버튼을 "준비 중"으로 막아요. 못 불러오면(네트워크) 일단 켜진 걸로 봐요.
 */
export function useSocialEnabled(): Enabled | null {
  const [on, setOn] = useState<Enabled | null>(() => (supabaseReady ? null : { kakao: false, google: false }));
  useEffect(() => {
    if (!supabaseReady) return;
    cache ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { external?: Partial<Enabled> }) => ({ kakao: !!d.external?.kakao, google: !!d.external?.google }))
      .catch(() => { cache = null; return { kakao: true, google: true }; });
    let alive = true;
    cache.then((v) => { if (alive) setOn(v); });
    return () => { alive = false; };
  }, []);
  return on;
}
