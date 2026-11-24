'use client';
// 1분 소개 영상 원본(개발 서버 전용). 사이트와 같은 로고·카드·그림·색·전환으로 만든 모션그래픽이에요.
// - /dev/promo 에서 실시간 미리보기, /dev/promo?render=1 은 캡처용(window.__seek(t) 로 한 프레임씩 맞춰요).
// - 모든 움직임은 60초 타임라인 하나에 CSS 애니메이션 지연으로 걸려 있고, 숫자·영상·뼈대만 JS 가 t 로 그려요.
import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/components/ui/BrandMark';
import { Picto } from '@/components/ui/Picto';
import { DEMO } from '@/components/landing/demoData';
import { CAT_COLOR } from '@/lib/colors';
import type { CatId } from '@/lib/scenarios';
import './promo.css';

const DURATION = 60;

type Frame = { t: number; p: number[] | null; f: number[] | null; g: boolean | null; d: boolean; b: boolean | null; w: string[] };
type Track = { faceEdges: [number, number][]; frames: Frame[] };
const POSE_PAIRS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28]];
const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26];
const WHY: Record<string, string> = { slouch: '등 굽음', shoulderTilt: '어깨 기욺', headTilt: '고개 기욺', crossed: '팔짱', offCenter: '가장자리' };
const frameAt = (fr: Frame[], t: number) => {
  let lo = 0, hi = fr.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (fr[m].t < t) lo = m + 1; else hi = m; }
  return fr[lo];
};

// 장면에 나오는 영상: 어느 칸에서, 타임라인 몇 초부터 재생하나
const CLIPS = [
  { id: 'a4', clip: 'a', start: 22.6 },
  { id: 'a6', clip: 'a', start: 45.6 },
  { id: 'b6', clip: 'b', start: 45.6 },
] as const;

const PURPOSES = [
  { ico: 'interview', t: '면접', s: '앉아서 · 손은 작게', art: 3 },
  { ico: 'ir', t: 'IR 피칭', s: '화면을 가리키며 숫자로', art: 2 },
  { ico: 'capstone', t: '졸업 발표', s: '문제에서 결과까지', art: 5 },
  { ico: 'report', t: '업무 보고', s: '결론 먼저', art: 1 },
  { ico: 'conference', t: '학회 발표', s: '그래프를 짚으며', art: 7 },
  { ico: 'lecture', t: '강의', s: '예시와 요약', art: 4 },
  { ico: 'speech', t: '축사', s: '사람을 보며', art: 6 },
];

const TREND = [58, 71, 80, 87];

/** 숫자 세기: data-to 까지 [t0, t1] 동안 */
function countUp(root: HTMLElement, t: number) {
  root.querySelectorAll<HTMLElement>('[data-to]').forEach((el) => {
    const to = Number(el.dataset.to), t0 = Number(el.dataset.t0), t1 = Number(el.dataset.t1);
    const k = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = String(Math.round(to * e));
  });
}

export default function Promo() {
  const stage = useRef<HTMLDivElement>(null);
  const tracks = useRef<Record<string, Track>>({});
  const [render, setRender] = useState(false);
  const [scale, setScale] = useState(1);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const r = new URLSearchParams(location.search).get('render') === '1';
    setRender(r);
    const fit = () => setScale(r ? 1 : Math.min(innerWidth / 1920, (innerHeight - 56) / 1080));
    fit(); addEventListener('resize', fit);
    Promise.all((['a', 'b'] as const).map((k) => fetch(`/media/nv-${k}.track.json`).then((x) => x.json()).then((j: Track) => { tracks.current[k] = j; })));
    return () => removeEventListener('resize', fit);
  }, []);

  // t 초의 한 장면으로 맞춰요(애니메이션·숫자·영상·뼈대)
  useEffect(() => {
    const root = stage.current!;
    const draw = (cv: HTMLCanvasElement, f: Frame | null, faceEdges: [number, number][]) => {
      const ctx = cv.getContext('2d')!;
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      if (!f) return;
      ctx.lineCap = 'round';
      if (f.p) {
        const P = (i: number) => ({ x: f.p![i * 3] * W, y: f.p![i * 3 + 1] * H, v: f.p![i * 3 + 2] });
        ctx.strokeStyle = f.b ? '#e8112d' : '#1ed760'; ctx.lineWidth = 5;
        for (const [a, b] of POSE_PAIRS) { const A = P(a), B = P(b); if (A.v < 0.5 || B.v < 0.5) continue; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); }
        ctx.fillStyle = '#fff';
        for (const i of JOINTS) { const A = P(i); if (A.v < 0.5) continue; ctx.beginPath(); ctx.arc(A.x, A.y, 6, 0, Math.PI * 2); ctx.fill(); }
      }
      if (f.f) {
        const Q = (i: number) => ({ x: f.f![i * 2] * W, y: f.f![i * 2 + 1] * H });
        ctx.strokeStyle = f.g ? '#ffd400' : 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.6;
        for (const [a, b] of faceEdges) { const A = Q(a), B = Q(b); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); }
      }
    };
    const seek = async (t: number) => {
      root.getAnimations({ subtree: true }).forEach((a) => { a.pause(); a.currentTime = t * 1000; });
      countUp(root, t);
      const waits: Promise<unknown>[] = [];
      for (const c of CLIPS) {
        const v = root.querySelector<HTMLVideoElement>(`video[data-id="${c.id}"]`);
        const cv = root.querySelector<HTMLCanvasElement>(`canvas[data-id="${c.id}"]`);
        const chips = root.querySelector<HTMLElement>(`[data-chips="${c.id}"]`);
        if (!v || !cv) continue;
        const vt = Math.max(0, Math.min((v.duration || 10) - 0.05, t - c.start));
        if (Math.abs(v.currentTime - vt) > 0.01) { waits.push(new Promise((res) => { v.addEventListener('seeked', res, { once: true }); setTimeout(res, 800); })); v.currentTime = vt; }
        const tr = tracks.current[c.clip];
        const f = tr ? frameAt(tr.frames, vt) : null;
        draw(cv, f, tr?.faceEdges ?? []);
        if (chips && f) {
          const [g, p] = chips.children as unknown as HTMLElement[];
          g.dataset.ok = String(!!f.g); g.lastElementChild!.textContent = f.f ? (f.g ? '렌즈 봄' : f.d ? '아래 봄' : '딴 곳') : '얼굴 없음';
          p.dataset.ok = String(f.b === false); p.lastElementChild!.textContent = f.b == null ? '몸 없음' : f.b ? (WHY[f.w[0]] ?? '흐트러짐') : '바름';
        }
      }
      await Promise.all(waits);
    };
    (window as unknown as { __seek: typeof seek }).__seek = seek;
    if (render) { seek(0); return; }
    // 미리보기: 실제 시간으로 재생(영상은 그냥 재생)
    let raf = 0; const t0 = performance.now();
    const loop = () => {
      const t = ((performance.now() - t0) / 1000) % DURATION;
      root.getAnimations({ subtree: true }).forEach((a) => { a.pause(); a.currentTime = t * 1000; });
      countUp(root, t);
      for (const c of CLIPS) {
        const v = root.querySelector<HTMLVideoElement>(`video[data-id="${c.id}"]`);
        const cv = root.querySelector<HTMLCanvasElement>(`canvas[data-id="${c.id}"]`);
        if (!v || !cv) continue;
        const vt = t - c.start;
        if (vt < 0 || vt > 10.2) { if (!v.paused) v.pause(); if (vt < 0 && v.currentTime > 0.1) v.currentTime = 0; }
        else if (v.paused) { v.currentTime = vt; v.play().catch(() => {}); }
        const tr = tracks.current[c.clip];
        const f = tr ? frameAt(tr.frames, v.currentTime) : null;
        draw(cv, f, tr?.faceEdges ?? []);
        const chips = root.querySelector<HTMLElement>(`[data-chips="${c.id}"]`);
        if (chips && f) {
          const [g, p] = chips.children as unknown as HTMLElement[];
          g.dataset.ok = String(!!f.g); g.lastElementChild!.textContent = f.f ? (f.g ? '렌즈 봄' : f.d ? '아래 봄' : '딴 곳') : '얼굴 없음';
          p.dataset.ok = String(f.b === false); p.lastElementChild!.textContent = f.b == null ? '몸 없음' : f.b ? (WHY[f.w[0]] ?? '흐트러짐') : '바름';
        }
      }
      setNow(Math.floor(t));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [render]);

  if (process.env.NODE_ENV !== 'development') return null;
  const A = DEMO.a.cats.filter((c) => c.score != null);

  const video = (id: string, clip: 'a' | 'b') => (
    <div className="pm-vid">
      <video data-id={id} src={`/media/nv-${clip}.mp4`} muted playsInline preload="auto" />
      <canvas data-id={id} width={576} height={720} />
      <span className="pm-tag">MediaPipe 실시간 인식</span>
      <span className="pm-chips" data-chips={id}><i><b>시선</b><span /></i><i><b>자세</b><span /></i></span>
    </div>
  );

  return (
    <div className={`pm-wrap${render ? ' is-render' : ''}`}>
      <div className="pm-stage" ref={stage} style={{ transform: `scale(${scale})` }}>
        {/* 1. 로고 등장 (0–6초) */}
        <section className="pm-s s1">
          <div className="pm-wipe">{['--blue', '--yellow', '--pink', '--red'].map((c, i) => <i key={c} style={{ background: `var(${c})`, animationDelay: `${0.1 + i * 0.08}s` }} />)}</div>
          <div className="pm-logo"><BrandMark /><span>Talkstage</span></div>
        </section>

        {/* 2. 한 문장 (6–13초) */}
        <section className="pm-s s2">
          <h1>
            <span className="l1">무엇을 만들었든,</span>
            <span className="l2">결국 전해지는 건</span>
            <span className="l3"><em>이야기예요.</em></span>
          </h1>
        </section>

        {/* 3. 상황마다 다른 기준 (13–22초) */}
        <section className="pm-s s3">
          <h2 className="pm-h">좋은 발표는<br />상황마다 달라요.</h2>
          <div className="pm-fan">
            {PURPOSES.map((p, i) => (
              <div key={p.t} className={`pm-card art-${p.art}`} style={{ '--i': i, animationDelay: `${13.6 + i * 0.16}s` } as React.CSSProperties}>
                <b>{p.t}</b><span>{p.s}</span><Picto name={p.ico} />
              </div>
            ))}
          </div>
          <p className="pm-sub">면접은 손을 작게, IR 피칭은 화면을 가리키며.<br />Talkstage는 상황마다 다른 기준으로 봐요.</p>
        </section>

        {/* 4. 녹화 한 번으로 분석 (22–36초) */}
        <section className="pm-s s4">
          <div className="pm-left">
            <p className="pm-kicker">녹화 한 번으로</p>
            <h2 className="pm-h">시선·자세·손짓·억양을<br />한 번에 봐요.</h2>
          </div>
          {video('a4', 'a')}
          <div className="pm-report">
            <small>Talkstage 분석 결과</small>
            <ul>
              {A.map((c, i) => (
                <li key={c.id} style={{ '--c': CAT_COLOR[c.id as CatId], '--v': (c.score ?? 0) / 100, animationDelay: `${24 + i * 0.35}s` } as React.CSSProperties}>
                  <span>{c.label}</span><i><b style={{ animationDelay: `${24.2 + i * 0.35}s` }} /></i>
                  <em className={(c.score ?? 0) < 55 ? 'low' : ''} data-to={c.score ?? 0} data-t0={24.2 + i * 0.35} data-t1={25.4 + i * 0.35}>0</em>
                </li>
              ))}
            </ul>
            <p className="pm-coach" style={{ animationDelay: '28.5s' }}><b>자세</b>등이 굽고 고개가 앞으로 나온 시간이 대부분이에요.</p>
            <p className="pm-coach" style={{ animationDelay: '29.3s' }}><b className="g">제스처</b>원고를 두 손으로 든 채 말했어요.</p>
          </div>
        </section>

        {/* 5. 같은 발표, 세네 번 (36–46초) */}
        <section className="pm-s s5">
          <div className="pm-left">
            <p className="pm-kicker">같은 발표를 세네 번</p>
            <h2 className="pm-h">연습할 때마다<br />나아지는 게 보여요.</h2>
          </div>
          <div className="pm-trend">
            <small>시드 투자 피칭 · 회차별 점수 <em>예시</em></small>
            <svg viewBox="0 0 760 420">
              {[40, 60, 80, 100].map((y) => <g key={y}><line x1="40" x2="740" y1={400 - y * 3.6 + 40} y2={400 - y * 3.6 + 40} className="grid" /><text x="0" y={400 - y * 3.6 + 46}>{y}</text></g>)}
              <rect x="40" y={400 - 100 * 3.6 + 40} width="700" height={20 * 3.6} className="band" />
              <polyline className="line" points={TREND.map((v, i) => `${80 + i * 210},${400 - v * 3.6 + 40}`).join(' ')} />
              {TREND.map((v, i) => (
                <g key={i} className="pt" style={{ animationDelay: `${37.4 + i * 0.55}s`, transformOrigin: `${80 + i * 210}px ${400 - v * 3.6 + 40}px` }}>
                  <circle cx={80 + i * 210} cy={400 - v * 3.6 + 40} r="11" />
                  <text x={80 + i * 210} y={400 - v * 3.6 + 10} textAnchor="middle">{v}</text>
                  <text x={80 + i * 210} y="412" textAnchor="middle" className="x">{i + 1}회</text>
                </g>
              ))}
            </svg>
            <div className="pm-diff" style={{ animationDelay: '40s' }}>첫 회보다 <b>+<span data-to={29} data-t0={40} data-t1={41.4}>0</span>점</b></div>
          </div>
        </section>

        {/* 6. 피드백 전후 (46–53초) */}
        <section className="pm-s s6">
          <h2 className="pm-h c">피드백대로 다시 하면</h2>
          <div className="pm-pair">
            <figure>{video('a6', 'a')}<figcaption>피드백 전</figcaption></figure>
            <span className="pm-arrow">→</span>
            <figure>{video('b6', 'b')}<figcaption>피드백 후</figcaption></figure>
          </div>
        </section>

        {/* 7. 끝 장면 (53–60초) */}
        <section className="pm-s s7">
          <div className="pm-wipe w2">{['--red', '--pink', '--yellow', '--blue'].map((c, i) => <i key={c} style={{ background: `var(${c})`, animationDelay: `${53 + i * 0.08}s` }} />)}</div>
          <div className="pm-end">
            <div className="pm-logo big"><BrandMark /><span>Talkstage</span></div>
            <p>중요한 발표 한 번을 위한 리허설 코치</p>
            <span className="pm-cta">무료로 리허설 시작하기</span>
          </div>
        </section>
      </div>
      {!render && <div className="pm-bar">미리보기 · {now}초 / {DURATION}초 · 캡처는 ?render=1</div>}
    </div>
  );
}
