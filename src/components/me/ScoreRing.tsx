'use client';
import { useEffect, useState } from 'react';

/** 점수 구간: 80 이상 좋음(초록), 55 이상 보통(노랑), 그 아래 연습 필요(빨강) */
const bandOf = (v: number) => (v >= 80 ? { k: 'good', t: '좋음' } : v >= 55 ? { k: 'mid', t: '보통' } : { k: 'low', t: '연습 필요' });

/** 점수만큼 차는 원형 게이지. 처음 보일 때 0에서 차올라요. */
export function ScoreRing({ value, size = 104 }: { value: number; size?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(value)); return () => cancelAnimationFrame(id); }, [value]);
  const sw = 10, r = (size - sw) / 2, c = 2 * Math.PI * r;
  const b = bandOf(value);
  return (
    <div className={`ring ring-${b.k}`} style={{ width: size, height: size }} role="img" aria-label={`${value}점, ${b.t}`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={sw} />
        <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} strokeWidth={sw}
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, shown)) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span>{b.t}</span>
    </div>
  );
}
