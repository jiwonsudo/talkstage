'use client';
import { useEffect } from 'react';

const SEL = '.rv, .r-hero, .r-sec, .hl, .cat, .pri';

/**
 * 스크롤해서 보이는 요소에 data-in 을 붙여 등장 모션을 켜요.
 * 나중에 그려지는 요소(최근 리허설 등)도 잡으려고 루트 아래 변화를 지켜봐요.
 */
export function Reveal({ root = 'main' }: { root?: string }) {
  useEffect(() => {
    document.documentElement.dataset.rvOn = ''; // layout 의 대비책(4초 뒤 data-js 떼기)을 꺼요
    const host = document.querySelector(root);
    if (!host) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) { (e.target as HTMLElement).dataset.in = ''; io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    // 이번 effect 에서 본 요소만 기억해요. DOM 에 표시를 남기면 개발 모드(StrictMode)에서
    // effect 가 두 번 돌 때 두 번째 실행이 요소를 건너뛰어 화면이 계속 투명하게 남아요.
    const seen = new WeakSet<Element>();
    const scan = () => host.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
      // className 은 React 가 관리해서 건드리지 않고 data 속성만 붙여요(하이드레이션 불일치 방지).
      if (seen.has(el) || 'in' in el.dataset) return;
      seen.add(el);
      if (!el.classList.contains('rv')) el.dataset.rv = '';
      if (reduce) el.dataset.in = ''; else io.observe(el);
    });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(host, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [root]);
  return null;
}
