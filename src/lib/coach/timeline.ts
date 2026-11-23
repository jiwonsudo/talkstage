// 리포트 타임라인: 발화·속도·시선·자세·제스처·알림 레인을 캔버스에 그려요.
import { fmtTime, type Purpose } from '@/lib/scenarios';
import type { Analysis } from './analysis';

export const TL_HEIGHT = 210;
export const TL_LEFT = 64;
const TL_RIGHT = 8;

export function drawTimeline(canvas: HTMLCanvasElement, R: Analysis, purpose: Purpose, currentTime: number) {
  const css = getComputedStyle(document.documentElement);
  const col = (n: string) => css.getPropertyValue(n).trim();
  const W = canvas.clientWidth, H = TL_HEIGHT;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const L = TL_LEFT;
  const x = (t: number) => L + (t / R.dur) * (W - L - TL_RIGHT);
  const lanes: [string, number][] = [['발화', 22], ['속도', 44], ['시선', 22], ['자세', 22], ['제스처', 22], ['알림', 22]];
  let y = 10;
  const Y: Record<string, [number, number]> = {};
  g.font = `12px ${col('--font-body') || 'sans-serif'}`;
  g.textBaseline = 'middle';
  for (const [name, h] of lanes) {
    Y[name] = [y, h];
    g.fillStyle = col('--muted');
    g.fillText(name, 4, y + h / 2);
    g.fillStyle = col('--track');
    g.fillRect(L, y, W - L - TL_RIGHT, h);
    y += h + 8;
  }
  const S = R.series;
  g.fillStyle = col('--voice');
  for (const r of S.speech) g.fillRect(x(r.t0), Y['발화'][0] + 4, Math.max(1, x(r.t1) - x(r.t0)), Y['발화'][1] - 8);

  const [sy, sh] = Y['속도'];
  const [lo, hi] = purpose.targets.spm;
  const vmin = 150, vmax = 450;
  const vy = (v: number) => sy + sh - ((Math.max(vmin, Math.min(vmax, v)) - vmin) / (vmax - vmin)) * sh;
  g.fillStyle = col('--band');
  g.fillRect(L, vy(hi), W - L - TL_RIGHT, vy(lo) - vy(hi));
  g.strokeStyle = col('--accent');
  g.lineWidth = 1.8;
  g.beginPath();
  let pen = false;
  S.rateSec.forEach((v, s) => {
    if (v == null) { pen = false; return; }
    const px = x(s + 0.5), py = vy(v);
    if (!pen) { g.moveTo(px, py); pen = true; } else g.lineTo(px, py);
  });
  g.stroke();

  const ratioLane = (name: string, arr: (number | null)[], goodHigh: boolean) => {
    const [ly, lh] = Y[name];
    arr.forEach((v, s) => {
      if (v == null) return;
      g.fillStyle = (goodHigh ? v >= 0.5 : v < 0.5) ? col('--good-soft') : col('--bad');
      g.fillRect(x(s), ly + 4, Math.max(1, x(s + 1) - x(s)) + 0.5, lh - 8);
    });
  };
  ratioLane('시선', S.gazeSec, true);
  ratioLane('자세', S.badSec, false);
  {
    const [ly, lh] = Y['제스처'];
    S.gestSec.forEach((v, s) => {
      if (v == null || v === 0) return;
      g.fillStyle = col('--accent');
      g.globalAlpha = Math.min(1, 0.25 + v * 2);
      g.fillRect(x(s), ly + 4, Math.max(1, x(s + 1) - x(s)) + 0.5, lh - 8);
      g.globalAlpha = 1;
    });
  }
  {
    const [ly, lh] = Y['알림'];
    for (const i of R.issues) {
      g.fillStyle = i.sev >= 3 ? col('--bad') : i.sev === 2 ? col('--warn') : col('--warn-soft');
      g.fillRect(x(i.t0), ly + 3, Math.max(2, x(i.t1) - x(i.t0)), lh / 2 - 3);
    }
    g.fillStyle = col('--filler');
    for (const f of S.fillerTimes) { g.beginPath(); g.arc(x(f.t), ly + lh * 0.75, 3, 0, Math.PI * 2); g.fill(); }
  }
  for (const h of [...R.highlights.strengths, ...R.highlights.weaknesses]) {
    g.strokeStyle = h.kind === 'strength' ? col('--good') : col('--bad');
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(x(h.t0), 4); g.lineTo(x(h.t1), 4); g.stroke();
  }
  g.fillStyle = col('--muted');
  g.font = `11px ${col('--font-mono') || 'monospace'}`;
  const step = R.dur > 240 ? 60 : R.dur > 90 ? 30 : 10;
  for (let t = 0; t <= R.dur; t += step) g.fillText(fmtTime(t), Math.min(x(t), W - 32), H - 6);
  const ph = x(Math.min(currentTime || 0, R.dur));
  g.strokeStyle = col('--ink');
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(ph, 6); g.lineTo(ph, H - 16); g.stroke();
}

/** 캔버스에서 누른 x 위치를 녹화 시각(초)으로 */
export function timeAt(canvas: HTMLCanvasElement, clientX: number, dur: number) {
  const r = canvas.getBoundingClientRect();
  return ((clientX - r.left - TL_LEFT) / (r.width - TL_LEFT - TL_RIGHT)) * dur;
}
