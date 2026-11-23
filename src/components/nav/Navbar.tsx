'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { PLANS } from '@/lib/plans';
import { useCreditsLeft } from '@/lib/data/useCredits';

const MENU = [
  { href: '/me/rehearsals', label: '내 리허설' },
  { href: '/me/account', label: '계정 관리' },
  { href: '/me/plan', label: '요금제 관리' },
  { href: '/me/support', label: '지원 받기' },
];

const TITLES: Record<string, string> = {
  '/rehearsal/new': '새 리허설',
  '/me/rehearsals': '내 리허설',
  '/me/account': '계정 관리',
  '/me/plan': '요금제 관리',
  '/me/support': '지원 받기',
};

export function BrandMark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M1 15A14 14 0 0 1 15 1V15Z" className="mq q1" />
      <path d="M17 1A14 14 0 0 1 31 15H17Z" className="mq q2" />
      <path d="M17 17H31A14 14 0 0 1 17 31Z" className="mq q3" />
      <rect x="1" y="17" width="14" height="14" rx="3" className="mq q4" />
    </svg>
  );
}

export function Navbar() {
  const { user, openAuth, requireAuth, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = useCallback((v: boolean | ((o: boolean) => boolean)) => setOpenAt((cur) => ((typeof v === 'function' ? v(cur === pathname) : v) ? pathname : null)), [pathname]);
  const wrap = useRef<HTMLDivElement>(null);
  const left = useCreditsLeft(user);

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

  const start = () => requireAuth(() => router.push('/rehearsal/new'));
  const plan = user ? PLANS[user.plan] : null;

  return (
    <header className="navbar" data-screen={onLanding ? 'home' : 'page'}>
      <Link className="brand" href="/" aria-label="Talkstage 홈"><BrandMark /><span>Talkstage</span></Link>
      <div className="nav-l">
        {!onLanding && (
          <button type="button" className="nav-btn" onClick={() => router.back()}>
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
            <button type="button" className="nav-login" onClick={() => openAuth({ mode: 'in' })}>로그인</button>
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
                  <em>{user.plan}{plan && left !== null ? ` · 남은 크레딧 ${left}/${plan.credits}` : ''}</em>
                </p>
                {MENU.map((m) => (
                  <Link key={m.href} role="menuitem" href={m.href} aria-current={pathname === m.href ? 'page' : undefined}>{m.label}</Link>
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
