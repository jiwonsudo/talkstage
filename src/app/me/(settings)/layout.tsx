'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GearIcon } from '@/components/ui/GearIcon';

// 설정 화면들. 넓은 화면에서는 왼쪽 사이드바, 좁은 화면에서는 숨기고 내비의 햄버거 메뉴(같은 항목)로 이동해요.
// 내 리허설은 사이드바 없는 대시보드(/me/rehearsals)로 따로 있어요.
// 계정 묶음과 설정을 구분선으로 나눠요(내비 메뉴와 같은 순서).
const GROUPS: { title?: string; links: { href: string; label: string; icon?: boolean }[] }[] = [
  { title: '계정', links: [
    { href: '/me/account', label: '계정 관리' },
    { href: '/me/plan', label: '요금제·크레딧 관리' },
    { href: '/me/billing', label: '결제 관리' },
    { href: '/me/support', label: '지원 받기' },
  ] },
  { links: [{ href: '/me/settings', label: '설정', icon: true }] },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  // 지금 페이지를 가리키는 흰 칩을 해당 메뉴 위치로 옮겨요(처음엔 바로, 그다음부터는 미끄러지듯).
  // 스타일은 React 가 관리하지 않는 장식 요소에만 직접 써요.
  useLayoutEffect(() => {
    const place = () => {
      const n = nav.current, p = pill.current;
      const a = n?.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!n || !p) return;
      if (!a) { p.style.opacity = '0'; return; }
      p.style.opacity = '1';
      p.style.transform = `translateY(${a.offsetTop}px)`;
      p.style.height = `${a.offsetHeight}px`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [pathname]);
  useEffect(() => {
    const id = requestAnimationFrame(() => { if (pill.current) pill.current.dataset.ready = ''; });
    return () => cancelAnimationFrame(id);
  }, []);

  let i = 0; // 처음 열 때 위에서부터 차례로 나타나게 하는 순번
  return (
    <div className="page hub">
      <nav ref={nav} className="hub-side" aria-label="설정">
        <span ref={pill} className="hub-pill" aria-hidden="true" />
        {GROUPS.map((g, gi) => (
          <div key={gi} className="hub-group">
            {g.title && <p style={{ '--i': i++ }}>{g.title}</p>}
            {g.links.map((t) => (
              <Link key={t.href} href={t.href} className={t.icon ? 'hub-ico' : undefined} style={{ '--i': i++ }} aria-current={pathname === t.href ? 'page' : undefined}>
                {t.icon && <GearIcon />}{t.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="hub-main">
        {/* 페이지를 바꾸면 본문이 살짝 올라오며 나타나요 */}
        <div key={pathname} className="hub-page">{children}</div>
      </div>
    </div>
  );
}
