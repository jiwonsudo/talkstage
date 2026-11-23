'use client';
import { useId } from 'react';

/**
 * Talkstage 로고: 네 조각으로 갈라진 말풍선. 조각마다 풍선처럼 부푼 광택을 줘요.
 * - 조각 바탕: 왼쪽 위가 밝고 가장자리로 갈수록 깊어지는 방사형 그라디언트
 * - 하이라이트: 왼쪽 위에서 빛이 비친 듯한 흰 반사광(큰 타원 + 작은 점)
 * 조각과 반사광을 한 그룹(.mq)으로 묶어서, 마우스를 올리면 갈라질 때 같이 움직여요.
 * 한 화면에 로고가 여러 개 있어도 그라디언트 id 가 겹치지 않게 useId 를 써요.
 */
const PIECES = [
  { k: 'q1', color: 'var(--blue)', d: 'M1 15A14 14 0 0 1 15 1V15Z', glint: { cx: 7.6, cy: 6.6, rx: 3.6, ry: 2, rot: -40 }, dot: { cx: 4.6, cy: 11.2, r: 0.9 } },
  { k: 'q2', color: 'var(--yellow)', d: 'M17 1A14 14 0 0 1 31 15H17Z', glint: { cx: 21.4, cy: 4.9, rx: 3.2, ry: 1.7, rot: 8 }, dot: { cx: 27.6, cy: 8.8, r: 0.8 } },
  { k: 'q3', color: 'var(--pink)', d: 'M17 17H31A14 14 0 0 1 17 31Z', glint: { cx: 21.6, cy: 20.4, rx: 3.4, ry: 1.7, rot: 0 }, dot: { cx: 19.4, cy: 26.6, r: 0.8 } },
  { k: 'q4', color: 'var(--red)', d: 'M4 17H12A3 3 0 0 1 15 20V28A3 3 0 0 1 12 31H4A3 3 0 0 1 1 28V20A3 3 0 0 1 4 17Z', glint: { cx: 6.4, cy: 20.4, rx: 3.6, ry: 1.7, rot: 0 }, dot: { cx: 3.6, cy: 26.4, r: 0.8 } },
] as const;

export function BrandMark({ className = 'mark' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        {PIECES.map((p) => (
          <radialGradient key={p.k} id={`${id}-${p.k}`} cx="0.32" cy="0.28" r="0.85" fx="0.3" fy="0.24">
            <stop offset="0" style={{ stopColor: `color-mix(in oklab, ${p.color} 55%, #fff)` }} />
            <stop offset="0.45" style={{ stopColor: p.color }} />
            <stop offset="1" style={{ stopColor: `color-mix(in oklab, ${p.color} 72%, #000)` }} />
          </radialGradient>
        ))}
        <radialGradient id={`${id}-glint`}>
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {PIECES.map(({ k, d, glint: g, dot }) => (
        <g key={k} className={`mq ${k}`}>
          <path d={d} fill={`url(#${id}-${k})`} />
          <ellipse cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry} transform={`rotate(${g.rot} ${g.cx} ${g.cy})`} fill={`url(#${id}-glint)`} />
          <circle cx={dot.cx} cy={dot.cy} r={dot.r} fill="#fff" opacity="0.55" />
        </g>
      ))}
    </svg>
  );
}
