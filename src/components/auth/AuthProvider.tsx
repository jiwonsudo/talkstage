'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { rememberLogin } from '@/lib/auth/lastLogin';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/lib/nav';
import { getSupabase } from '@/lib/supabase/client';
import { supabaseReady } from '@/lib/supabase/config';
import { fetchProfile } from '@/lib/data/profile';
import type { Profile } from '@/lib/data/types';
import { AuthDialog, type AuthMode } from './AuthDialog';

type OpenOpts = { mode?: AuthMode; reason?: string; next?: string };
type AuthCtx = {
  configured: boolean;
  ready: boolean;
  user: Profile | null;
  openAuth: (opts?: OpenOpts) => void;
  /**
   * 로그인한 상태면 바로 실행하고, 아니면 로그인 창을 띄운 뒤 로그인하면 이어서 실행해요.
   * next: 소셜 로그인처럼 페이지를 떠났다 돌아오는 경우 돌아올 주소(이때는 fn 대신 이 주소에서 이어가요).
   */
  requireAuth: (fn: () => void, reason?: string, next?: string) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth 는 AuthProvider 안에서 써야 해요.');
  return c;
};

const DEFAULT_REASON = '리허설을 시작하려면 로그인해 주세요. 계정이 없으면 회원가입 탭에서 바로 만들 수 있어요.';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [user, setUser] = useState<Profile | null>(null);
  const [ready, setReady] = useState(!supabaseReady);
  const [dlg, setDlg] = useState<(OpenOpts & { open: boolean })>({ open: false });
  const pending = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data: { user: u } } = await sb.auth.getUser();
    if (!u) { setUser(null); setReady(true); return; }
    let name = (u.email ?? '').split('@')[0];
    const providers: string[] = u.app_metadata?.providers ?? (u.app_metadata?.provider ? [u.app_metadata.provider] : []);
    const hasPassword = providers.includes('email');
    const social = providers.includes('kakao') ? 'kakao' : providers.includes('google') ? 'google' : null;
    try {
      const p = await fetchProfile(u.id);
      name = p.name || name;
      setUser({ id: u.id, email: u.email ?? '', name, plan: p.plan, hasPassword, social });
    } catch {
      setUser({ id: u.id, email: u.email ?? '', name, plan: 'Opening', hasPassword, social });
    }
    rememberLogin({ email: u.email ?? '', name, provider: u.app_metadata?.provider });
    setReady(true);
  }, []);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    // 구독하면 INITIAL_SESSION 이 곧바로 와서 처음 불러오기도 여기서 해요.
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') load();
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  // proxy 가 보낸 ?login=1&next=/... 이면 로그인 창을 열어요. 한 번 닫으면 같은 주소에서는 다시 열지 않아요.
  const urlKey = params.get('login') === '1' ? params.toString() : null;
  const [urlHandled, setUrlHandled] = useState<string | null>(null);
  const urlOpen = !!urlKey && urlKey !== urlHandled && ready && !user && !dlg.open;
  const shown: OpenOpts & { open: boolean } = urlOpen
    ? {
      open: true, mode: 'in', next: params.get('next') ?? undefined,
      reason: params.get('error') === 'cancelled'
        ? '소셜 로그인을 취소했어요. 다른 방법으로 계속하거나 다시 시도해 주세요.'
        : params.get('error')
          ? '소셜 로그인을 마치지 못했어요. 잠시 뒤 다시 시도하거나 이메일로 로그인해 주세요.'
          : '이 화면은 로그인한 뒤에 볼 수 있어요.',
    }
    : dlg;

  const openAuth = useCallback((opts: OpenOpts = {}) => {
    if (!opts.reason) pending.current = null;
    setDlg({ open: true, ...opts });
  }, []);

  const requireAuth = useCallback((fn: () => void, reason = DEFAULT_REASON, next?: string) => {
    if (user) { fn(); return; }
    pending.current = fn;
    setDlg({ open: true, mode: 'in', reason, next });
  }, [user]);

  const onSignedIn = useCallback(async () => {
    await load();
    setDlg((d) => ({ ...d, open: false }));
    const fn = pending.current; pending.current = null;
    if (fn) setTimeout(fn, 260);
    else if (shown.next) router.push(shown.next);
    setUrlHandled(urlKey);
  }, [load, shown.next, router, urlKey]);

  const signOut = useCallback(async () => {
    await getSupabase()?.auth.signOut();
    setUser(null);
    router.push('/');
  }, [router]);

  return (
    <Ctx.Provider value={{ configured: supabaseReady, ready, user, openAuth, requireAuth, signOut, refresh: load }}>
      {children}
      <AuthDialog
        open={shown.open}
        mode={shown.mode ?? 'in'}
        reason={shown.reason}
        next={shown.next}
        onClose={() => { pending.current = null; setUrlHandled(urlKey); setDlg((d) => ({ ...d, open: false })); }}
        onSignedIn={onSignedIn}
      />
    </Ctx.Provider>
  );
}
