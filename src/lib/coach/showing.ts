// 보여 주기: 화면·제품을 가리키고 들어 보이는 동작을 MediaPipe 자세로 찾아 코칭해요.
// - 가리키기: 팔을 어깨선 밖으로 뻗은 채(가슴 높이 이상) 0.4초 이상 멈춤
// - 들어 보이기(제품·폰): 손을 가슴~얼굴 높이 몸 앞에 0.8초 이상 둠
// - 몸 가로질러 가리키기: 손이 반대편 어깨 쪽으로 넘어가 가슴 높이 이상(화면 쪽 손을 쓰라는 코칭)
// - 얼굴 가림: 손(제품)이 코 높이보다 위, 얼굴 앞
// 이 순간에 화면을 보는 건 시선 감점에서 빼고(exempt), 대신 가리킨 뒤 청중에게 돌아왔는지를 봐요.
import type { VisionFrame } from './vision';
import type { FinalText } from './audio';
import { deliveryOf, type AidId } from '@/lib/delivery';
import type { Range } from '@/lib/scenarios';

export type ShowEvent = { t0: number; t1: number; kind: 'point' | 'show'; side: 'L' | 'R' | 'front'; returned: boolean | null };
export type ShowIssue = { t0: number; t1: number; sev: number; title: string; detail: string };
export type ShowingResult = {
  events: ShowEvent[];
  perMin: number;
  returnRate: number | null;
  keyCover: number | null;
  keys: number;
  cross: number;
  face: number;
  brief: number;
  /** 고른 화면 방향과 반대로 주로 가리켰는지 */
  wrongSide: boolean;
  score: number;
  /** 가장 먼저 고칠 것(코칭 문구 고르기용) */
  main: 'few' | 'many' | 'return' | 'keys' | 'form' | 'ok';
  issues: ShowIssue[];
  /** 프레임별: 이 프레임의 시선은 채점에서 뺌(가리키는 중·직후라 화면을 봐도 괜찮음) */
  exempt: boolean[];
};

type Gaze = { gaze: boolean | null }[];
type Run = { t0: number; t1: number };

/** 참인 프레임을 구간으로. gap 초 이하 끊김은 이어 붙이고 min 초 미만은 버려요. */
function runsOf(t: number[], v: boolean[], dt: number, gap: number, min: number): Run[] {
  const out: Run[] = [];
  let cur: Run | null = null;
  for (let i = 0; i < t.length; i++) {
    if (!v[i]) continue;
    if (cur && t[i] - cur.t1 <= gap + dt) cur.t1 = t[i] + dt;
    else { if (cur) out.push(cur); cur = { t0: t[i], t1: t[i] + dt }; }
  }
  if (cur) out.push(cur);
  return out.filter((r) => r.t1 - r.t0 >= min);
}

const NUM = /\d|퍼센트|프로|[0-9]배|억|천만|만 ?원|위입니다|등입니다/;

export function analyzeShowing(opts: {
  V: VisionFrame[]; cls: Gaze; dt: number; dur: number; aid: AidId; purposeId: string; finals: FinalText[];
  score: (v: number, r: Range, soft: number) => number | null;
}): ShowingResult {
  const { V, cls, dt, dur, aid, purposeId, finals, score } = opts;
  const dl = deliveryOf(purposeId);
  const holds = aid === 'product' || aid === 'device';
  const t = V.map((f) => f.t);
  const pt: boolean[] = [], ptSide: ('L' | 'R' | null)[] = [], show: boolean[] = [], cross: boolean[] = [], face: boolean[] = [];

  for (const f of V) {
    let p: 'L' | 'R' | null = null, s = false, c = false, fc = false;
    if (f.pose && !f.armsCrossed) {
      const mid = f.smx, sw = f.sw;
      const dirL = Math.sign(f.ls.x - f.rs.x) || 1; // 화면 좌우가 뒤집혀 있어도 "말하는 사람의 왼쪽"을 맞춰요
      for (const [w, own] of [[f.lw, 1], [f.rw, -1]] as const) {
        if (!w) continue;
        const dx = w.x - mid, toL = dx * dirL; // + 면 말하는 사람의 왼쪽
        const high = w.y < f.smy + sw * 0.7; // 가슴 아래보다 위
        if (high && Math.abs(dx) > sw * 1.05) p = toL > 0 ? 'L' : 'R';
        else if (high && toL * own < 0 && Math.abs(dx) > sw * 0.35 && w.y < f.smy + sw * 0.5) c = true;
        if (holds && Math.abs(dx) < sw * 0.9 && w.y > f.smy - sw * 0.9 && w.y < f.smy + sw * 0.55) s = true;
        if (holds && w.y < f.noseY && Math.abs(w.x - f.nosePx) < sw * 0.5) fc = true;
      }
    }
    pt.push(p != null); ptSide.push(p); show.push(s); cross.push(c && p == null); face.push(fc);
  }

  const pointRuns = runsOf(t, pt, dt, 0.3, 0.4);
  const showRuns = holds ? runsOf(t, show, dt, 0.4, 0.8) : [];
  const crossRuns = runsOf(t, cross, dt, 0.3, 0.6);
  const faceRuns = runsOf(t, face, dt, 0.3, 0.8);

  const sideOf = (r: Run): 'L' | 'R' => {
    let l = 0, rr = 0;
    V.forEach((f, i) => { if (f.t >= r.t0 && f.t < r.t1) { if (ptSide[i] === 'L') l++; else if (ptSide[i] === 'R') rr++; } });
    return l >= rr ? 'L' : 'R';
  };
  // 가리킨 뒤 3초 안에(또는 가리키는 끝 무렵) 청중을 봤는지
  const gazeIn = (a: number, b: number) => {
    let n = 0, on = 0;
    V.forEach((f, i) => { if (f.t >= a && f.t < b && cls[i].gaze != null) { n++; if (cls[i].gaze) on++; } });
    return n < 2 ? null : on / n;
  };
  const evs: ShowEvent[] = [
    ...pointRuns.map((r) => ({ ...r, kind: 'point' as const, side: sideOf(r) })),
    // 몸을 가로질러 가리킨 것도 가리키기는 가리킨 거예요(자세 감점은 따로)
    ...crossRuns.filter((c) => !pointRuns.some((r) => r.t1 >= c.t0 && r.t0 <= c.t1)).map((r) => ({ ...r, kind: 'point' as const, side: 'front' as const })),
    ...showRuns.map((r) => ({ ...r, kind: 'show' as const, side: 'front' as const })),
  ].sort((a, b) => a.t0 - b.t0).map((e) => {
    const after = gazeIn(e.t1, e.t1 + 3), late = gazeIn(e.t1 - 0.6, e.t1);
    const returned = after == null && late == null ? null : (after ?? 0) >= 0.25 || (late ?? 0) >= 0.5;
    return { ...e, returned };
  });

  // 시선 감점에서 뺄 프레임: 가리키는/들어 보이는 중 + 끝난 뒤 1.2초(돌아오는 시간)
  const exempt = V.map((f) => evs.some((e) => f.t >= e.t0 - 0.3 && f.t <= e.t1 + 1.2));

  const issues: ShowIssue[] = [];
  // 화면만 보고 설명이 길어짐: 가리킨 뒤 돌아오지 않고 청중을 안 본 시간이 4초 넘게 이어짐
  for (const e of evs.filter((x) => x.returned === false)) {
    let end = e.t1;
    for (let i = 0; i < V.length; i++) {
      if (V[i].t < e.t1) continue;
      if (cls[i].gaze === true) break;
      end = V[i].t;
      if (end - e.t1 > 12) break;
    }
    const d = end - e.t0;
    if (d >= 4) issues.push({ t0: e.t0, t1: end, sev: d >= 8 ? 2 : 1, title: e.kind === 'show' ? '제품만 보며 설명이 길어짐' : '화면만 보며 설명이 길어짐', detail: `${d.toFixed(1)}초 동안 청중을 보지 않았어요. 가리킨 뒤에는 바로 청중 쪽으로 돌아와 말하세요.` });
  }
  crossRuns.slice(0, 3).forEach((r) => issues.push({ ...r, sev: 1, title: '몸을 가로질러 가리킴', detail: '반대쪽 손으로 가리키면 몸이 청중에게서 돌아가요. 화면 쪽 손으로 가리키세요.' }));
  faceRuns.slice(0, 3).forEach((r) => issues.push({ ...r, sev: 1, title: '제품이 얼굴을 가림', detail: '제품을 얼굴 앞까지 올렸어요. 가슴 높이에서 청중 쪽으로 돌려 보여 주세요.' }));
  const brief = showRuns.filter((r) => r.t1 - r.t0 < 1.5).length;

  // 보여 줘야 하는 순간(숫자·성과, 목적별 신호어)에 실제로 가리켰는지
  const keyFinals = finals.filter((f) => NUM.test(f.text) || dl.cues.some((w) => f.text.includes(w)));
  let covered = 0;
  for (const f of keyFinals) {
    const hit = evs.some((e) => e.t1 >= f.t0 - 1 && e.t0 <= f.t + 1);
    if (hit) covered++;
    else if (issues.filter((x) => x.title === '핵심 순간에 보여 주지 않음').length < 3) {
      issues.push({ t0: f.t0, t1: f.t, sev: 1, title: '핵심 순간에 보여 주지 않음', detail: `“${f.text.length > 34 ? `${f.text.slice(0, 33)}…` : f.text}”를 말할 때 화면·제품을 가리키지 않았어요.` });
    }
  }
  const keys = keyFinals.length;
  const keyCover = keys >= 2 ? covered / keys : null;

  const measured = evs.filter((e) => e.returned != null);
  const returnRate = measured.length ? measured.filter((e) => e.returned).length / measured.length : null;
  const perMin = evs.length / Math.max(dur / 60, 0.25);

  const screenSide = aid === 'slidesL' ? 'L' : aid === 'slidesR' ? 'R' : null;
  const pts = evs.filter((e) => e.kind === 'point' && e.side !== 'front');
  const wrongSide = !!screenSide && pts.length >= 3 && pts.filter((e) => e.side !== screenSide).length / pts.length > 0.7;

  // 점수: 횟수(목적별 범위) · 청중 복귀 · 핵심 순간 · 자세(가로지름·얼굴 가림·너무 짧게)
  const freqS = score(perMin, dl.show, Math.max(1.5, dl.show[0] * 1.5)) ?? 0; // 한 번도 안 가리켜도 0점은 아니에요(약 28점)
  const parts: [number, number][] = [[freqS, 0.35]];
  if (returnRate != null) parts.push([returnRate * 100, 0.35]);
  if (keyCover != null) parts.push([Math.min(1, keyCover / 0.6) * 100, 0.3]);
  const base = parts.reduce((a, [v, w]) => a + v * w, 0) / parts.reduce((a, [, w]) => a + w, 0);
  const formPen = Math.min(30, crossRuns.length * 8 + faceRuns.length * 8 + brief * 5);
  const total = Math.max(0, Math.min(100, base - formPen));

  // 가장 먼저 고칠 것
  const cand: [ShowingResult['main'], number][] = [
    [perMin < dl.show[0] ? 'few' : 'many', freqS],
    ['return', returnRate == null ? 100 : returnRate * 100],
    ['keys', keyCover == null ? 100 : Math.min(1, keyCover / 0.6) * 100],
    ['form', 100 - formPen * 3],
  ];
  const worst = cand.sort((a, b) => a[1] - b[1])[0];
  const main = worst[1] >= 80 ? 'ok' : worst[0];

  return { events: evs, perMin, returnRate, keyCover, keys, cross: crossRuns.length, face: faceRuns.length, brief, wrongSide, score: total, main, issues, exempt };
}
