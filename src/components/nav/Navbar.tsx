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
  // 이 탭에서 앱 안 이동이 몇 번 있었는지(처음 그린 화면은 빼요). 0이면 뒤로 갈 앱 안 화면이 없어요.
  // (개발 모드는 effect 를 두 번 돌려서 횟수 대신 주소가 바뀌었는지로 세요)
  const moved = useRef(0);
  const lastPath = useRef(pathname);
  useEffect(() => { if (lastPath.current !== pathname) { lastPath.current = pathname; moved.current++; } }, [pathname]);
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
  // 홈: 로그인했으면 내 리허설(대시보드), 아니면 랜딩
  // 홈(로그인했으면 대시보드)에서는 뒤로·홈 버튼을 둘 다 숨겨요
  const home = user ? '/me/rehearsals' : '/';
  // 뒤로: 앱 안에서 옮겨 다닌 기록이 있으면 바로 전 화면으로. 기록이 없을 때만(주소로 바로 들어옴, 결제창에서 돌아옴) 갈 만한 곳으로.
  // 홈은 옆의 집 버튼으로 따로 가요.
  const back = () => {
    const sp = new URLSearchParams(location.search);
    const wizardStep = pathname === '/rehearsal/new' && (Number(sp.get('step')) > 0 || !!sp.get('view'));
    if (moved.current > 0 || wizardStep) { router.back(); return; }
    router.push(pathname.startsWith('/me/pay') || pathname.startsWith('/me/subscribe') ? '/me/plan' : home);
  };

  return (
    <header className="navbar" data-screen={onLanding ? 'home' : 'page'} data-brand={!onLanding && pathname === home ? '' : undefined}>
      {/* 대시보드(로그인 홈)에선 화면 제목 대신 로고만 */}
      <Link className="brand" href={home} aria-label={user ? 'Talkstage · 내 리허설' : 'Talkstage 홈'}><BrandMark /><span>Talkstage</span></Link>
      <div className="nav-l">
        {!onLanding && pathname !== home && (
          <button type="button" className="nav-btn" onClick={back}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            <span className="sr">뒤로</span>
          </button>
        )}
        {!onLanding && pathname !== home && (
          <Link href={home} className="nav-btn nav-home" aria-label={user ? '내 리허설로' : '홈으로'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5M5.5 8.5V20h13V8.5M10 20v-6h4v6" /></svg>
          </Link>
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
                  <em>{user.plan}{credits?.status === 'ok' ? ` · 남은 크레딧 ${credits.left}${credits.bonus ? '' : `/${credits.total}`}` : ''}</em>
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
