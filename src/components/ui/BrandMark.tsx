'use client';
import { useId } from 'react';

/**
 * Talkstage 로고: 네 조각으로 갈라진 말풍선.
 * - 모서리: 왼쪽 아래 네모처럼 나머지 세 조각의 뾰족한 모서리도 반지름 3 으로 깎아요.
 * - 광택: 아주 약하게. 왼쪽 위가 살짝 밝고 가장자리가 살짝 깊은 그라디언트 + 옅은 반사광.
 * 조각과 반사광을 한 그룹(.mq)으로 묶어서, 마우스를 올리면 갈라질 때 같이 움직여요.
 * 한 화면에 로고가 여러 개 있어도 그라디언트 id 가 겹치지 않게 useId 를 써요.
 */
const R = 3; // 모서리 반지름
// 중심 (15,15), 반지름 14 인 왼쪽 위 사분원. 호의 양 끝에서 R 만큼 들어온 점.
const t = R / 14;
const ax = +(15 - 14 * Math.cos(t)).toFixed(2), ay = +(15 - 14 * Math.sin(t)).toFixed(2);

/** 왼쪽 위 조각을 기준으로 좌우·상하 뒤집어 네 조각 중 사분원 세 개를 만들어요. */
function quarter(flipX: boolean, flipY: boolean) {
  const X = (x: number) => (flipX ? 32 - x : x);
  const Y = (y: number) => (flipY ? 32 - y : y);
  const p = (x: number, y: number) => `${X(x)} ${Y(y)}`;
  const s = flipX !== flipY ? 0 : 1; // 한 번 뒤집으면 도는 방향이 반대가 돼요
  return [
    `M${p(1 + R, 15)}`,
    `Q${p(1, 15)} ${p(ax, ay)}`,
    `A14 14 0 0 ${s} ${p(ay, ax)}`,
    `Q${p(15, 1)} ${p(15, 1 + R)}`,
    `L${p(15, 15 - R)}`,
    `A${R} ${R} 0 0 ${s} ${p(15 - R, 15)}`,
    'Z',
  ].join('');
}

const PIECES = [
  { k: 'q1', color: 'var(--blue)', d: quarter(false, false), glint: { cx: 7.8, cy: 6.8, rx: 3.4, ry: 1.8, rot: -40 } },
  { k: 'q2', color: 'var(--yellow)', d: quarter(true, false), glint: { cx: 21.6, cy: 5.2, rx: 3, ry: 1.6, rot: 10 } },
  { k: 'q3', color: 'var(--pink)', d: quarter(true, true), glint: { cx: 21.8, cy: 20.6, rx: 3.2, ry: 1.6, rot: 0 } },
  { k: 'q4', color: 'var(--red)', d: `M${1 + R} 17H${15 - R}A${R} ${R} 0 0 1 15 ${17 + R}V${31 - R}A${R} ${R} 0 0 1 ${15 - R} 31H${1 + R}A${R} ${R} 0 0 1 1 ${31 - R}V${17 + R}A${R} ${R} 0 0 1 ${1 + R} 17Z`, glint: { cx: 6.4, cy: 20.6, rx: 3.4, ry: 1.6, rot: 0 } },
] as const;

export function BrandMark({ className = 'mark' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        {PIECES.map((p) => (
          <radialGradient key={p.k} id={`${id}-${p.k}`} cx="0.32" cy="0.28" r="0.9" fx="0.3" fy="0.25">
            <stop offset="0" style={{ stopColor: `color-mix(in oklab, ${p.color} 84%, #fff)` }} />
            <stop offset="0.55" style={{ stopColor: p.color }} />
            <stop offset="1" style={{ stopColor: `color-mix(in oklab, ${p.color} 90%, #000)` }} />
          </radialGradient>
        ))}
        <radialGradient id={`${id}-glint`}>
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {PIECES.map(({ k, d, glint: g }) => (
        <g key={k} className={`mq ${k}`}>
          <path d={d} fill={`url(#${id}-${k})`} />
          <ellipse cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry} transform={`rotate(${g.rot} ${g.cx} ${g.cy})`} fill={`url(#${id}-glint)`} />
        </g>
      ))}
    </svg>
  );
}
