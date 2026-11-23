'use client';
import Link from 'next/link';
import { GearIcon } from '@/components/ui/GearIcon';
import { usePathname } from 'next/navigation';
import { useRouter } from '@/lib/nav';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { BrandMark } from '@/components/ui/BrandMark';
import { useCredits } from '@/lib/data/useCredits';

const MENU = [
  { href: '/me/rehearsals', label: '내 리허설' },
  { href: '/me/account', label: '계정 관리' },
  { href: '/me/plan', label: '요금제 관리' },
  { href: '/me/support', label: '지원 받기' },
  { href: '/me/settings', label: '설정', icon: true },
];

const TITLES: Record<string, string> = {
  '/rehearsal/new': '새 리허설',
  '/me/rehearsals': '내 리허설',
  '/me/account': '계정 관리',
  '/me/plan': '요금제 관리',
  '/me/support': '지원 받기',
  '/me/settings': '설정',
};

export function Navbar() {
  const { user, openAuth, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = useCallback((v: boolean | ((o: boolean) => boolean)) => setOpenAt((cur) => ((typeof v === 'function' ? v(cur === pathname) : v) ? pathname : null)), [pathname]);
  const wrap = useRef<HTMLDivElement>(null);
  const credits = useCredits(user);

  const onLanding = pathname === '/';
  const title = Object.entries(TITLES).find(([p]) => pathname.startsWith(p))?.[1] ?? '';

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open, setOpen]);

  const start = () => router.push('/rehearsal/new');
  // 내 정보(/me) 화면 사이에서는 기록이 쌓이지 않게, 뒤로는 바로 홈으로 가요. 리허설 설정은 이전 단계로 가요.
  // /me 화면과 새 리허설 첫 단계(발표 목적 고르기)에서는 홈으로, 그 밖에는 이전 화면(설정 단계)으로 가요.
  const back = () => {
    const sp = new URLSearchParams(location.search);
    const firstStep = pathname === '/rehearsal/new' && !Number(sp.get('step')) && !sp.get('view');
    if (pathname.startsWith('/me') || firstStep) router.push('/'); else router.back();
  };

  return (
    <header className="navbar" data-screen={onLanding ? 'home' : 'page'}>
      <Link className="brand" href="/" aria-label="Talkstage 홈"><BrandMark /><span>Talkstage</span></Link>
      <div className="nav-l">
        {!onLanding && (
          <button type="button" className="nav-btn" onClick={back}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            <span className="sr">뒤로</span>
          </button>
        )}
      </div>
      <div className="nav-title">{title}</div>
      <div className="nav-r">
        {!user ? (
          <>
            <button type="button" className="nav-link" onClick={start}>리허설 시작</button>
            <button type="button" className="nav-login" onClick={() => openAuth({ mode: 'in', next: '/me/rehearsals' })}>로그인</button>
          </>
        ) : (
          <div className="account" ref={wrap}>
            <button type="button" className="nav-cta" onClick={start}>
              새 리허설<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <button type="button" className="menu-btn" aria-haspopup="menu" aria-expanded={open} aria-label="계정 메뉴" onClick={() => setOpen((o) => !o)}>
              <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
            {open && (
              <div className="menu" role="menu">
                <p className="menu-h">
                  <b>{user.name}</b><small>{user.email}</small>
                  <em>{user.plan}{credits?.status === 'ok' ? ` · 남은 크레딧 ${credits.left}/${credits.total}` : ''}</em>
                </p>
                {MENU.map((m, i) => (
                  <span key={m.href} className="menu-row">
                    {(i === 1 || i === 4) && <hr />}
                    <Link role="menuitem" href={m.href} className={m.icon ? 'menu-ico' : undefined} aria-current={pathname === m.href ? 'page' : undefined}>{m.icon && <GearIcon />}{m.label}</Link>
                  </span>
                ))}
                <hr />
                <button type="button" role="menuitem" className="menu-danger" onClick={() => { setOpen(false); signOut(); }}>로그아웃</button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
