'use client';
import { useEffect, useRef } from 'react';

/**
 * 화면 전환 모션(예전 버전의 show() 를 옮긴 것).
 * - <main> 바로 아래 .screen 이 새 요소로 바뀌면(페이지 이동, 마법사 → 녹화 → 리포트 등)
 *   색 조각이 화면을 쓸고 지나가고(.wipe), 새 화면이 살짝 떠오르며 나타나요(.screen[data-enter]).
 * - 같은 .screen 안에서 내용만 바뀌는 경우(/me 탭 이동 등)는 건드리지 않아요.
 * - 처음 열 때와 "불러오는 중" 자리표시(data-instant)에서 넘어올 때는 쓸기 없이 등장만 해요.
 * className 은 React 가 관리해서 data 속성으로만 상태를 바꿔요.
 */
export function ScreenTransition() {
  const wipeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const main = document.querySelector('main');
    const wipe = wipeRef.current;
    if (!main || !wipe) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let n = 0;
    let current: Element | null = null;
    let prevInstant = true; // 처음 화면은 쓸기 없이

    const restart = (el: HTMLElement, attr: string, value = '') => {
      el.removeAttribute(attr);
      void el.offsetWidth; // 애니메이션을 처음부터 다시 돌리려고 레이아웃을 한 번 읽어요
      el.setAttribute(attr, value);
    };

    const check = () => {
      const screen = main.querySelector<HTMLElement>(':scope > .screen');
      if (!screen || screen === current) return;
      const first = prevInstant;
      current = screen;
      prevInstant = screen.hasAttribute('data-instant');
      if (prevInstant) return; // 자리표시는 등장 모션도 없이 바로 보여요
      restart(screen, 'data-enter', first ? 'first' : '');
      if (first || reduce) return;
      wipe.dataset.v = String(n++ % 3);
      restart(wipe, 'data-go');
    };

    check();
    const mo = new MutationObserver(check);
    mo.observe(main, { childList: true });
    return () => mo.disconnect();
  }, []);

  return (
    <div ref={wipeRef} className="wipe" aria-hidden="true">
      <i className="art-1" />
      <i className="art-3" />
      <i className="art-2" />
    </div>
  );
}
