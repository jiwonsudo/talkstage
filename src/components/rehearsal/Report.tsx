'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Picto } from '@/components/ui/Picto';
import { outcomeWeight, pickOutcomes, type Analysis } from '@/lib/coach/analysis';
import { coachFor, EVIDENCE, NOT_USED, selfCompare, type Coaching } from '@/lib/coach/coach';
import { download, fixDuration, makeThumbs, pickMime, seekTo } from '@/lib/coach/media';
import { drawTimeline, TL_HEIGHT, timeAt } from '@/lib/coach/timeline';
import type { CatResult, Check, Highlight, Setup } from '@/lib/coach/types';
import type { Rehearsal } from '@/lib/data/types';
import { CATS, CAT_LABEL, fmtTime, type CatId, type Purpose } from '@/lib/scenarios';

const STATUS_TEXT = { good: '좋음', warn: '보완', bad: '집중', na: '측정 불가' } as const;
const EV_TYPE = { research: '연구', book: '서적', practitioner: '실무 가이드' } as const;
const KIND_TEXT = { match: '예상대로', better: '생각보다 잘함', blind: '몰랐던 약점', ok: '강점 확인' } as const;
const FILLERS = new Set(['어', '어어', '음', '음음', '으음', '흠', '저', '저기', '이제', '약간', '막', '뭐', '뭔가', '뭐랄까', '그냥']);
const BAR_DOMAIN: Partial<Record<CatId, [number, number]>> = { pace: [150, 450], pause: [0, 0.5], tone: [0, 8], gaze: [0, 1], gesture: [0, 0.7], filler: [0, 10] };

export type ReportProps = {
  result: Analysis;
  videoURL: string;
  setup: Setup;
  purpose: Purpose;
  /** 같은 상황·자세의 지난 리허설(최신이 마지막) */
  prev: Rehearsal | null;
  history: { at: number; overall: number | null; focus: string | null }[];
  onRetry: (focus: CatId | null) => void;
  onEdit: (focus: CatId | null) => void;
  onHome: () => void;
};

function EvidenceList({ ids, open = false }: { ids: string[]; open?: boolean }) {
  const list = ids.map((id) => EVIDENCE[id]).filter(Boolean);
  if (!list.length) return null;
  return (
    <details className="ev" open={open}>
      <summary>근거 {list.length}건</summary>
      <ul>{list.map((e) => (
        <li key={e.cite}><span className={`ev-type ev-${e.type}`}>{EV_TYPE[e.type]}</span><div><b>{e.cite}</b><span className="ev-title">{e.title}</span><p>{e.claim}</p></div></li>
      ))}</ul>
    </details>
  );
}

function RangeBar({ c, purpose, posture }: { c: CatResult; purpose: Purpose; posture: Setup['posture'] }) {
  const T = purpose.targets;
  const band: Partial<Record<CatId, [number, number]>> = { pace: T.spm, pause: T.pause, tone: T.pitch, gaze: [T.gaze, 1], gesture: T.gesture[posture], filler: [0, T.filler] };
  const b = band[c.id], dom = BAR_DOMAIN[c.id];
  if (!b || !dom || c.raw == null) return c.score == null ? null : <div className="bar"><span className="bar-fill" style={{ width: `${c.score}%` }} /></div>;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - dom[0]) / (dom[1] - dom[0])) * 100));
  return (
    <div className="bar range">
      <span className="bar-band" style={{ left: `${pct(b[0])}%`, width: `${pct(b[1]) - pct(b[0])}%` }} />
      <span className={`bar-dot st-${c.status}`} style={{ left: `${pct(c.raw)}%` }} />
    </div>
  );
}

/** 리포트: 요약, 우선순위, AI 하이라이트, 타임라인, 항목별 코칭, 내용 구조, 자기 인식 비교, 다음 리허설 */
export function Report({ result: R, videoURL, setup, purpose, prev, history, onRetry, onEdit, onHome }: ReportProps) {
  const posture = setup.posture;
  const cats = R.cats;
  const outs = pickOutcomes(purpose, setup);
  const outcome = outs.map((o) => o.label).join(' · ');
  const anxious = (setup.profile?.anxiety ?? 0) >= 4;
  const weightOf = useCallback((id: CatId) => (purpose.weights[id] || 1) * outcomeWeight(outs, id), [purpose, outs]);
  const catList = Object.values(cats);
  const coached = useMemo(() => Object.fromEntries(catList.map((c) => [c.id, coachFor(c, purpose, setup)])) as Record<CatId, Coaching>, [catList, purpose, setup]);
  const nPri = anxious ? 2 : 3;
  const priorities = catList.filter((c) => c.score != null && c.score < 80)
    .sort((a, b) => (100 - b.score!) * weightOf(b.id) - (100 - a.score!) * weightOf(a.id)).slice(0, nPri);
  const self = selfCompare(setup.profile, cats);
  const delta = prev && R.overall != null && prev.overall != null ? R.overall - prev.overall : null;
  const strengths = R.highlights.strengths, weaknesses = R.highlights.weaknesses;
  const checks: Check[] = cats.content?.extra?.checks ?? [];
  const suggested = priorities[0]?.id ?? self.find((s) => s.kind === 'blind' || s.kind === 'match')?.cat ?? null;
  const [focus, setFocus] = useState<CatId | null>(suggested);

  // 고칠 순간은 전체 점수와 관계없이 그 구간의 문제에 맞는 교정 문장을 써요.
  const problemCoach = useCallback((h: Highlight): Coaching | null => {
    const c = cats[h.cat as CatId];
    if (!c) return null;
    const t = h.title;
    const dir = h.cat === 'pace' ? (t.includes('느려') ? 'low' : 'high')
      : h.cat === 'pause' ? (t.includes('끊김') ? 'high' : c.dir)
        : h.cat === 'filler' ? 'high'
          : h.cat === 'gaze' || h.cat === 'gesture' ? 'low'
            : h.cat === 'tone' ? (t.includes('단조') ? 'low' : c.dir) : c.dir;
    const extra = { ...c.extra };
    if (h.cat === 'pause' && t.includes('이어')) extra.longRuns = Math.max(1, extra.longRuns || 0);
    if (h.cat === 'pause' && t.includes('끊김')) extra.longRuns = 0;
    if (h.cat === 'tone' && t.includes('말끝')) { extra.fadeHigh = true; extra.fadeRatio = extra.fadeRatio ?? 0.3; }
    if (h.cat === 'gaze' && t.includes('아래')) extra.downRatio = 1;
    if (h.cat === 'posture') extra.mainIssue = `${t.replace(/ 자세$/, '')} 자세가 보인`;
    return coachFor({ ...c, dir, score: Math.min(c.score ?? 70, 70), extra }, purpose, setup);
  }, [cats, purpose, setup]);

  // ---------- 영상 · 클립 재생 ----------
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const clip = useRef<{ t1: number; onEnd?: () => void } | null>(null);
  const [banner, setBanner] = useState<{ text: string; cls: string } | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const toReview = () => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const seek = (t: number) => {
    const v = videoRef.current!;
    clip.current = null; setBanner(null);
    v.currentTime = Math.max(0, t);
    v.play().catch(() => {});
    toReview();
  };
  const playClip = useCallback((h: Highlight, onEnd?: () => void) => {
    const v = videoRef.current!;
    clip.current = { t1: h.t1, onEnd };
    setBanner({ text: `${h.kind === 'strength' ? '잘한 순간' : '고칠 순간'} · ${h.title} (${fmtTime(h.t0)}–${fmtTime(h.t1)})`, cls: h.kind === 'strength' ? 'is-s' : 'is-w' });
    v.currentTime = h.t0;
    v.play().catch(() => {});
  }, []);
  const playReel = () => {
    const reel = anxious ? [...strengths, ...weaknesses] : [...weaknesses, ...strengths];
    let k = 0;
    toReview();
    const next = () => { if (k >= reel.length) { setBanner(null); return; } playClip(reel[k++], () => setTimeout(next, 700)); };
    next();
  };

  async function saveClip(h: Highlight, key: string) {
    const v = videoRef.current as (HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }) | null;
    const cap = v?.captureStream ?? v?.mozCaptureStream;
    if (!v || !cap || !window.MediaRecorder) { setBanner({ text: '이 브라우저는 클립 저장을 지원하지 않아요.', cls: 'is-w' }); return; }
    setSaving(key);
    clip.current = null;
    v.pause();
    await seekTo(v, h.t0);
    const mime = pickMime();
    const rec = new MediaRecorder(cap.call(v), mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start(250);
    setBanner({ text: `클립 저장 중 · ${h.title}`, cls: 'is-rec' });
    await v.play().catch(() => {});
    await new Promise<void>((r) => {
      const chk = () => { if (v.currentTime >= h.t1 || v.ended) { v.removeEventListener('timeupdate', chk); r(); } };
      v.addEventListener('timeupdate', chk);
    });
    v.pause(); rec.stop(); await stopped;
    setBanner(null);
    const ext = (mime || 'video/webm').includes('mp4') ? 'mp4' : 'webm';
    download(new Blob(chunks, { type: mime || 'video/webm' }), `${h.kind === 'strength' ? '잘한순간' : '고칠순간'}_${h.title.replace(/\s+/g, '')}_${fmtTime(h.t0).replace(':', 'm')}s.${ext}`);
    setSaving(null);
  }

  // 타임라인 그리기와 재생 위치 따라가기
  useEffect(() => {
    const v = videoRef.current!, cv = canvasRef.current!;
    let raf = 0;
    const draw = () => drawTimeline(cv, R, purpose, v.currentTime);
    const loop = () => { draw(); if (!v.paused) raf = requestAnimationFrame(loop); };
    const onPlay = () => { cancelAnimationFrame(raf); loop(); };
    const onTime = () => {
      const c = clip.current;
      if (c && v.currentTime >= c.t1) { clip.current = null; v.pause(); if (c.onEnd) c.onEnd(); else setBanner(null); }
    };
    v.addEventListener('play', onPlay); v.addEventListener('seeked', draw); v.addEventListener('pause', draw); v.addEventListener('timeupdate', onTime);
    const ro = new ResizeObserver(draw); ro.observe(cv);
    fixDuration(v).then(draw);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      v.removeEventListener('play', onPlay); v.removeEventListener('seeked', draw); v.removeEventListener('pause', draw); v.removeEventListener('timeupdate', onTime);
    };
  }, [R, purpose]);

  // 하이라이트 썸네일
  useEffect(() => {
    const all = [...strengths.map((h, i) => [`s${i}`, h] as const), ...weaknesses.map((h, i) => [`w${i}`, h] as const)];
    if (!all.length) return;
    let live = true;
    makeThumbs(videoURL, all.map(([, h]) => (h.t0 + h.t1) / 2))
      .then((urls) => { if (live) setThumbs(Object.fromEntries(all.map(([k], n) => [k, urls[n]]))); })
      .catch((e) => console.warn('썸네일 생성 실패', e));
    return () => { live = false; };
  }, [videoURL, strengths, weaknesses]);

  const usedEvidence = [...new Set([
    ...Object.values(coached).flatMap((c) => c.evidence),
    ...weaknesses.flatMap((h) => problemCoach(h)?.evidence ?? []),
    ...checks.filter((k) => k.pass === false).flatMap((k) => k.evidence),
  ])].map((id) => EVIDENCE[id]).filter(Boolean);

  const TChip = ({ t }: { t: number }) => <button className="tchip" type="button" onClick={() => seek(t)}>{fmtTime(t)}</button>;

  const HlCard = ({ h, k }: { h: Highlight; k: string }) => {
    const isW = h.kind === 'weakness';
    const co = isW ? problemCoach(h) : coached[h.cat as CatId];
    const play = () => { toReview(); playClip(h); };
    return (
      <article className={`hl ${isW ? 'hl-w' : 'hl-s'}`}>
        <button className="hl-thumb" type="button" onClick={play} aria-label={`${h.title} 구간 재생`}>
          <span className="thumb-img" style={thumbs[k] ? { backgroundImage: `url(${thumbs[k]})` } : undefined} />
          <span className="hl-time">{fmtTime(h.t0)} – {fmtTime(h.t1)}</span><span className="hl-play">▶</span>
        </button>
        <div className="hl-body">
          <span className="hl-tag">{isW ? '고칠 순간' : '잘한 순간'} · {CAT_LABEL[h.cat as CatId] ?? ''}</span>
          <h4>{h.title}</h4>
          <p>{isW ? h.reasons[0] : h.reasons.join(' · ')}</p>
          {isW && co && <><p className="hl-fix"><b>이렇게 고쳐 보세요</b> {co.advice}</p><EvidenceList ids={co.evidence} /></>}
          <div className="hl-actions">
            <button type="button" className="btn-ghost sm" onClick={play}>재생</button>
            <button type="button" className="btn-ghost sm" disabled={saving !== null} onClick={() => saveClip(h, k)}>{saving === k ? '구간 재생하며 저장 중…' : '클립 저장'}</button>
          </div>
        </div>
      </article>
    );
  };

  const strengthsSection = (
    <div className="hl-group"><h3>잘한 순간</h3>
      {strengths.length ? <div className="hl-row">{strengths.map((h, i) => <HlCard key={i} h={h} k={`s${i}`} />)}</div>
        : <p className="muted">여러 항목이 동시에 좋았던 8초 이상의 구간을 찾지 못했어요. 다음 리허설에서 한 항목씩 개선해 보세요.</p>}
    </div>
  );
  const weakSection = (
    <div className="hl-group"><h3>고칠 순간</h3>
      {weaknesses.length ? <div className="hl-row">{weaknesses.map((h, i) => <HlCard key={i} h={h} k={`w${i}`} />)}</div>
        : <p className="muted">눈에 띄는 문제 구간이 없었어요.</p>}
    </div>
  );
  const priSection = (
    <section className="r-sec">
      <h2>가장 먼저 고칠 {nPri}가지</h2>
      {!anxious && <p className="sec-lead">{setup.purposeName ? `${setup.purposeName}(${purpose.label})` : purpose.label} 기준과 원하는 결과({outcome})에 맞춰 점수 손실이 큰 순서로 골랐어요.</p>}
      <div className="pri-list">
        {priorities.length ? priorities.map((c, k) => {
          const co = coached[c.id];
          const inst = R.issues.filter((i) => i.cat === c.id).slice(0, 5);
          return (
            <article key={c.id} className="pri">
              <div className={`pri-rank cover cover-${(k % 5) + 1}`}>{k + 1}</div>
              <div className="pri-body">
                <span className="pri-cat">{c.label} · {c.score}점</span>
                <h3>{co.headline}</h3>
                <p>{co.advice}</p>
                {co.drill && <p className="drill"><b>연습법</b> {co.drill}</p>}
                {inst.length > 0 && <div className="tchips"><span>해당 구간</span>{inst.map((i) => <TChip key={i.id} t={i.t0} />)}</div>}
                <EvidenceList ids={co.evidence} />
              </div>
            </article>
          );
        }) : <p className="empty-note">모든 항목이 80점 이상이에요. 다음 리허설에서는 목표 시간을 줄이거나 더 어려운 상황을 골라 보세요.</p>}
      </div>
    </section>
  );

  const focusDelta = setup.focus && prev?.scores?.[setup.focus] != null && cats[setup.focus]?.score != null
    ? cats[setup.focus].score! - prev.scores[setup.focus]! : null;

  return (
    <section className="screen">
      <div className="report">
        <section className="r-hero cover-2">
          <div className="r-score"><span className="r-score-lbl">종합 점수</span><span className="r-score-num">{R.overall ?? '–'}</span><span className="r-score-bar"><i style={{ width: `${R.overall ?? 0}%` }} /></span></div>
          <div className="r-meta">
            <div className="chips">
              <span className="chip">{setup.purposeName || purpose.label}</span>
              <span className="chip">{posture === 'seated' ? '앉아서' : '서서'}</span>
              <span className="chip">{fmtTime(R.dur)} / 목표 {fmtTime(setup.targetSec)}</span>
              {setup.focus && <span className="chip chip-accent">집중: {CAT_LABEL[setup.focus]}</span>}
            </div>
            <h1>{setup.topic || '제목 없는 발표'}</h1>
            <p className="r-sub">원하는 결과: <b>{setup.outcomeText || outcome}</b>{setup.keyMessage ? ` · 핵심 메시지: “${setup.keyMessage}”` : ''}</p>
            {delta != null && (
              <p className={`r-delta ${delta >= 0 ? 'up' : 'down'}`}>
                같은 상황의 지난 리허설보다 {delta >= 0 ? '+' : ''}{delta}점
                {focusDelta != null && ` · 집중 항목 ${CAT_LABEL[setup.focus!]} ${focusDelta >= 0 ? '+' : ''}${focusDelta}점`}
              </p>
            )}
            {anxious && <p className="r-kind">긴장을 많이 한다고 답하셨죠. 잘한 순간부터 보고, 고칠 점은 두 가지만 골랐어요.</p>}
          </div>
          <Picto name={purpose.id} />
        </section>

        {!anxious && priSection}

        <section className="r-sec">
          <div className="sec-head">
            <div><h2>AI 하이라이트</h2><p className="sec-lead">녹화에서 잘한 순간과 고칠 순간을 자동으로 잘라냈어요.</p></div>
            <button type="button" className="btn" disabled={!(strengths.length + weaknesses.length)} onClick={playReel}>하이라이트 이어서 보기</button>
          </div>
          {anxious ? <>{strengthsSection}{weakSection}</> : <>{weakSection}{strengthsSection}</>}
        </section>

        {anxious && priSection}

        <section className="r-sec" ref={reviewRef}>
          <h2>전체 영상과 타임라인</h2>
          <p className="sec-lead">청중에게 보이는 방향(좌우 반전 없음)으로 재생돼요. 타임라인이나 시각을 누르면 그 장면으로 이동해요.</p>
          <div className="review">
            <div className="player-col">
              <div className="player">
                <video ref={videoRef} controls playsInline src={videoURL} />
                {banner && <div className={`clip-banner ${banner.cls}`}>{banner.text}</div>}
              </div>
              <div className="tl-wrap">
                <canvas ref={canvasRef} className="tl-canvas" height={TL_HEIGHT} aria-label="발화, 속도, 시선, 자세, 제스처 타임라인"
                  onClick={(e) => { const t = timeAt(e.currentTarget, e.clientX, R.dur); if (t >= 0 && t <= R.dur) { clip.current = null; setBanner(null); videoRef.current!.currentTime = t; } }} />
              </div>
              <div className="tl-legend"><span><i className="lg lg-voice" />말한 구간</span><span><i className="lg lg-band" />목표 속도</span><span><i className="lg lg-good" />좋음</span><span><i className="lg lg-bad" />문제</span><span><i className="lg lg-filler" />군더더기 말</span></div>
            </div>
            <div className="issues-col">
              <h3>문제 구간 {R.issues.length}개</h3>
              <ol className="issues">
                {R.issues.length ? R.issues.map((i) => (
                  <li key={i.id} className={`sev${i.sev}`}>
                    <button type="button" onClick={() => seek(i.t0)}><span className="it">{fmtTime(i.t0)}</span><span className="ic">{CAT_LABEL[i.cat]}</span><b>{i.title}</b><span className="id">{i.detail}</span></button>
                  </li>
                )) : <li className="muted">눈에 띄는 문제 구간이 없었어요.</li>}
              </ol>
            </div>
          </div>
        </section>

        <section className="r-sec">
          <h2>항목별 코칭</h2>
          <p className="sec-lead">목표 범위는 {purpose.label} · {posture === 'seated' ? '앉아서' : '서서'} 기준이에요.{prev ? ' 숫자 옆의 증감은 지난 리허설과 비교한 값이에요.' : ''}</p>
          <div className="cat-grid">
            {CATS.map(({ id }) => {
              const c = cats[id];
              if (!c) return null;
              const co = coached[id];
              const pd = prev?.scores?.[id];
              const d = c.score != null && pd != null ? c.score - pd : null;
              return (
                <article key={id} className={`cat st-${c.status}`}>
                  <header><h3>{c.label}</h3><span className={`pill st-${c.status}`}>{STATUS_TEXT[c.status]}</span></header>
                  <div className="cat-score"><span className="num">{c.score ?? '–'}</span>{d != null && d !== 0 && <span className={`delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '+' : ''}{d}</span>}</div>
                  <dl><div><dt>측정</dt><dd>{c.value ?? '–'}{id === 'time' && c.value != null ? '초' : ''}</dd></div><div><dt>목표</dt><dd>{c.target || '–'}</dd></div></dl>
                  <RangeBar c={c} purpose={purpose} posture={posture} />
                  {c.score != null
                    ? <><p className="cat-head">{co.headline}</p><p className="cat-adv">{co.advice}</p><EvidenceList ids={co.evidence} /></>
                    : <p className="cat-adv muted">이번 녹화에서는 측정하지 못했어요.</p>}
                </article>
              );
            })}
          </div>
        </section>

        <section className="r-sec two-col">
          <div>
            <h2>내용 구조</h2>
            <p className="sec-lead">받아쓰기 내용을 바탕으로 핵심 메시지와 구조를 점검했어요.</p>
            <ul className="checks">
              {checks.map((k) => (
                <li key={k.id} className={`ck-${k.pass === true ? 'pass' : k.pass === false ? 'fail' : 'na'}`}>
                  <span className="ck-ico" aria-hidden="true">{k.pass === true ? '✓' : k.pass === false ? '!' : '–'}</span>
                  <div><b>{k.label}</b><p>{k.detail}</p>{k.pass === false && <><p className="ck-fix">{k.fix}</p><EvidenceList ids={k.evidence} /></>}</div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>받아쓰기</h2>
            <p className="sec-lead">노란색은 군더더기 말이에요.</p>
            <div className="transcript">
              {R.finals.length ? R.finals.map((f, i) => (
                <p key={i}><TChip t={f.t0} />{' '}
                  {f.text.split(/\s+/).map((w, j) => <span key={j}>{j > 0 && ' '}{FILLERS.has(w.replace(/[.,!?~…]/g, '')) ? <mark>{w}</mark> : w}</span>)}
                </p>
              )) : <p className="muted">받아쓰기를 사용하지 않았거나 인식된 말이 없어요.</p>}
            </div>
          </div>
        </section>

        {self.length > 0 && (
          <section className="r-sec">
            <h2>걱정과 실제 비교</h2>
            <p className="sec-lead">녹화 전에 고른 가장 큰 고민과 측정 결과를 비교했어요.</p>
            <div className="table-wrap">
              <table className="self">
                <thead><tr><th>습관</th><th>내 고민</th><th>측정 결과</th><th>해석</th></tr></thead>
                <tbody>{self.map((s) => (
                  <tr key={s.qid}>
                    <th scope="row">{s.label}</th>
                    <td>{s.self >= 5 ? <b>가장 걱정한 부분</b> : '—'}</td>
                    <td><span className={`pill st-${s.score >= 80 ? 'good' : s.score >= 55 ? 'warn' : 'bad'}`}>{CAT_LABEL[s.cat]} {s.score}점</span></td>
                    <td><span className={`kind kind-${s.kind}`}>{KIND_TEXT[s.kind]}</span><p>{s.msg}</p></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        )}

        <section className="r-sec next">
          <h2>다음 리허설</h2>
          <p className="sec-lead">한 번에 하나만 고치는 게 가장 빨라요. 집중할 항목을 고르면 녹화 중 실시간 알림이 그 항목에만 뜨고, 리포트에서 변화를 따로 보여줘요.</p>
          <div className="focus-pick" role="radiogroup" aria-label="집중 항목">
            <label className="fp"><input type="radio" name="focus" checked={!focus} onChange={() => setFocus(null)} /><span>전체</span></label>
            {CATS.filter((c) => !['content', 'time'].includes(c.id) && cats[c.id]?.score != null).map((c) => (
              <label key={c.id} className="fp"><input type="radio" name="focus" checked={focus === c.id} onChange={() => setFocus(c.id)} /><span>{c.label}{c.id === suggested ? ' · 추천' : ''}</span></label>
            ))}
          </div>
          <div className="next-actions">
            <button type="button" className="btn" onClick={() => onRetry(focus)}>같은 설정으로 다시 녹화</button>
            <button type="button" className="btn-ghost" onClick={() => onEdit(focus)}>발표 설정 바꾸기</button>
            <button type="button" className="btn-ghost" onClick={() => fetch(videoURL).then((r) => r.blob()).then((b) => download(b, `리허설_${purpose.label}_${new Date().toISOString().slice(0, 10)}.${b.type.includes('mp4') ? 'mp4' : 'webm'}`))}>전체 녹화 파일 저장</button>
            <button type="button" className="btn-ghost" onClick={onHome}>홈으로</button>
          </div>
          {history.length > 0 && (
            <div className="hist"><h3>같은 상황 리허설 기록</h3>
              <ul>{history.slice(-6).reverse().map((h) => (
                <li key={h.at}><span>{new Date(h.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><b>{h.overall ?? '–'}점</b>{h.focus && <em>집중: {CAT_LABEL[h.focus as CatId]}</em>}</li>
              ))}</ul>
            </div>
          )}
        </section>

        <section className="r-sec refs">
          <h2>측정 방법과 근거</h2>
          <div className="refs-grid">
            <div>
              <h3>이번 녹화의 한계</h3>
              <ul className="limits">
                {R.limits.length ? R.limits.map((l) => <li key={l}>{l}</li>) : <li>특별한 측정 문제는 없었어요.</li>}
                <li>목표 범위는 연구와 실무 가이드를 참고해 정한 프로토타입 기준값이에요. 한국어 발표 데이터로 보정하는 중이에요.</li>
              </ul>
              <h3>일부러 쓰지 않은 근거</h3>
              <ul className="limits">{NOT_USED.map((n) => <li key={n.name}><b>{n.name}</b> {n.why}</li>)}</ul>
            </div>
            <div>
              <h3>이번 리포트에 쓴 근거</h3>
              <ul className="ref-list">{usedEvidence.map((e) => <li key={e.cite}><span className={`ev-type ev-${e.type}`}>{EV_TYPE[e.type]}</span><div><b>{e.cite}</b><span className="ev-title">{e.title}</span></div></li>)}</ul>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
