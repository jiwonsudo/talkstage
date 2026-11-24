// 소개 영상(/dev/promo) 배경 음악을 코드로 만들어요(오리지널, 저작권 걱정 없음). node scripts/promo-beat.mjs out.wav
// 딥 하우스, 120BPM(한 박 0.5초, 한 마디 2초) · 15마디 = 30초. 영상의 컷·등장은 이 박자에 맞춰져 있어요.
// 화성: Dm9 – Am9 를 한 마디씩 오가요. 소리: 4/4 킥, 2·4박 클랩, 스윙 16분 하이햇, 오프비트 오픈햇, 신스 베이스, FM 코드 스탭, 보컬 촙(포먼트).
// 구성(마디, 0부터)
//   0–1    인트로: 전체가 저역통과 필터에 갇혀 있다가 4초에 활짝 열려요
//   2–9    그루브(6마디부터 셰이커, 8마디부터 패드·보컬 촙). 9마디 마지막 박은 킥을 빼요
//   10     브레이크다운: 킥·베이스 없이 패드·스탭, 필터가 다시 열리며 라이저, 마지막 16분음표 무음
//   11–13  드롭: 전부 + 스네어 레이어·보컬 촙. 13마디 마지막 박은 킥을 빼요
//   14     마지막 스탭 한 방 + 잔향(로고)
import { writeFileSync } from 'node:fs';

const SR = 44100, BPM = 120, BEAT = 60 / BPM, BAR = BEAT * 4, S16 = BEAT / 4, DUR = 30;
const N = Math.round(SR * (DUR + 1));
const L = new Float32Array(N), R = new Float32Array(N);
const RvL = new Float32Array(N), RvR = new Float32Array(N);
const DlL = new Float32Array(N), DlR = new Float32Array(N);
const duck = new Float32Array(N).fill(1);

let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const TAU = Math.PI * 2;
function out(i, v, pan = 0, rev = 0, dly = 0) {
  if (i < 0 || i >= N) return;
  const a = (pan + 1) * Math.PI / 4, l = v * Math.cos(a) * 1.41, r = v * Math.sin(a) * 1.41;
  L[i] += l; R[i] += r;
  if (rev) { RvL[i] += l * rev; RvR[i] += r * rev; }
  if (dly) { DlL[i] += l * dly; DlR[i] += r * dly; }
}
function svf() {
  let low = 0, band = 0;
  return (x, fc, q = 0.8) => {
    const f = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6.5) / SR);
    low += f * band; const high = x - low - q * band; band += f * high;
    return { low, band, high };
  };
}
function blepSaw(ph, dt) {
  let v = 2 * ph - 1;
  if (ph < dt) { const x = ph / dt; v -= x + x - x * x - 1; } else if (ph > 1 - dt) { const x = (ph - 1) / dt; v -= x * x + x + x + 1; }
  return v;
}
const SWING = 0.17;
const at16 = (b0, k) => b0 + k * S16 + (k % 2 ? S16 * SWING : 0);

// ---------- 화성 ----------
const CH = [[53, 57, 60, 64], [55, 59, 60, 64]]; // Dm9(F A C E) · Am9(G B C E)
const RT = [38, 33]; // D2 · A1
const ci = (b) => b % 2;

// ---------- 악기 ----------
function kick(t, g = 1) {
  const i0 = Math.round(t * SR), len = Math.round(0.42 * SR); let ph = 0;
  for (let k = 0; k < len; k++) {
    const s = k / SR; ph += TAU * (50 + 120 * Math.exp(-s * 32)) / SR;
    const click = k < 100 ? rnd() * 0.2 * (1 - k / 100) : 0;
    out(i0 + k, (Math.tanh(Math.sin(ph) * 1.8) * Math.exp(-s * 7) + click) * 0.62 * g);
  }
  const dl = Math.round(0.3 * SR);
  for (let k = 0; k < dl; k++) { const i = i0 + k; if (i < N) duck[i] = Math.min(duck[i], 0.3 + 0.7 * Math.pow(k / dl, 0.7)); }
}
function clap(t, g = 1) {
  const i0 = Math.round(t * SR), len = Math.round(0.3 * SR); const fl = svf();
  for (let k = 0; k < len; k++) {
    const s = k / SR; const burst = s < 0.03 ? Math.exp(-((s % 0.01) * 320)) : Math.exp(-(s - 0.03) * 14);
    out(i0 + k, fl(rnd(), 1250, 1.0).band * burst * 1.0 * g, 0.06, 0.32);
  }
}
function snare(t, g = 1) {
  const i0 = Math.round(t * SR), len = Math.round(0.25 * SR); let ph = 0; const fl = svf();
  for (let k = 0; k < len; k++) {
    const s = k / SR; ph += TAU * 200 / SR;
    out(i0 + k, (Math.sin(ph) * Math.exp(-s * 25) * 0.4 + fl(rnd(), 3500, 0.9).band * Math.exp(-s * 18)) * 0.5 * g, -0.05, 0.2);
  }
}
function hat(t, g = 1, open = false, pan = 0.25) {
  const i0 = Math.round(t * SR), len = Math.round((open ? 0.26 : 0.045) * SR); const fl = svf();
  for (let k = 0; k < len; k++) { const s = k / SR; out(i0 + k, fl(rnd(), 8000, 0.6).high * Math.exp(-s * (open ? 13 : 90)) * 0.2 * g, pan, open ? 0.1 : 0.03); }
}
function shaker(t, g = 1) {
  const i0 = Math.round(t * SR), len = Math.round(0.07 * SR); const fl = svf();
  for (let k = 0; k < len; k++) { const s = k / SR; out(i0 + k, fl(rnd(), 9500, 0.7).high * Math.min(1, s / 0.008) * Math.exp(-s * 55) * 0.11 * g, -0.4, 0.04); }
}
function rim(t, g = 1) {
  const i0 = Math.round(t * SR), len = Math.round(0.05 * SR);
  for (let k = 0; k < len; k++) { const s = k / SR; out(i0 + k, (Math.sin(TAU * 1700 * s) * 0.6 + Math.sin(TAU * 820 * s) * 0.5) * Math.exp(-s * 80) * 0.22 * g, 0.35, 0.2, 0.25); }
}
/** 딥 하우스 베이스: 디튠 톱니 둘 + 필터 엔벨로프 + 서브 사인 */
function bass(t, dur, midi, g = 0.26) {
  const i0 = Math.round(t * SR), len = Math.round((dur + 0.03) * SR), f = hz(midi), dt = f / SR; let ph = 0, ph2 = 0.3, ps = 0; const fl = svf();
  for (let k = 0; k < len; k++) {
    const s = k / SR; ph = (ph + dt) % 1; ph2 = (ph2 + dt * 1.006) % 1; ps += TAU * f / SR;
    const env = Math.min(1, s / 0.004) * (s > dur ? Math.exp(-(s - dur) * 80) : 1);
    const y = fl((blepSaw(ph, dt) + blepSaw(ph2, dt)) * 0.5, 160 + 900 * Math.exp(-s * 18), 0.45).low * 0.8 + Math.sin(ps) * 0.6;
    const i = i0 + k; out(i, Math.tanh(y * 1.3) * env * g * (i < N ? 0.35 + 0.65 * duck[i] : 1));
  }
}
/** 하우스 코드 스탭: FM 피아노 + 필터 톱니 */
function stab(t, notes, g = 0.07, dur = 0.14, cut = 2600, rev = 0.25, dly = 0.12) {
  notes.forEach((m, j) => {
    const i0 = Math.round(t * SR), rel = 0.12, len = Math.round((dur + rel) * SR), f = hz(m), dt = f / SR; let ph = Math.random(); const fl = svf();
    const pan = (j / (notes.length - 1) - 0.5) * 0.8;
    for (let k = 0; k < len; k++) {
      const s = k / SR, I = 2.4 * Math.exp(-s * 14) + 0.4;
      ph = (ph + dt) % 1;
      const fm = Math.sin(TAU * f * s + I * Math.sin(TAU * f * s));
      const sw = fl(blepSaw(ph, dt), cut * (0.5 + Math.exp(-s * 20)), 0.7).low;
      const env = Math.min(1, s / 0.002) * (s > dur ? Math.exp(-(s - dur) / rel * 4) : 1) * Math.exp(-s * 3);
      const i = i0 + k; out(i, (fm * 0.7 + sw * 0.5) * env * g * (i < N ? 0.5 + 0.5 * duck[i] : 1), pan, rev, dly);
    }
  });
}
function pad(t, dur, notes, g = 0.03, c0 = 600, c1 = 1800, rev = 0.55, atk = 0.3, rel = 0.6) {
  const len = Math.round((dur + rel) * SR), i0 = Math.round(t * SR);
  notes.forEach((m, j) => [-8, 8].forEach((cent, v) => {
    const f = hz(m) * Math.pow(2, cent / 1200), dt = f / SR; let ph = Math.random(); const fl = svf();
    for (let k = 0; k < len; k++) {
      const s = k / SR; ph = (ph + dt) % 1;
      const env = Math.min(1, s / atk) * (s > dur ? Math.exp(-(s - dur) / rel * 3) : 1);
      const i = i0 + k; out(i, fl(blepSaw(ph, dt), c0 * Math.pow(c1 / c0, Math.min(1, s / dur)), 0.9).low * env * g * (i < N ? 0.45 + 0.55 * duck[i] : 1), (v ? 1 : -1) * (0.4 + 0.1 * j), rev);
    }
  }));
}
/** 보컬 촙: 성대 톱니를 모음 포먼트(아·오)로 걸러요 */
const VOW = { a: [[730, 1], [1090, 0.5], [2440, 0.25]], o: [[570, 1], [840, 0.45], [2410, 0.15]] };
function chop(t, midi, vowel = 'o', g = 0.12, dur = 0.16, glide = 0) {
  const i0 = Math.round(t * SR), len = Math.round((dur + 0.08) * SR); let ph = 0;
  const fs = VOW[vowel].map(() => svf());
  for (let k = 0; k < len; k++) {
    const s = k / SR, f = hz(midi + glide * Math.min(1, s / dur)) * (1 + 0.006 * Math.sin(TAU * 5.5 * s)), dt = f / SR; ph = (ph + dt) % 1;
    const src = blepSaw(ph, dt);
    let y = 0; VOW[vowel].forEach(([fc, a], j) => { y += fs[j](src, fc, 0.12).band * a; });
    const env = Math.min(1, s / 0.008) * (s > dur ? Math.exp(-(s - dur) * 40) : 1);
    out(i0 + k, y * env * g, 0.15, 0.35, 0.3);
  }
}
function riser(t0, t1, g = 0.25) {
  const i0 = Math.round(t0 * SR), len = Math.round((t1 - t0) * SR); const fl = svf();
  for (let k = 0; k < len; k++) { const x = k / len; out(i0 + k, fl(rnd(), 300 * Math.pow(22, x), 1.1).band * Math.pow(x, 2) * g, Math.sin(x * 12) * 0.4, 0.35); }
}
function crash(t, g = 1) {
  const i0 = Math.round(t * SR), len = Math.round(2 * SR); const fl = svf();
  for (let k = 0; k < len; k++) { const s = k / SR; out(i0 + k, fl(rnd(), 6500, 0.5).high * Math.exp(-s * 2.6) * 0.13 * g, k % 2 ? 0.4 : -0.4, 0.3); }
}
function sub(t, dur, midi, g = 0.3) {
  const i0 = Math.round(t * SR), len = Math.round((dur + 0.2) * SR), f = hz(midi); let ph = 0;
  for (let k = 0; k < len; k++) { const s = k / SR; ph += TAU * f / SR; out(i0 + k, Math.sin(ph) * Math.min(1, s / 0.005) * Math.exp(-s * 1.6) * g); }
}

// ---------- 편곡 ----------
// 16분음표 위치(0–15)
const STAB = [3, 6, 10, 13];
const BASS = [[2, 0, 2], [6, 0, 2], [8, 12, 1], [10, 0, 2], [13, 7, 1], [14, 0, 2]]; // [위치, 음정, 길이]
const groove = (bar) => (bar >= 0 && bar <= 9) || (bar >= 11 && bar <= 13);

for (let bar = 0; bar < 15; bar++) {
  const b0 = bar * BAR, c = CH[ci(bar)], r = RT[ci(bar)];
  const drop = bar >= 11 && bar <= 13;
  if (groove(bar)) {
    const lastOff = bar === 9 || bar === 13; // 마지막 박 킥을 빼서 다음 마디를 기다리게
    for (let q = 0; q < 4; q++) if (!(lastOff && q === 3)) kick(b0 + q * BEAT, bar <= 1 ? 0.9 : 1);
    clap(b0 + BEAT, 0.85); clap(b0 + 3 * BEAT, 0.85);
    if (drop) { snare(b0 + BEAT, 0.6); snare(b0 + 3 * BEAT, 0.6); }
    for (let k = 0; k < 16; k++) hat(at16(b0, k), [0.35, 0.55, 0.3, 0.7][k % 4] * (bar <= 1 ? 0.8 : 1), false, 0.25);
    for (let q = 0; q < 4; q++) hat(b0 + q * BEAT + BEAT / 2, 0.9, true, -0.2);
    if (bar >= 6) for (let k = 0; k < 16; k++) shaker(at16(b0, k), [0.9, 0.4, 0.7, 0.4][k % 4]);
    if (bar >= 2) BASS.forEach(([p, o, l]) => bass(at16(b0, p), l * S16 * 0.9, r + o));
    STAB.forEach((p) => stab(at16(b0, p), c, bar <= 1 ? 0.065 : 0.07, 0.13, drop ? 3400 : 2600));
    if (bar >= 4 && bar % 2 === 1) rim(at16(b0, 15), 0.8);
    if (bar >= 8) pad(b0, BAR, c, drop ? 0.028 : 0.022, 700, 1600);
    if (bar >= 8 && bar % 2 === 1) { chop(at16(b0, 11), c[3] + 12, 'o', 0.1); chop(at16(b0, 14), c[2] + 12, 'a', 0.09, 0.22, -2); }
    if (drop) { chop(at16(b0, 7), c[1] + 12, 'o', 0.08, 0.12); }
    if (bar === 2 || bar === 8 || bar === 11) crash(b0, bar === 11 ? 1 : 0.7);
    if (bar === 1) riser(b0 + BEAT, b0 + BAR, 0.2);
    if (bar === 9 || bar === 13) riser(b0 + 2 * BEAT, b0 + BAR - S16, 0.18);
  }
  if (bar === 10) {
    pad(b0, BAR, c, 0.04, 500, 2200, 0.6, 0.1);
    STAB.forEach((p) => stab(at16(b0, p), c, 0.06, 0.2, 1500, 0.5, 0.3));
    for (let q = 0; q < 4; q++) hat(b0 + q * BEAT + BEAT / 2, 0.5, true, -0.2);
    chop(b0 + BEAT * 2.5, c[3] + 12, 'a', 0.12, 0.5, -1);
    riser(b0 + BEAT, b0 + BAR - S16, 0.3);
    for (let k = 0; k < 8; k++) clap(b0 + 2 * BEAT + k * S16 * 0.75, 0.15 + k * 0.06);
  }
  if (bar === 14) {
    kick(b0, 1.1); sub(b0, 1.6, 33 + 12); crash(b0, 1); clap(b0, 0.6);
    stab(b0, [45, ...CH[1], 69], 0.08, 0.5, 3000, 0.6, 0.35);
    pad(b0, BAR * 0.7, CH[1], 0.03, 2400, 700, 0.7, 0.01, 0.8);
  }
}

// ---------- 딜레이(점8분 핑퐁) → 리버브 ----------
{
  const D = Math.round(0.375 * SR); let lpL = 0, lpR = 0;
  const oL = new Float32Array(N), oR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const fbL = i >= D ? oR[i - D] : 0, fbR = i >= D ? oL[i - D] : 0;
    lpL += 0.4 * (fbL - lpL); lpR += 0.4 * (fbR - lpR);
    oL[i] = DlL[i] + lpL * 0.4; oR[i] = DlR[i] * 0.3 + lpR * 0.4;
    L[i] += oL[i] * 0.5; R[i] += oR[i] * 0.5; RvL[i] += oL[i] * 0.2; RvR[i] += oR[i] * 0.2;
  }
}
function reverb(inp, spread) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => ({ b: new Float32Array(d + spread), i: 0, f: 0 }));
  const aps = [556, 441, 341, 225].map((d) => ({ b: new Float32Array(d + spread), i: 0 }));
  const pre = Math.round(0.02 * SR); const o = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const x = (n >= pre ? inp[n - pre] : 0) * 0.015; let y = 0;
    for (const c of combs) { const v = c.b[c.i]; c.f = v * 0.7 + c.f * 0.3; c.b[c.i] = x + c.f * 0.84; if (++c.i >= c.b.length) c.i = 0; y += v; }
    for (const a of aps) { const v = a.b[a.i]; const z = -y + v; a.b[a.i] = y + v * 0.5; if (++a.i >= a.b.length) a.i = 0; y = z; }
    o[n] = y;
  }
  return o;
}
const wl = reverb(RvL, 0), wr = reverb(RvR, 23);
for (let i = 0; i < N; i++) { L[i] += wl[i] * 2.2; R[i] += wr[i] * 2.2; }

// ---------- 마스터 필터 자동화(인트로·브레이크다운) ----------
const cutAt = (t) => {
  if (t < 2 * BAR) return 220 * Math.pow(6000 / 220, Math.pow(t / (2 * BAR), 1.6));
  if (t >= 10 * BAR && t < 11 * BAR) return 900 * Math.pow(6000 / 900, Math.pow((t - 10 * BAR) / BAR, 2));
  return 99999;
};
{
  const fL = svf(), fR = svf();
  for (let i = 0; i < N; i++) {
    const fc = cutAt(i / SR), yl = fL(L[i], Math.min(fc, 6000), 0.55).low, yr = fR(R[i], Math.min(fc, 6000), 0.55).low;
    const w = fc >= 6000 ? 1 : 0; // 6kHz 이상이면 필터를 빼요
    L[i] = w ? L[i] : yl; R[i] = w ? R[i] : yr;
  }
}

// ---------- 마스터: 저역 정리 → 글루 컴프 → 소프트 클립 → 정규화 ----------
let hpL = 0, hpR = 0, xL = 0, xR = 0, env = 0, peak = 0;
const thr = 0.35, ratio = 2.5, atk = Math.exp(-1 / (0.005 * SR)), relc = Math.exp(-1 / (0.15 * SR));
for (let i = 0; i < N; i++) {
  hpL = 0.9986 * (hpL + L[i] - xL); xL = L[i]; hpR = 0.9986 * (hpR + R[i] - xR); xR = R[i];
  const lvl = Math.max(Math.abs(hpL), Math.abs(hpR));
  env = lvl > env ? atk * env + (1 - atk) * lvl : relc * env + (1 - relc) * lvl;
  const gr = env > thr ? Math.pow(env / thr, 1 / ratio - 1) : 1;
  L[i] = Math.tanh(hpL * gr * 1.4); R[i] = Math.tanh(hpR * gr * 1.4);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const g = 0.89 / peak;
const fadeIn = Math.round(0.01 * SR), end = Math.round(DUR * SR), fo0 = Math.round(29.3 * SR);
const pcm = Buffer.alloc(end * 4 + 44);
for (let i = 0; i < end; i++) {
  const f = Math.min(1, i / fadeIn) * (i > fo0 ? Math.pow(1 - (i - fo0) / (end - fo0), 1.5) : 1);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g * f)) * 32767), 44 + i * 4);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g * f)) * 32767), 46 + i * 4);
}
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + end * 4, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(end * 4, 40);
writeFileSync(process.argv[2] || 'promo-beat.wav', pcm);
console.log('wrote', DUR, 's', BPM, 'BPM house');
