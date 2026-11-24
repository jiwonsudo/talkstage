'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// 보여 주기 감지 합성 회귀 테스트(개발 서버 전용). showing.ts 기준을 바꾸면 여기 결과(이름별 main·점수)가 그대로인지 확인해요.
import { analyzeShowing } from '@/lib/coach/showing';
import type { AidId } from '@/lib/delivery';

type Pt = { x: number; y: number };
const rangeScore = (v: number, [lo, hi]: [number, number], soft: number) =>
  v < lo ? Math.max(0, 85 * (1 - (lo - v) / soft)) : v > hi ? Math.max(0, 85 * (1 - (v - hi) / soft)) : 92;

// 서 있는 사람: 어깨 너비 0.2, 가운데 0.5. 사람의 왼쪽 어깨(11)는 영상 오른쪽(x 큼)
function frame(t: number, lw: Pt | null, rw: Pt | null, gaze: boolean) {
  return {
    f: { t, pose: true, face: true, sw: 0.2, swFrame: 0.2, smx: 0.5, smy: 0.35, shoulderTilt: 0, noseX: 0.5, noseY: 0.22, nosePx: 0.5, slouchR: 0.6, hipVis: true, hipX: 0.5, hipY: 0.6,
      lw, rw, fullBody: true, armsCrossed: false, ls: { x: 0.6, y: 0.35 }, rs: { x: 0.4, y: 0.35 }, yawP: 0, pitchP: 0, faceTilt: 0, eyeH: 0, eyeDown: 0, smile: 0 },
    c: { gaze },
  };
}
const rest = { lw: { x: 0.56, y: 0.62 }, rw: { x: 0.44, y: 0.62 } }; // 손을 내려 둠
const inWin = (t: number, starts: number[], len: number) => starts.some((s) => t >= s && t < s + len);
const pts = [5, 17, 29, 41, 53];

function runAll() {
  const out: string[] = [];
  const run = (name: string, aid: AidId, plan: (t: number) => { lw: Pt | null; rw: Pt | null; gaze: boolean }, finals: any[] = [], dur = 60) => {
    const fr: ReturnType<typeof frame>[] = [];
    for (let i = 0; i < dur * 10; i++) { const t = i / 10; const p = plan(t); fr.push(frame(t, p.lw, p.rw, p.gaze)); }
    const r = analyzeShowing({ V: fr.map((x) => x.f) as any, cls: fr.map((x) => x.c), dt: 0.1, dur, aid, purposeId: 'ir', finals, score: rangeScore as any });
    out.push(`${name}: events ${r.events.length} (${r.events.map((e) => `${e.kind}${e.side}@${e.t0.toFixed(1)}${e.returned === false ? 'x' : ''}`).join(' ')}) perMin ${r.perMin.toFixed(1)} ret ${r.returnRate} key ${r.keyCover?.toFixed(2)} cross ${r.cross} face ${r.face} brief ${r.brief} score ${Math.round(r.score)} main ${r.main} wrong ${r.wrongSide} exempt ${r.exempt.filter(Boolean).length}`);
    r.issues.forEach((i) => out.push(`   · ${i.title} ${i.t0.toFixed(1)}-${i.t1.toFixed(1)}`));
  };
  run('none', 'slidesR', () => ({ ...rest, gaze: true }));
  // 오른쪽 화면을 오른손(rw, 영상 왼쪽)으로 12초마다 1.5초 가리키고, 가리키는 동안만 화면을 봄
  run('good-point', 'slidesR', (t) => inWin(t, pts, 1.5) ? { lw: rest.lw, rw: { x: 0.22, y: 0.3 }, gaze: false } : { ...rest, gaze: true },
    [{ t0: 4.5, t: 8, text: '매출이 3배 성장했습니다' }, { t0: 28, t: 31, text: '고객 수는 1200명입니다' }, { t0: 35, t: 38, text: '저희 팀을 소개합니다' }]);
  run('missed-key', 'slidesR', (t) => inWin(t, pts, 1.5) ? { lw: rest.lw, rw: { x: 0.22, y: 0.3 }, gaze: false } : { ...rest, gaze: true },
    [{ t0: 10, t: 13, text: '매출이 3배 성장했습니다' }, { t0: 22, t: 25, text: '고객 수는 1200명입니다' }]);
  run('no-return', 'slidesR', (t) => inWin(t, pts, 1.5) ? { lw: rest.lw, rw: { x: 0.22, y: 0.3 }, gaze: false } : { ...rest, gaze: !inWin(t, pts.map((s) => s + 1.5), 6) });
  // 왼손(lw)으로 몸을 가로질러 말하는 사람의 오른쪽(영상 왼쪽)을 가리킴
  run('cross', 'slidesR', (t) => inWin(t, pts, 1.5) ? { lw: { x: 0.4, y: 0.3 }, rw: rest.rw, gaze: false } : { ...rest, gaze: true });
  run('clasped(오탐?)', 'product', () => ({ lw: { x: 0.52, y: 0.52 }, rw: { x: 0.48, y: 0.52 }, gaze: true }));
  run('product', 'product', (t) => inWin(t, pts, 2.5) ? { lw: { x: 0.54, y: 0.38 }, rw: { x: 0.46, y: 0.38 }, gaze: true } : { ...rest, gaze: true });
  run('face', 'product', (t) => inWin(t, pts, 2) ? { lw: { x: 0.52, y: 0.18 }, rw: { x: 0.48, y: 0.18 }, gaze: false } : { ...rest, gaze: true });
  run('many', 'slidesR', (t) => inWin(t, Array.from({ length: 15 }, (_, i) => i * 4), 1.2) ? { lw: rest.lw, rw: { x: 0.22, y: 0.3 }, gaze: true } : { ...rest, gaze: true });
  run('wrongside', 'slidesL', (t) => inWin(t, pts, 1.5) ? { lw: rest.lw, rw: { x: 0.22, y: 0.3 }, gaze: true } : { ...rest, gaze: true });
  // 손을 크게 흔드는 일반 제스처(어깨선 안) → 가리키기로 세면 안 됨
  run('wave(오탐?)', 'slidesR', (t) => ({ lw: { x: 0.62 + 0.03 * Math.sin(t * 6), y: 0.42 }, rw: { x: 0.38 - 0.03 * Math.sin(t * 6), y: 0.42 }, gaze: true }));
  return out;
}

export default function ShowTest() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <pre id="out" style={{ padding: 20, fontSize: 12 }}>{runAll().join('\n')}</pre>;
}
