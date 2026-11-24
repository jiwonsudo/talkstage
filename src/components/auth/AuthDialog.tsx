'use client';
import { SegPill } from '@/components/ui/SegPill';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getSupabase } from '@/lib/supabase/client';
import { supabaseReady } from '@/lib/supabase/config';
import { PatternArt } from '@/components/ui/PatternArt';

export type AuthMode = 'in' | 'up';

const DEFAULT_SUB = '리허설 기록을 계정에 모으고 지난 리허설과 비교해요.';

/** Supabase 오류 문구를 사용자가 읽을 한국어로 바꿔요. */
function friendly(message: string) {
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 맞지 않아요.';
  if (/already registered|already exists/i.test(message)) return '이미 가입된 이메일이에요. 로그인해 주세요.';
  if (/email not confirmed/i.test(message)) return '메일함에서 인증 링크를 먼저 눌러 주세요.';
  if (/password/i.test(message) && /least|short|weak/i.test(message)) return '비밀번호는 8자 이상으로 정해 주세요.';
  if (/rate limit|too many/i.test(message)) return '잠시 뒤에 다시 시도해 주세요.';
  return '로그인하지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
}

type Props = {
  open: boolean;
  mode: AuthMode;
  reason?: string;
  next?: string;
  onClose: () => void;
  onSignedIn: () => void;
};

export function AuthDialog({ open, mode: initialMode, reason, next, onClose, onSignedIn }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pathname = usePathname();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setMode(initialMode); setErr(''); setNote(''); formRef.current?.reset();
      d.showModal();
      d.focus(); // 첫 포커스를 닫기 버튼이 아니라 창에(버튼 둘레 파란 테두리 방지)
    } else if (!open && d.open) {
      setClosing(true);
      setTimeout(() => { setClosing(false); d.close(); }, 220);
    }
  }, [open, initialMode]);

  const up = mode === 'up';

  // 오류가 나면 메시지를 띄우고 입력 폼을 좌우로 흔들어요(예전 버전의 shake).
  const fail = (msg: string) => {
    setErr(msg);
    const f = formRef.current;
    if (!f) return;
    delete f.dataset.shake;
    void f.offsetWidth;
    f.dataset.shake = '';
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    const f = new FormData(e.currentTarget);
    const email = String(f.get('email') ?? '').trim();
    const password = String(f.get('password') ?? '');
    const name = String(f.get('name') ?? '').trim();
    setErr(''); setNote('');
    if (up && !name) { fail('이름을 입력해 주세요.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fail('이메일 형식을 확인해 주세요.'); return; }
    if (password.length < 8) { fail('비밀번호는 8자 이상으로 정해 주세요.'); return; }
    setBusy(true);
    try {
      if (up) {
        const { data, error } = await sb.auth.signUp({
          email, password,
          options: { data: { name }, emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next ?? pathname)}` },
        });
        if (error) throw error;
        // 이메일 인증을 켜 두면 세션 없이 돌아와요.
        if (!data.session) { setNote(`${email}로 인증 메일을 보냈어요. 메일의 링크를 누르면 바로 시작할 수 있어요.`); return; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      onSignedIn();
    } catch (x) {
      fail(friendly((x as Error).message ?? ''));
    } finally {
      setBusy(false);
    }
  }

  async function social(provider: 'kakao' | 'google') {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next ?? pathname)}` },
    });
    if (error) fail(friendly(error.message));
  }

  return (
    <dialog
      ref={ref}
      className={`auth${closing ? ' closing' : ''}`}
      tabIndex={-1}
      aria-labelledby="authTitle"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="auth-art art-2" aria-hidden="true"><PatternArt /></div>
      <form ref={formRef} onSubmit={submit} noValidate>
        <button type="button" className="dlg-x" aria-label="닫기" onClick={onClose}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <h2 id="authTitle"><span key={mode} className="swap-in">{up ? '회원가입' : '로그인'}</span></h2>
        <p className="auth-sub">{reason ?? DEFAULT_SUB}</p>
        <div className="seg" role="tablist" aria-label="로그인 또는 회원가입">
          <button type="button" role="tab" aria-selected={!up} onClick={() => { setMode('in'); setErr(''); }}>로그인</button>
          <button type="button" role="tab" aria-selected={up} onClick={() => { setMode('up'); setErr(''); }}>회원가입</button>
          <SegPill />
        </div>
        {!supabaseReady && (
          <p className="soc-note">로그인 서버(Supabase)가 아직 연결되지 않았어요. <code>.env.local</code>에 프로젝트 URL과 공개 키를 넣어 주세요.</p>
        )}
        <div className="social" role="group" aria-label="소셜 계정으로 계속하기">
          <button type="button" className="soc soc-kakao" onClick={() => social('kakao')} disabled={!supabaseReady}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 6l-1 3.6c-.1.3.3.6.6.4l4.3-2.8c.3 0 .6.1.9.1 5 0 9-3.1 9-7s-4-7.3-9-7.3z" /></svg>카카오로 계속하기
          </button>
          <div className="soc-row">
            <button type="button" className="soc soc-google" onClick={() => social('google')} disabled={!supabaseReady}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23z" /><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.4V7H2.2a11 11 0 0 0 0 10z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.2-3.2A11 11 0 0 0 2.2 7l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4z" /></svg>Google로 계속하기
            </button>
          </div>
          <div className="or"><span>또는 이메일로</span></div>
        </div>
        {/* 회원가입일 때만 이름 칸이 부드럽게 펼쳐져요(높이·투명도 전환). 접히면 틈도 0 이 되게 이메일 칸과 한 묶음 */}
        <div className="fold-group">
          <div className="fold" data-open={up} aria-hidden={!up}>
            <div><label className="field"><span>이름</span><input name="name" autoComplete="name" placeholder="홍길동" disabled={!up} /></label></div>
          </div>
          <label className="field"><span>이메일</span><input name="email" type="email" autoComplete="email" placeholder="name@example.com" required /></label>
        </div>
        <label className="field"><span>비밀번호</span><input name="password" type="password" autoComplete={up ? 'new-password' : 'current-password'} placeholder="8자 이상" required /></label>
        <p className="auth-err" role="alert">{err}</p>
        {note && <p className="soc-note" role="status">{note}</p>}
        <button type="submit" className="btn-fill btn-block" disabled={busy || !supabaseReady}><span key={mode} className="swap-in">{up ? '가입하고 시작하기' : '로그인'}</span></button>
      </form>
    </dialog>
  );
}
