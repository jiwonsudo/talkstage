'use client';
import { useEffect, useRef, useState } from 'react';
import { DEMO, type DemoIssue } from './demoData';

type Key = 'a' | 'b';
type Frame = { t: number; p: number[] | null; f: number[] | null; g: boolean | null; d: boolean; b: boolean | null; w: string[] };
type Track = { faceEdges: [number, number][]; frames: Frame[] };

const CLIPS: Record<Key, { src: string; poster: string; track: string; title: string; sub: string }> = {
  a: { src: '/media/nv-a.mp4', poster: '/media/nv-a.jpg', track: '/media/nv-a.track.json', title: '원고만 내려다본 발표', sub: '피드백 전' },
  b: { src: '/media/nv-b.mp4', poster: '/media/nv-b.jpg', track: '/media/nv-b.track.json', title: '피드백대로 다시 한 발표', sub: '피드백 후' },
};
const CAT_COLOR: Record<string, string> = { gaze: 'var(--blue)', posture: 'var(--green)', gesture: 'var(--orange)', tone: 'var(--pink)', pause: 'var(--purple)' };
const POSE_PAIRS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [0, 2], [0, 5], [2, 7], [5, 8]];
const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26];
const WHY: Record<string, string> = { slouch: '등 굽음', shoulderTilt: '어깨 기욺', headTilt: '고개 기욺', crossed: '팔짱', offCenter: '가장자리' };
const sec = (n: number) => `${n.toFixed(1)}초`;

/** 가장 가까운 프레임(프레임은 시간순) */
function frameAt(fr: Frame[], t: number) {
  let lo = 0, hi = fr.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (fr[m].t < t) lo = m + 1; else hi = m; }
  return lo > 0 && Math.abs(fr[lo - 1].t - t) < Math.abs(fr[lo].t - t) ? fr[lo - 1] : fr[lo];
}

/**
 * 랜딩 "실제 분석 예시". 영상을 누르면 고른 영상 위에 MediaPipe 가 잡은 뼈대·얼굴과 프레임별 판정을 겹쳐 보여 주고,
 * 아래에 리포트처럼 항목 점수·코칭·문제 구간을 보여 줘요. 영상은 AI로 만든 예시지만 분석은 앱과 같은 코드로 실제로 돌린 결과예요.
 */
export function NvDemo() {
  const [sel, setSel] = useState<Key>('a');
  const vids = useRef<Record<Key, HTMLVideoElement | null>>({ a: null, b: null });
  const canvases = useRef<Record<Key, HTMLCanvasElement | null>>({ a: null, b: null });
  const chips = useRef<Record<Key, HTMLDivElement | null>>({ a: null, b: null });
  const [loaded, setLoaded] = useState<Record<Key, boolean>>({ a: false, b: false });

  // 화면에 보이면 둘 다 소리 없이 재생
  useEffect(() => {
    const vs = (['a', 'b'] as Key[]).map((k) => vids.current[k]!).filter(Boolean);
    vs.forEach((v) => { if (v.readyState >= 2) setLoaded((l) => ({ ...l, [v.dataset.k as Key]: true })); });
    const io = new IntersectionObserver((es) => es.forEach((e) => { const v = e.target as HTMLVideoElement; if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }), { threshold: 0.3 });
    vs.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, []);

  // 고른 영상 위에 인식 결과 그리기(영상 시간에 맞춰)
  useEffect(() => {
    let raf = 0, alive = true, track: Track | null = null;
    const v = vids.current[sel], cv = canvases.current[sel], chip = chips.current[sel];
    if (!v || !cv) return;
    fetch(CLIPS[sel].track).then((r) => r.json()).then((t: Track) => { if (alive) track = t; }).catch(() => {});
    const css = getComputedStyle(cv);
    const col = { ok: css.getPropertyValue('--green').trim() || '#1ed760', bad: css.getPropertyValue('--red').trim() || '#e5484d', face: 'rgba(255,255,255,.75)', eye: css.getPropertyValue('--yellow').trim() || '#ffd400' };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const ctx = cv.getContext('2d');
      if (!ctx || !track) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const f = frameAt(track.frames, v.currentTime);
      if (!f) return;
      ctx.lineCap = 'round';
      if (f.p) {
        const P = (i: number) => ({ x: f.p![i * 3] * W, y: f.p![i * 3 + 1] * H, v: f.p![i * 3 + 2] });
        ctx.strokeStyle = f.b ? col.bad : col.ok;
        ctx.lineWidth = 2.5;
        for (const [a, b] of POSE_PAIRS) {
          const A = P(a), B = P(b);
          if (A.v < 0.5 || B.v < 0.5) continue;
          ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        for (const i of JOINTS) { const A = P(i); if (A.v < 0.5) continue; ctx.beginPath(); ctx.arc(A.x, A.y, 3, 0, Math.PI * 2); ctx.fill(); }
      }
      if (f.f) {
        const Q = (i: number) => ({ x: f.f![i * 2] * W, y: f.f![i * 2 + 1] * H });
        ctx.strokeStyle = f.g ? col.eye : col.face;
        ctx.lineWidth = 1;
        for (const [a, b] of track.faceEdges) { const A = Q(a), B = Q(b); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); }
      }
      // 프레임별 판정 칩(React 상태 대신 data 속성으로: 매 프레임 다시 그리지 않게)
      if (chip) {
        const [g, p] = chip.children as unknown as HTMLElement[];
        g.dataset.ok = String(!!f.g); g.lastElementChild!.textContent = f.f ? (f.g ? '렌즈 봄' : f.d ? '아래 봄' : '딴 곳') : '얼굴 없음';
        p.dataset.ok = String(f.b === false); p.lastElementChild!.textContent = f.b == null ? '몸 없음' : f.b ? (WHY[f.w[0]] ?? '흐트러짐') : '바름';
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(raf); const ctx = cv.getContext('2d'); ctx?.clearRect(0, 0, cv.width, cv.height); };
  }, [sel]);

  const seek = (i: DemoIssue) => { const v = vids.current[sel]; if (v) { v.currentTime = i.t0; v.play().catch(() => {}); } };
  const d = DEMO[sel];
  const tips = [...d.cats].filter((c) => c.headline).sort((x, y) => (x.score ?? 100) - (y.score ?? 100)).slice(0, 2);

  return (
    <div className="nvd">
      <p className="nv-try rv">영상을 눌러 Talkstage가 분석한 결과를 확인해 보세요.</p>
      <div className="nv-pair nvd-pair">
        {(['a', 'b'] as Key[]).map((k) => (
          <button key={k} type="button" className={`nv-vid nvd-pick nv-${k}`} aria-pressed={sel === k} onClick={() => setSel(k)}>
            <span className={`nv-frame${loaded[k] ? ' has-video' : ''}`}>
              <video ref={(el) => { vids.current[k] = el; }} data-k={k} src={CLIPS[k].src} poster={CLIPS[k].poster} muted loop playsInline preload="metadata"
                onLoadedData={() => setLoaded((l) => ({ ...l, [k]: true }))} />
              <canvas ref={(el) => { canvases.current[k] = el; }} className="nvd-ov" aria-hidden="true" />
              <span className="nvd-live" ref={(el) => { chips.current[k] = el as HTMLDivElement | null; }} aria-hidden="true">
                <i><b>시선</b><span /></i>
                <i><b>자세</b><span /></i>
              </span>
              <span className="nvd-tag">MediaPipe 실시간 인식</span>
            </span>
            <span className="nvd-cap"><b>{CLIPS[k].title}</b><small>{CLIPS[k].sub}</small></span>
          </button>
        ))}
      </div>

      <section className="nvd-report rv" aria-live="polite">
        <div key={sel} className="nvd-in">
          <header className="nvd-head">
            <span className="nvd-kicker">Talkstage 분석 결과</span>
            <h3>{CLIPS[sel].title}</h3>
            <p className="nvd-disc">영상은 AI로 만든 예시예요. 분석은 실제 Talkstage 분석기에 그대로 넣어 나온 결과예요.</p>
          </header>
          <ul className="nvd-scores">
            {d.cats.map((c) => (
              <li key={c.id} data-status={c.status} style={{ '--c': CAT_COLOR[c.id] }}>
                <span>{c.label}</span>
                <span className="nvd-meter" aria-hidden="true"><i style={{ width: `${c.score ?? 0}%` }} /></span>
                <b>{c.score ?? '–'}</b>
                <small>{c.value ?? ''}{c.target ? ` · 목표 ${c.target}` : ''}</small>
              </li>
            ))}
          </ul>
          <div className="nvd-cols">
            <div>
              <h4>코칭</h4>
              <ol className="nvd-tips">
                {tips.map((c) => (
                  <li key={c.id}><i className="nvd-chip" style={{ '--c': CAT_COLOR[c.id] }} data-on-light={c.id === 'posture' ? '' : undefined}>{c.label}</i><b>{c.headline}</b><span>{c.advice}</span></li>
                ))}
              </ol>
            </div>
            <div>
              <h4>문제 구간</h4>
              {d.issues.length ? (
                <ul className="nvd-issues">
                  {d.issues.map((i) => (
                    <li key={`${i.cat}-${i.t0}`}>
                      <button type="button" onClick={() => seek(i)} aria-label={`${sec(i.t0)}부터 다시 보기`}>
                        <em><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z" /></svg>{sec(i.t0)}–{sec(i.t1)}</em><b>{i.title}</b><small>{i.detail}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="nvd-none">문제 구간이 없어요.</p>}
            </div>
          </div>
          <p className="nvd-foot">MediaPipe 자세·얼굴 인식(초당 약 10프레임)과 음성 분석으로 쟀어요. 업무 보고·서서 발표 기준이고, 10초짜리 예시라 총점 없이 항목 점수만 보여 줘요. 말 빠르기·군더더기 말·내용 구조는 받아쓰기가 필요해서 이 예시에선 뺐어요.</p>
        </div>
      </section>
    </div>
  );
}
