'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { NAV_START } from '@/lib/nav';

/** 덮는 데 걸리는 시간(가장 늦은 조각 기준). 다음 화면이 더 빨리 와도 이만큼은 덮은 뒤 걷어요. */
const COVER_MS = 520;
/** 다음 화면이 끝내 안 오면(이동 취소 등) 이만큼 뒤 그냥 걷어요 */
const GIVE_UP_MS = 10000;

/**
 * 화면 전환 모션.
 * - 이동을 누르는 순간(링크 클릭, lib/nav 의 router.push) 색 조각이 바로 화면을 덮어요(data-go="in").
 *   다음 화면이 준비되면(새 .screen 이 붙거나 주소가 바뀌면) 조각이 걷히며 새 화면이 나타나요(data-go="out").
 *   그래서 다음 화면을 불러오는 동안의 빈 화면·로딩이 안 보여요. "불러오는 중" 자리표시(data-instant)는 덮인 채로 기다려요.
 * - 누르지 않고 화면이 바뀌는 경우(뒤로 가기, 마법사 → 녹화 → 리포트)는 예전처럼 한 번에 쓸고 지나가요(data-go="").
 * - /me 안에서 옮겨 다닐 때처럼 같은 .screen 안에서 내용만 바뀌면 건드리지 않아요.
 * className 은 React 가 관리해서 data 속성으로만 상태를 바꿔요.
 */
export function ScreenTransition() {
  const wipeRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const onRoute = useRef<(() => void) | null>(null);

  useEffect(() => {
    const main = document.querySelector('main');
    const wipe = wipeRef.current;
    if (!main || !wipe) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let n = 0;
    let current: Element | null = null;
    let prevInstant = true; // 처음 화면은 쓸기 없이
    let covering = false, coverAt = 0;
    let revealTimer = 0, giveUp = 0;

    const restart = (el: HTMLElement, attr: string, value = '') => {
      el.removeAttribute(attr);
      void el.offsetWidth; // 애니메이션을 처음부터 다시 돌리려고 레이아웃을 한 번 읽어요
      el.setAttribute(attr, value);
    };
    const screenNow = () => main.querySelector<HTMLElement>(':scope > .screen');

    // 덮은 상태에서 걷기. 덮는 모션이 끝나기 전이면 끝날 때까지 기다려요.
    const reveal = () => {
      if (!covering) return;
      const s = screenNow();
      if (!s || s.hasAttribute('data-instant')) return; // 자리표시는 덮인 채로 기다려요
      clearTimeout(revealTimer);
      revealTimer = window.setTimeout(() => {
        covering = false;
        clearTimeout(giveUp);
        const next = screenNow();
        current = next;
        prevInstant = false;
        if (next) restart(next, 'data-enter', 'cover');
        restart(wipe, 'data-go', 'out');
      }, Math.max(0, coverAt + COVER_MS - performance.now()));
    };

    const cover = (href: string) => {
      if (reduce || covering) return;
      let to: URL;
      try { to = new URL(href, location.href); } catch { return; }
      if (to.origin !== location.origin) return;
      if (to.pathname === location.pathname && to.search === location.search) return; // 같은 화면(해시 이동 등)
      if (to.pathname.startsWith('/me/') && location.pathname.startsWith('/me/')) return; // /me 안 이동은 내용만 바뀜
      covering = true;
      coverAt = performance.now();
      wipe.dataset.v = String(n++ % 3);
      restart(wipe, 'data-go', 'in');
      clearTimeout(giveUp);
      giveUp = window.setTimeout(() => { if (covering) { covering = false; restart(wipe, 'data-go', 'out'); } }, GIVE_UP_MS);
    };

    const check = () => {
      const screen = screenNow();
      if (!screen || screen === current) return;
      if (covering) { reveal(); return; } // 덮고 있던 중이면 걷기만
      const first = prevInstant;
      current = screen;
      prevInstant = screen.hasAttribute('data-instant');
      if (prevInstant) return; // 자리표시는 등장 모션도 없이 바로 보여요
      restart(screen, 'data-enter', first ? 'first' : '');
      if (first || reduce) return;
      wipe.dataset.v = String(n++ % 3);
      restart(wipe, 'data-go');
    };

    // 링크 클릭: 새 탭·다운로드·수정키 클릭은 빼고 같은 사이트 이동만
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      cover(a.href);
    };
    const onNav = (e: Event) => cover((e as CustomEvent<string>).detail);

    onRoute.current = reveal; // 주소가 바뀌면(같은 .screen 을 쓰는 화면으로 간 경우) 걷기
    check();
    const mo = new MutationObserver(check);
    mo.observe(main, { childList: true });
    document.addEventListener('click', onClick, true);
    window.addEventListener(NAV_START, onNav);
    return () => {
      mo.disconnect();
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(NAV_START, onNav);
      clearTimeout(revealTimer); clearTimeout(giveUp);
      onRoute.current = null;
    };
  }, []);

  // 주소가 바뀐 뒤 한 프레임 기다렸다가(새 화면이 그려질 시간) 걷어요
  useEffect(() => {
    const id = requestAnimationFrame(() => onRoute.current?.());
    return () => cancelAnimationFrame(id);
  }, [pathname, search]);

  return (
    <div ref={wipeRef} className="wipe" aria-hidden="true">
      <i className="art-1" />
      <i className="art-3" />
      <i className="art-2" />
    </div>
  );
}
