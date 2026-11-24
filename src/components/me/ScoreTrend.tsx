'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Rehearsal } from '@/lib/data/types';
import { PURPOSE_BY_ID } from '@/lib/scenarios';

const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });

/** 최근 점수 흐름(0–100, 한 줄, 80 이상 '좋음' 띠). 마우스·손가락을 올리면 가장 가까운 회차의 날짜·점수를 보여 줘요. */
export function Trend({ rows, label }: { rows: Rehearsal[]; /** x축·말풍선에 쓸 이름(기본: 날짜) */ label?: (h: Rehearsal, i: number) => string }) {
  const name = (h: Rehearsal, i: number) => (label ? label(h, i) : day(h.created_at));
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const H = 200, L = 28, R = 12, T = 12, B = 26;
  const x = (i: number) => L + (i * (w - L - R)) / Math.max(rows.length - 1, 1);
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  const pts = rows.map((h, i) => ({ x: x(i), y: y(h.overall ?? 0), h }));
  const pick = (cx: number) => {
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p.x - cx) < Math.abs(pts[best].x - cx)) best = i; });
    setHover(best);
  };
  const hv = hover === null ? null : pts[hover];

  return (
    <div ref={box} className="db-trend">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={`최근 ${rows.length}회 점수: ${rows.map((h) => h.overall).join(', ')}`}
          onPointerMove={(e) => pick(e.clientX - e.currentTarget.getBoundingClientRect().left)} onPointerLeave={() => setHover(null)}>
          <rect className="db-good" x={L} width={Math.max(0, w - L - R)} y={y(100)} height={y(80) - y(100)} />
          <text x={L + 8} y={y(100) + 14} textAnchor="start" className="db-good-t">좋음 80+</text>
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} className="db-grid-line" />
              <text x={L - 8} y={y(v)} dy="0.32em" textAnchor="end">{v}</text>
            </g>
          ))}
          <text x={pts[0].x} y={H - 6} textAnchor="start">{name(rows[0], 0)}</text>
          <text x={pts.at(-1)!.x} y={H - 6} textAnchor="end">{name(rows.at(-1)!, rows.length - 1)}</text>
          {hv && <line x1={hv.x} x2={hv.x} y1={T} y2={H - B} className="db-cross" />}
          <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />
          {pts.map((p, i) => <circle key={p.h.id} cx={p.x} cy={p.y} r={i === hover || i === pts.length - 1 ? 5.5 : 3.5} className={i === pts.length - 1 ? 'is-last' : undefined} />)}
          {/* 마지막 회차만 값 표시 */}
          <text x={pts.at(-1)!.x} y={pts.at(-1)!.y - 12} textAnchor="end" className="db-last">{rows.at(-1)!.overall}점</text>
        </svg>
      )}
      {hv && (
        <div className="db-tip" style={{ left: hv.x, top: hv.y }}>
          <b>{hv.h.overall}점</b>
          <span>{label ? `${name(hv.h, hover!)} · ${day(hv.h.created_at)}` : `${day(hv.h.created_at)} · ${PURPOSE_BY_ID[hv.h.purpose_id]?.label ?? ''}`}</span>
        </div>
      )}
    </div>
  );
}
