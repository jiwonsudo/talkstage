'use client';
import { useEffect, useRef } from 'react';

/** why 타임라인: 재생 헤드가 왼쪽에서 오른쪽으로 지나가며 지금 말하는 칸을 띄워요. */
export function Timeline({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tl = ref.current!;
    const head = tl.querySelector<HTMLElement>('.tl-head');
    if (!head || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // 칸 사이 간격까지 반영하려고 실제 위치(px)로 계산해요.
    const rows = [...tl.querySelectorAll<HTMLElement>('.tl-track')].map((tr) => ({ tr, clips: [...tr.children].map((c) => ({ c: c as HTMLElement, x: 0, w: 1 })) }));
    let trackW = 1;
    const measure = () => {
      trackW = rows[0].tr.clientWidth || 1;
      for (const r of rows) for (const k of r.clips) { k.x = k.c.offsetLeft; k.w = k.c.offsetWidth || 1; }
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(tl);
    let vis = false, t0 = 0, raf = 0;
    const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; }); io.observe(tl);
    const DUR = 9000, HOLD = 1400, FADE = 700;
    const loop = (now: number) => {
      if (vis && tl.hasAttribute('data-in')) {
        if (!t0) t0 = now + 900;
        const el = Math.max(0, now - t0) % (DUR + HOLD + FADE);
        const p = Math.min(1, el / DUR);
        tl.toggleAttribute('data-fading', el > DUR + HOLD);
        head.style.setProperty('--p', p.toFixed(4));
        head.style.opacity = el > DUR ? '0' : '1';
        const x = p * trackW;
        for (const r of rows) for (const k of r.clips) {
          const f = Math.max(0, Math.min(1, (x - k.x) / k.w));
          k.c.style.setProperty('--f', f.toFixed(3));
          k.c.classList.toggle('lit', f > 0.45);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);
  return <div ref={ref} id="tline" className={className} {...rest}>{children}</div>;
}
