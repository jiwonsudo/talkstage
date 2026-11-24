'use client';
// 30초 광고 원본(개발 서버 전용). 콘셉트: "좋은 발표의 정답은 상황마다 다르다" + 회차마다 나아짐.
// - 음악: scripts/promo-beat.mjs(딥 하우스 120BPM, 한 박 0.5초, 한 마디 2초). 컷은 마디 첫 박, 등장은 박자(B) 단위.
// - 밝은 배경 하나. 상황별 정답은 한 문장 틀에서 상황·정답 낱말만 슬롯처럼 굴러 바뀌고, 옆에 상황 카드가 한 장씩 쌓여요.
// - 분석 화면·점수는 랜딩 예시(nv-a = 1회, nv-b = 4회)를 앱 분석 코드로 실제로 돌린 값(landing/demoData.ts)이에요.
// - /dev/promo 미리보기, /dev/promo?render=1 + window.__seek(t) 로 한 프레임씩 캡처 → ffmpeg 로 음악과 합쳐요.
import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/components/ui/BrandMark';
import { Picto } from '@/components/ui/Picto';
import './promo.css';

const DURATION = 30;
const B = 0.5; // 한 박(초)
const bar = (n: number) => n * 4 * B; // n번째 마디(0부터) 시작 시각
const EASE = 'cubic-bezier(.16,1,.3,1)';

type Kind = 'up' | 'rise' | 'fade' | 'pop';
const LEN: Record<Kind, number> = { up: 0.7, rise: 0.7, fade: 0.4, pop: 0.6 };
/** start~end 초 동안만 보이고, 들어올 때 kind 모션. 끝나면 딱 끊겨요(컷). */
const A = (start: number, end: number, kind: Kind = 'up', extra = ''): React.CSSProperties => ({
  animation: `k-${kind} ${LEN[kind]}s ${EASE} ${start}s both, k-cut 1ms linear ${end}s forwards${extra ? ', ' + extra : ''}`,
});
const drift = (start: number, end: number) => `k-drift ${end - start}s linear ${start}s both`;

/** 글자 줄이 아래에서 가려진 채로 올라와요 */
function Line({ t, end, children, className = '' }: { t: number; end: number; children: React.ReactNode; className?: string }) {
  return <span className={`k-m ${className}`}><span style={A(t, end, 'rise')}>{children}</span></span>;
}
/** 슬롯: 같은 자리에서 낱말이 위로 빠지고 아래에서 새 낱말이 올라와요 */
function Slot({ words, times, end, className = '' }: { words: string[]; times: number[]; end: number; className?: string }) {
  return (
    <span className={`k-m k-slot ${className}`}>
      {words.map((w, i) => {
        const out = times[i + 1];
        return <span key={i} style={{ animation: `k-rise .6s ${EASE} ${times[i]}s both, ${out != null ? `k-leave .26s cubic-bezier(.6,0,.9,.4) ${out - 0.26}s forwards` : `k-cut 1ms linear ${end}s forwards`}` }}>{w}</span>;
      })}
    </span>
  );
}

type Frame = { t: number; p: number[] | null; f: number[] | null; g: boolean | null; d: boolean; b: boolean | null; w: string[] };
type Track = { faceEdges: [number, number][]; frames: Frame[] };
const POSE_PAIRS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28]];
const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26];
const WHY: Record<string, string> = { slouch: '등 굽음', shoulderTilt: '어깨 기욺', headTilt: '고개 기욺', crossed: '팔짱', offCenter: '가장자리' };
const frameAt = (fr: Frame[], t: number) => { let lo = 0, hi = fr.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (fr[m].t < t) lo = m + 1; else hi = m; } return fr[lo]; };
// 영상 조각: 어떤 영상의 from 초부터를 start~end 동안 보여 줘요
const CLIPS = [
  { k: 'a' as const, from: 2, start: bar(8), end: bar(10) }, // 1회: 그 기준으로 봐요
  { k: 'a' as const, from: 2, start: bar(11), end: bar(13) }, // 1회(작게)
  { k: 'b' as const, from: 2, start: bar(11), end: bar(13) }, // 4회
];

type St = { who: string; ico: string; art: number; ans: string };
// 4–12초: 한 문장 틀, 상황·정답만 바뀌어요(1초·1초·2초 리듬)
const TEMPLATES: { cap: string; fixed: string; s: number; states: St[] }[] = [
  { cap: '손짓', fixed: '손은', s: bar(2), states: [
    { who: '면접에선', ico: 'interview', art: 3, ans: '작고 간단하게.' },
    { who: 'IR 피칭에선', ico: 'ir', art: 2, ans: '크게, 화면을 가리키며.' },
    { who: '제품 시연에선', ico: 'standing', art: 5, ans: '제품을 들어 보이며.' },
  ] },
  { cap: '시선', fixed: '시선은', s: bar(4), states: [
    { who: '화상 면접에선', ico: 'eyes', art: 4, ans: '렌즈 하나에.' },
    { who: '졸업 발표에선', ico: 'capstone', art: 1, ans: '심사위원 모두에게.' },
    { who: '강의에선', ico: 'lecture', art: 7, ans: '청중 전체에.' },
  ] },
];
const TILT = [-7, 5, -2];
const WIZ = [
  { ico: 'interview', t: '면접', art: 3, x: -405, y: 30, r: -8 }, { ico: 'ir', t: 'IR 피칭', art: 2, x: -135, y: 0, r: -3 },
  { ico: 'capstone', t: '졸업 발표', art: 5, x: 135, y: 0, r: 3 }, { ico: 'report', t: '업무 보고', art: 1, x: 405, y: 30, r: 8 },
];
const PICK = 3; // 예시 영상의 상황(업무 보고 · 서서)
// 실제 분석 값(landing/demoData.ts): nv-a 시선 8·자세 17·제스처 54 → nv-b 98·100·95
const SCORES = [
  { l: '시선', a: 8, b: 98, c: '--blue' },
  { l: '자세', a: 17, b: 100, c: '--green' },
  { l: '제스처', a: 54, b: 95, c: '--orange' },
];

function Cam({ i, className, style, label }: { i: number; className: string; style: React.CSSProperties; label?: string }) {
  return (
    <div className={`k-cam ${className}`} style={style} data-clip={i}>
      <video src={`/media/nv-${CLIPS[i].k}.mp4`} muted playsInline preload="auto" />
      <canvas className="k-ov" width={576} height={720} />
      <span className="k-chips"><i><b>시선</b><span /></i><i><b>자세</b><span /></i></span>
      {label && <span className="k-round">{label}</span>}
    </div>
  );
}

export default function Promo() {
  const stage = useRef<HTMLDivElement>(null);
  const tracks = useRef<Partial<Record<'a' | 'b', Track>>>({});
  const [render, setRender] = useState(false);
  const [scale, setScale] = useState(1);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const r = new URLSearchParams(location.search).get('render') === '1';
    const fit = () => setScale(r ? 1 : Math.min(innerWidth / 1920, (innerHeight - 56) / 1080));
    const id = requestAnimationFrame(() => { setRender(r); fit(); });
    addEventListener('resize', fit);
    (['a', 'b'] as const).forEach((k) => fetch(`/media/nv-${k}.track.json`).then((x) => x.json()).then((j: Track) => { tracks.current[k] = j; }));
    return () => { cancelAnimationFrame(id); removeEventListener('resize', fit); };
  }, []);

  useEffect(() => {
    const root = stage.current!;
    const cams = CLIPS.map((c, i) => {
      const el = root.querySelector<HTMLElement>(`[data-clip="${i}"]`)!;
      return { ...c, v: el.querySelector('video')!, cv: el.querySelector<HTMLCanvasElement>('canvas')!, chips: el.querySelector<HTMLElement>('.k-chips')! };
    });
    const paint = (cam: (typeof cams)[number], vt: number) => {
      const tr = tracks.current[cam.k];
      const ctx = cam.cv.getContext('2d')!, W = cam.cv.width, H = cam.cv.height;
      ctx.clearRect(0, 0, W, H);
      const f = tr ? frameAt(tr.frames, vt) : null;
      if (!f || !tr) return;
      ctx.lineCap = 'round';
      if (f.p) {
        const P = (i: number) => ({ x: f.p![i * 3] * W, y: f.p![i * 3 + 1] * H, v: f.p![i * 3 + 2] });
        ctx.strokeStyle = f.b ? '#e8112d' : '#1ed760'; ctx.lineWidth = 5;
        for (const [a, b] of POSE_PAIRS) { const p1 = P(a), p2 = P(b); if (p1.v < 0.5 || p2.v < 0.5) continue; ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
        ctx.fillStyle = '#fff';
        for (const i of JOINTS) { const p1 = P(i); if (p1.v < 0.5) continue; ctx.beginPath(); ctx.arc(p1.x, p1.y, 6, 0, Math.PI * 2); ctx.fill(); }
      }
      if (f.f) {
        const Q = (i: number) => ({ x: f.f![i * 2] * W, y: f.f![i * 2 + 1] * H });
        ctx.strokeStyle = f.g ? '#ffd400' : 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.6;
        for (const [a, b] of tr.faceEdges) { const p1 = Q(a), p2 = Q(b); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
      }
      const [g, p] = cam.chips.children as unknown as HTMLElement[];
      g.dataset.ok = String(!!f.g); g.lastElementChild!.textContent = f.f ? (f.g ? '렌즈 봄' : f.d ? '아래 봄' : '딴 곳') : '얼굴 없음';
      p.dataset.ok = String(f.b === false); p.lastElementChild!.textContent = f.b == null ? '몸 없음' : f.b ? (WHY[f.w[0]] ?? '흐트러짐') : '바름';
    };
    const setT = (t: number) => {
      root.getAnimations({ subtree: true }).forEach((a) => { a.pause(); a.currentTime = t * 1000; });
      root.querySelectorAll<HTMLElement>('[data-to]').forEach((el) => {
        const k = Math.max(0, Math.min(1, (t - Number(el.dataset.t0)) / (Number(el.dataset.t1) - Number(el.dataset.t0))));
        const a = Number(el.dataset.from ?? 0), b = Number(el.dataset.to);
        el.textContent = String(Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3))));
      });
    };
    const vtOf = (c: (typeof cams)[number], t: number) => c.from + Math.max(0, Math.min(c.end - c.start, t - c.start));
    const seek = async (t: number) => {
      setT(t);
      await Promise.all(cams.map(async (c) => {
        const vt = vtOf(c, t);
        if (Math.abs(c.v.currentTime - vt) > 0.01) await new Promise((res) => { c.v.addEventListener('seeked', res, { once: true }); setTimeout(res, 800); c.v.currentTime = vt; });
        paint(c, vt);
      }));
    };
    (window as unknown as { __seek: typeof seek }).__seek = seek;
    if (render) { seek(0); return; }
    let raf = 0; const t0 = performance.now();
    const loop = () => {
      const t = ((performance.now() - t0) / 1000) % DURATION;
      setT(t);
      cams.forEach((c) => {
        const on = t >= c.start && t < c.end;
        if (!on) { if (!c.v.paused) c.v.pause(); c.v.currentTime = vtOf(c, t); }
        else if (c.v.paused) { c.v.currentTime = vtOf(c, t); c.v.play().catch(() => {}); }
        paint(c, c.v.currentTime);
      });
      setNow(Math.floor(t));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [render]);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className={`pm-wrap${render ? ' is-render' : ''}`}>
      <div className="pm-stage k" ref={stage} style={{ transform: `scale(${scale})` }}>
        {/* 0–4초: 질문(필터가 닫힌 인트로) */}
        <div className="k-center" style={{ animation: drift(0, bar(1)) }}>
          <p className="k-h big"><Line t={0} end={bar(1)}>좋은 발표의</Line> <Line t={2 * B} end={bar(1)}>정답은</Line></p>
        </div>
        <div className="k-center" style={{ animation: drift(bar(1), bar(2)) }}>
          <p className="k-h big"><Line t={bar(1)} end={bar(2)}>하나일까요?</Line></p>
        </div>

        {/* 4–12초: 한 문장 틀 + 쌓이는 상황 카드 */}
        {TEMPLATES.map((tp, n) => {
          const e = tp.s + bar(2), times = [tp.s, tp.s + 2 * B, tp.s + 4 * B];
          return (
            <div key={n} className="k-tpl">
              <p className="k-cap"><Line t={tp.s} end={e}><b>0{n + 1}</b> {tp.cap}</Line></p>
              <p className="k-sent">
                <Slot words={tp.states.map((x) => x.who)} times={times} end={e} />
                <Line t={tp.s + 0.08} end={e} className="mute">{tp.fixed}</Line>
                <Slot words={tp.states.map((x) => x.ans)} times={times.map((x) => x + 0.12)} end={e} className="ans" />
              </p>
              <div className="k-pile">
                {tp.states.map((x, i) => (
                  <div key={i} className={`k-card art-${x.art}`} style={{ rotate: `${TILT[i]}deg`, animation: `k-deal .75s ${EASE} ${times[i]}s both, k-cut 1ms linear ${e}s forwards` }}>
                    <b>{x.who.replace(/에선$/, '')}</b><Picto name={x.ico} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* 12–14초 */}
        <div className="k-center">
          <p className="k-h big"><Line t={bar(6)} end={bar(7)}>정답은</Line> <Line t={bar(6) + B} end={bar(7)} className="blue">상황마다</Line> <Line t={bar(6) + 2 * B} end={bar(7)}>달라요.</Line></p>
        </div>

        {/* 14–16초: 상황부터 묻고 */}
        <div className="k-prod">
          <p className="k-title"><Line t={bar(7)} end={bar(8)}><b>Talkstage</b>는 상황부터 묻고,</Line></p>
          <div className="k-fan">
            {WIZ.map((w, i) => {
              const t = bar(7) + B * 0.5 + i * B / 2, pick = bar(7) + 3 * B;
              return (
                <div key={w.t} className={`k-wc art-${w.art}`} style={{ left: w.x, top: w.y, rotate: `${w.r}deg`, zIndex: i === PICK ? 2 : 1, animation: `k-up .7s ${EASE} ${t}s both, k-cut 1ms linear ${bar(8)}s forwards, ${i === PICK ? `k-lift .6s ${EASE} ${pick}s forwards` : `k-dim .4s ease ${pick}s forwards`}` }}>
                  <b>{w.t}</b><Picto name={w.ico} />
                </div>
              );
            })}
          </div>
        </div>

        {/* 16–20초: 그 기준으로 봐요(1회) */}
        <div className="k-prod">
          <p className="k-title"><Line t={bar(8)} end={bar(10)}>그 기준으로 봐요.</Line></p>
          <Cam i={0} className="main" style={A(bar(8) + B / 2, bar(10), 'up', drift(bar(8), bar(10)))} label="1회" />
          <div className="k-std" style={A(bar(8) + B, bar(10), 'up')}><span className="art-1">업무 보고 기준</span></div>
          <ul className="k-bars">
            {SCORES.map((s, i) => {
              const t = bar(8) + (i + 3) * B;
              return (
                <li key={s.l} style={A(t, bar(10), 'up')}><span>{s.l}</span><i><b style={{ width: `${s.a}%`, background: `var(${s.c})`, animation: `k-bar .9s ${EASE} ${t}s both` }} /></i>
                  <em data-to={s.a} data-t0={t} data-t1={t + 0.8}>0</em></li>
              );
            })}
          </ul>
        </div>

        {/* 20–22초: 브레이크다운 */}
        <div className="k-center">
          <p className="k-h big"><Line t={bar(10)} end={bar(11)}>짚어 준 대로 고치고,</Line></p>
          <p className="k-h big"><Line t={bar(10) + 2 * B} end={bar(11)} className="blue">다시.</Line></p>
        </div>

        {/* 22–26초: 1회 → 4회 */}
        <div className="k-prod">
          <p className="k-title"><Line t={bar(11)} end={bar(13)}>네 번째엔, 이만큼.</Line></p>
          <Cam i={1} className="old" style={A(bar(11), bar(13), 'fade')} label="1회" />
          <span className="k-arrow" style={A(bar(11) + B, bar(13), 'fade')} />
          <Cam i={2} className="new" style={A(bar(11) + B, bar(13), 'up', drift(bar(11), bar(13)))} label="4회" />
          <ul className="k-bars after">
            {SCORES.map((s, i) => {
              const t = bar(11) + (i + 2) * B;
              return (
                <li key={s.l} style={A(bar(11) + B, bar(13), 'up')}><span>{s.l}</span>
                  <i><u style={{ left: `${s.a}%` }} /><b style={{ width: `${s.b}%`, background: `var(${s.c})`, transformOrigin: '0 50%', animation: `k-from .9s ${EASE} ${t}s both`, ['--k0' as string]: s.a / s.b }} /></i>
                  <em data-from={s.a} data-to={s.b} data-t0={t} data-t1={t + 0.8}>{s.a}</em>
                  <small style={A(t + 0.8, bar(13), 'fade')}>+{s.b - s.a}</small></li>
              );
            })}
          </ul>
        </div>

        {/* 26–28초 */}
        <div className="k-center">
          <p className="k-h"><Line t={bar(13)} end={bar(14)}>중요한 발표 한 번,</Line></p>
          <p className="k-h"><Line t={bar(13) + 2 * B} end={bar(14)} className="blue">그 상황의 정답으로.</Line></p>
        </div>

        {/* 28–30초: 로고 */}
        <div className="k-end">
          <div className="k-logo">
            <span className="k-mark"><BrandMark /></span>
            <b>{'Talkstage'.split('').map((ch, i) => <span key={i} className="k-m"><span style={A(bar(14) + 0.15 + i * 0.03, DURATION + 1, 'rise')}>{ch}</span></span>)}</b>
          </div>
          <p><Line t={bar(14) + B} end={DURATION + 1}>다음 발표 전에, 한 번 녹화해 보세요.</Line></p>
          <span className="k-cta" style={A(bar(14) + 2 * B, DURATION + 1, 'up')}>무료로 리허설 시작하기<i aria-hidden="true">→</i></span>
        </div>
      </div>
      {!render && <div className="pm-bar">미리보기(소리 없음) · {now}초 / {DURATION}초 · 캡처는 ?render=1</div>}
    </div>
  );
}
