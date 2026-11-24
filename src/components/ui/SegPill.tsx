'use client';
import { useLayoutEffect, useRef } from 'react';

/**
 * .seg 토글의 흰 알약. 고른 버튼(aria-selected / aria-checked = true) 자리로 미끄러져 가요.
 * .seg 안에 <SegPill /> 하나만 넣으면 돼요. 버튼 너비가 달라도(자동 너비) 맞춰 늘어나요.
 */
export function SegPill() {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const pill = ref.current, seg = pill?.parentElement;
    if (!pill || !seg) return;
    let first = true;
    const place = () => {
      const on = seg.querySelector<HTMLElement>(':scope > [aria-selected="true"], :scope > [aria-checked="true"]');
      if (!on || !seg.offsetWidth) return; // 닫힌 창 안이라 크기가 없으면 열릴 때 다시
      pill.style.transform = `translateX(${on.offsetLeft}px)`;
      pill.style.width = `${on.offsetWidth}px`;
      if (first) { first = false; void pill.offsetWidth; pill.dataset.ready = ''; } // 처음 자리 잡을 땐 미끄러지지 않게
    };
    place();
    const mo = new MutationObserver(place);
    mo.observe(seg, { subtree: true, attributes: true, attributeFilter: ['aria-selected', 'aria-checked'] });
    const ro = new ResizeObserver(place);
    ro.observe(seg);
    return () => { mo.disconnect(); ro.disconnect(); };
  }, []);
  return <span ref={ref} className="seg-pill" aria-hidden="true" />;
}
