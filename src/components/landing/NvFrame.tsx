'use client';
import { useEffect, useRef, useState } from 'react';

/** 소리 없이 재생하는 예시 영상. 파일이 없으면 '예시 영상 자리'를 보여 줘요. */
export function NvFrame({ src, children }: { src: string; children: React.ReactNode }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [has, setHas] = useState(false);
  useEffect(() => {
    const v = ref.current!;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <div className={`nv-frame${has ? ' has-video' : ''}`}>
      <video ref={ref} src={src} muted loop playsInline preload="metadata" onLoadedData={() => setHas(true)} onError={() => setHas(false)} />
      {children}
    </div>
  );
}
