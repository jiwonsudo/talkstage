'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';
import { syllables } from '@/lib/coach/audio';
import { analyzeScript, contour, readScriptFile, Reader, type ScriptAnalysis, type Sent } from '@/lib/coach/script';
import { requestScriptCoach, type ScriptCoach } from '@/lib/coach/scriptCoach';
import { SCRIPT_EXAMPLES, defaultTitle, outcomeLabel, purposeOf, targetSecOf, timeOpts, withPurpose, type Draft } from '@/lib/rehearsal/draft';
import { PURPOSES, fmtMin, fmtTime } from '@/lib/scenarios';

const BASE_RATE: Record<string, number> = { interview: 1, ir: 1.05, report: 1.02, lecture: 0.95, conference: 1, speech: 0.92 };
const SPEEDS = [0.9, 1, 1.15];

type Props = { draft: Draft; update: (fn: (d: Draft) => Draft) => void; onRecord: () => void; paid: boolean };
type Ai = { status: 'idle' | 'loading' | 'done' | 'error'; coach?: ScriptCoach; err?: string; key?: string };

/**
 * 대본 코칭(유료 요금제 전용): AI 가 발표 상황 기준으로 대본을 읽고 고칠 문장을 고쳐 써 주고(/api/script/coach),
 * 시간·흐름·읽기 가이드는 브라우저에서 바로 계산해요. 무료 요금제는 요금제 안내만 보여 줘요.
 */
export function ScriptCheck({ draft, update, onRecord, paid }: Props) {
  const toast = useToast();
  const p = purposeOf(draft);
  const targetSec = targetSecOf(draft);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [ran, setRan] = useState(() => syllables(draft.script) >= 20);
  const outRef = useRef<HTMLDivElement>(null);

  // 설정을 바꾸면 분석도 바로 다시 해요.
  const result = useMemo<ScriptAnalysis | null>(
    () => (ran ? analyzeScript(draft.script, { purpose: p, targetSec, keyMessage: draft.key.trim() }) : null),
    [ran, draft.script, draft.key, p, targetSec],
  );
  const n = syllables(draft.script);
  const [ai, setAi] = useState<Ai>({ status: 'idle' });
  const aiKey = JSON.stringify([draft.script.trim(), p.id, targetSec, draft.key.trim()]);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function runAi() {
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    const key = aiKey;
    setAi({ status: 'loading', key });
    try {
      const coach = await requestScriptCoach({ script: draft.script, purposeId: p.id, targetSec, topic: draft.title.trim() || defaultTitle(draft), keyMessage: draft.key.trim(), outcome: outcomeLabel(draft) }, ac.signal);
      setAi({ status: 'done', coach, key });
    } catch (e) {
      if (ac.signal.aborted) return;
      setAi({ status: 'error', err: (e as Error).message, key });
    }
  }
  function analyze() {
    setRan(true);
    if (ai.key !== aiKey || ai.status === 'error') runAi();
    setTimeout(() => outRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  async function take(f: File | undefined) {
    if (!f) return;
    setErr('');
    try {
      const t = (await readScriptFile(f)).trim();
      if (!t) throw new Error('파일에서 글자를 찾지 못했어요.');
      update((d) => ({ ...d, script: t }));
      toast(`${f.name}을(를) 불러왔어요`);
    } catch (e) { setErr((e as Error).message || '파일을 읽지 못했어요.'); }
  }

  return (
    <section className="screen">
      <div className="page sc-page">
        <h1 className="title1">대본 점검</h1>
        <p className="subtitle">AI가 {p.label} 기준으로 대본을 읽고 고칠 문장을 고쳐 써 드려요. 시간·흐름과 읽기 가이드도 함께 봐요.</p>
        <div className="sc-setup">
          <label className="sel"><span>발표 상황</span>
            <select value={draft.purposeId} onChange={(e) => update((d) => withPurpose(d, e.target.value))}>
              {PURPOSES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
          <label className="sel"><span>목표 시간</span>
            <select value={targetSec} onChange={(e) => update((d) => ({ ...d, targetSec: Number(e.target.value) }))}>
              {timeOpts(draft).map(([s, l]) => <option key={s} value={s}>{fmtMin(s)} · {l}{s === p.targetSec ? ' (추천)' : ''}</option>)}
            </select>
          </label>
          <label className="sel sel-wide"><span>핵심 메시지 <em>선택</em></span>
            <input value={draft.key} onChange={(e) => update((d) => ({ ...d, key: e.target.value }))} placeholder="청중이 기억했으면 하는 한 문장" />
          </label>
        </div>
        <div className={`textview sc-editor${drag ? ' drag' : ''}`}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }}
          onDrop={(e) => { setDrag(false); if (e.dataTransfer.files.length) { e.preventDefault(); take(e.dataTransfer.files[0]); } }}>
          <textarea rows={10} value={draft.script} onChange={(e) => update((d) => ({ ...d, script: e.target.value }))}
            placeholder={`대본을 붙여넣거나, 파일을 이 칸에 끌어다 놓으세요.\n\n예시)\n${SCRIPT_EXAMPLES[p.id] ?? SCRIPT_EXAMPLES.report}`} />
          <div className="sc-tools">
            <label className="btn-ghost sm">파일 올리기<input type="file" accept=".txt,.md,.docx,text/plain,text/markdown" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} /></label>
            <span className="sc-hint">.txt · .md · .docx</span>
            <span className="count">{n ? `${n.toLocaleString()}음절` : ''}</span>
          </div>
          <div className="sc-dropmask">여기에 놓으면 대본을 불러와요</div>
        </div>
        <p className="sc-err" role="alert">{err}</p>
        {paid ? (
          <>
            <button type="button" className="btn-fill btn-block" disabled={n < 20 || ai.status === 'loading'} onClick={analyze}>{ai.status === 'loading' ? 'AI가 대본을 읽는 중…' : '대본 코칭 받기'}</button>
            <div ref={outRef} aria-live="polite">
              {ran && <AiCoach ai={ai} stale={ai.key !== undefined && ai.key !== aiKey} label={p.label} onRetry={runAi} onUseKey={(k) => update((d) => ({ ...d, key: k }))} />}
              {result && result.stats.n > 0 && <ScriptResult result={result} purposeId={p.id} purposeLabel={p.label} onRecord={onRecord} />}
            </div>
          </>
        ) : (
          <div className="sc-lock">
            <b>대본 코칭은 Spotlight 요금제부터 쓸 수 있어요</b>
            <p>AI가 {p.label} 기준으로 대본을 읽고, 고칠 문장을 바로 고쳐 써 드려요. 예상 시간·흐름·읽기 가이드도 함께 봐요.</p>
            <div>
              <Link className="btn-fill" href="/me/plan?pick=Spotlight&from=wizard">요금제 보기</Link>
              <button type="button" className="btn-plain" onClick={onRecord}>대본 코칭 없이 녹화</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** AI 대본 코칭 결과. 대본을 고치면 '다시 받기'를 보여 줘요. */
function AiCoach({ ai, stale, label, onRetry, onUseKey }: { ai: Ai; stale: boolean; label: string; onRetry: () => void; onUseKey: (k: string) => void }) {
  if (ai.status === 'loading') return <section className="sc-sec sc-ai"><h2 className="sc-h">AI 대본 코칭 <small>{label} 기준</small></h2><p className="sc-ai-wait"><span className="spin" aria-hidden="true" />대본을 읽고 있어요. 보통 20~40초 걸려요.</p></section>;
  if (ai.status === 'error') return <section className="sc-sec sc-ai"><h2 className="sc-h">AI 대본 코칭</h2><p className="sc-err">{ai.err}</p><button type="button" className="btn-plain btn-sm" onClick={onRetry}>다시 시도</button></section>;
  const c = ai.coach;
  if (ai.status !== 'done' || !c) return null;
  return (
    <section className="sc-sec sc-ai">
      <h2 className="sc-h">AI 대본 코칭 <small>{label} 기준</small></h2>
      {stale && <p className="sc-ai-stale">대본이나 설정이 바뀌었어요. <button type="button" className="btn-link" onClick={onRetry}>바뀐 대본으로 다시 받기</button></p>}
      <p className="sc-ai-verdict">{c.verdict}</p>
      {c.strengths.length > 0 && <ul className="goods">{c.strengths.map((g) => <li key={g}>{g}</li>)}</ul>}
      <ol className="ai-fixes">
        {c.fixes.map((f, k) => (
          <li key={k}>
            <b>{f.title}</b>
            <p>{f.why}</p>
            {f.quote && <p className="ai-from"><span>지금</span>{f.quote}</p>}
            {f.rewrite && <p className="ai-to"><span>이렇게</span>{f.rewrite}</p>}
          </li>
        ))}
      </ol>
      <div className="ai-ends">
        {c.opening && <div><span>첫 문장</span><p>{c.opening}</p></div>}
        {c.closing && <div><span>마지막 문장</span><p>{c.closing}</p></div>}
      </div>
      {c.keyLine && <p className="ai-key"><span>핵심 메시지</span><b>{c.keyLine}</b><button type="button" className="btn-link" onClick={() => onUseKey(c.keyLine)}>핵심 메시지로 쓰기</button></p>}
    </section>
  );
}

/** 억양 곡선을 부드러운 SVG 경로로 */
function curve(s: Sent) {
  const pts = contour(s).map(([px, py]) => [px * 100, 3 + (1 - py) * 14]);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], mx = (x0 + x1) / 2;
    d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
  }
  return d;
}

function ScriptResult({ result: r, purposeId, purposeLabel, onRecord }: { result: ScriptAnalysis; purposeId: string; purposeLabel: string; onRecord: () => void }) {
  const s = r.stats;
  const reader = useRef<Reader | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [at, setAt] = useState<{ si: number; ci: number } | null>(null);
  const [sub, setSub] = useState('');
  const [canSpeak] = useState(() => Reader.supported());
  const [flash, setFlash] = useState<number | null>(null);

  useEffect(() => {
    if (!canSpeak) return;
    const rd = new Reader();
    reader.current = rd;
    rd.onChunk = (pos) => {
      setAt(pos);
      if (pos && pos.ci === 0) {
        const line = document.getElementById(`rd-${pos.si}`);
        const b = line?.getBoundingClientRect();
        if (b && (b.top < 80 || b.bottom > innerHeight - 110)) line!.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setSub(`${pos.si + 1} / ${r.sents.length}번 문장`);
      }
    };
    rd.onEnd = () => { setPlaying(false); setSub('끝까지 읽었어요. 이제 따라 읽어 보세요.'); };
    speechSynthesis.onvoiceschanged = () => rd.pickVoice();
    return () => { rd.stop(); speechSynthesis.onvoiceschanged = null; };
  }, [r.sents.length, canSpeak]);

  const play = (from: number) => {
    const rd = reader.current;
    if (!rd) return;
    if (!rd.pickVoice() && speechSynthesis.getVoices().length) setSub('한국어 음성이 없어 기본 음성으로 읽어요');
    setPlaying(true);
    rd.rate = speed;
    rd.play(r.sents, { base: BASE_RATE[purposeId] ?? 1, from });
  };
  const stop = () => { reader.current?.stop(); setPlaying(false); };
  const goTo = (i: number) => {
    document.getElementById(`rd-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlash(null); requestAnimationFrame(() => setFlash(i));
  };

  const ratio = s.estSec / s.targetSec;
  const tCls = ratio > 1.25 || ratio < 0.6 ? 'bad' : ratio > 1.1 || ratio < 0.75 ? 'warn' : 'ok';
  const colorOf: Record<string, number> = Object.fromEntries(r.elements.map((e, k) => [e.id, k]));

  return (
    <>
      <div className="sc-stats">
        <div className={`stat ${tCls}`}><span>예상 시간</span><b>{fmtTime(s.estSec)}</b><small>목표 {fmtTime(s.targetSec)} · 분당 {Math.round(s.spm ?? 0)}음절 기준</small></div>
        <div className="stat"><span>문장</span><b>{s.n}</b><small>문단 {s.paras}개</small></div>
        <div className={`stat ${(s.avg ?? 0) > 55 ? 'warn' : ''}`}><span>평균 문장 길이</span><b>{s.avg}</b><small>음절 · 40~55가 편해요</small></div>
        <div className={`stat ${s.long ? 'warn' : 'ok'}`}><span>긴 문장</span><b>{s.long}</b><small>60음절 넘는 문장</small></div>
      </div>

      <section className="sc-sec">
        <h2 className="sc-h">흐름 <small>{purposeLabel}에 맞는 순서</small></h2>
        <div className="flow-bar">
          {r.sents.map((x) => <i key={x.i} style={{ flex: x.syl }} data-c={x.flow ? colorOf[x.flow] : undefined} title={`${x.i + 1}번 문장`} onClick={() => goTo(x.i)} />)}
        </div>
        <ul className="flow-steps">
          {r.elements.map((e) => e.at >= 0
            ? <li key={e.id}><i data-c={colorOf[e.id]} />{e.label} <small>{e.at + 1}번</small></li>
            : <li key={e.id} className="miss"><i />{e.label} <small>없음</small></li>)}
        </ul>
      </section>

      <section className="sc-sec">
        <h2 className="sc-h">고칠 점 <small>{r.issues.length ? `${r.issues.length}개 · 중요한 순서` : ''}</small></h2>
        {r.issues.length ? (
          <ul className="issues">
            {r.issues.map((it) => (
              <li key={it.title} className={`issue ${it.sev}`}><i /><b>{it.title}</b><p>{it.detail}</p>
                {it.refs.length > 0 && <div className="refs">{[...new Set(it.refs)].map((i) => <button key={i} type="button" className="sref" onClick={() => goTo(i)}>{i + 1}번 문장</button>)}</div>}
              </li>
            ))}
          </ul>
        ) : <p className="subtitle">크게 고칠 곳이 없어요. 바로 녹화해 보세요.</p>}
        {r.good.length > 0 && <ul className="goods">{r.good.map((g) => <li key={g}>{g}</li>)}</ul>}
      </section>

      <section className="sc-sec">
        <h2 className="sc-h">읽기 가이드 <small>문장을 누르면 거기서부터 읽어요</small></h2>
        <div className="legend"><span><span className="br">/</span> 짧게 쉬기</span><span><em>굵은 글자</em> 힘주기</span><span>↘ 말끝 내리기</span><span>↗ 말끝 올리기</span><span>파란 선 억양 높낮이</span></div>
        <div className="reading">
          {r.sents.map((x, si) => (
            <div key={si} id={`rd-${si}`} className={`rd${x.syl > 60 ? ' long' : ''}${si && x.para !== r.sents[si - 1].para ? ' para' : ''}${flash === si ? ' flash' : ''}`} onClick={() => play(si)}>
              <span className="rd-n">{si + 1}</span>
              <div>
                <svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path d={curve(x)} /></svg>
                <p>
                  {x.role && <span className="tag" data-tc={colorOf[x.role]}>{r.elements.find((e) => e.id === x.role)?.label}</span>}
                  {x.chunks.map((c, ci) => (
                    <span key={ci}>
                      {ci > 0 && <> <span className="br">/</span> </>}
                      <span className={`ck${at?.si === si && at.ci === ci ? ' on' : ''}`}>
                        {c.map((t, ti) => <span key={ti}>{ti > 0 && ' '}{t.em ? <em>{t.w}</em> : t.w}</span>)}
                      </span>
                    </span>
                  ))}{' '}
                  {x.type === 'q' ? <span className="dir up" title="말끝을 올려요">↗</span> : x.type === 'ex' ? <span className="dir" title="힘 있게">!</span> : <span className="dir" title="말끝을 내려요">↘</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="player">
          <button type="button" className="pl-btn" aria-label={playing ? '멈추기' : '예시 억양으로 듣기'} disabled={!canSpeak} onClick={() => (playing ? stop() : play(0))}>
            {playing ? <svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg> : <svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" /></svg>}
          </button>
          <span className="pl-t"><b>{playing ? '읽는 중' : '예시 억양으로 듣기'}</b><span>{sub || (canSpeak ? '숨 쉴 자리에서 쉬고, 굵은 글자에서 힘을 줘서 읽어요' : '이 브라우저는 음성 읽기를 지원하지 않아요')}</span></span>
          <span className="pl-speed" role="group" aria-label="읽기 속도">
            {SPEEDS.map((v) => <button key={v} type="button" aria-pressed={v === speed} onClick={() => { setSpeed(v); if (reader.current) reader.current.rate = v; }}>{v}×</button>)}
          </span>
        </div>
      </section>

      <div className="sc-cta">
        <button type="button" className="btn-fill btn-block" onClick={() => { stop(); onRecord(); }}>
          이 대본으로 녹화 리허설<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
        </button>
        <p>대본과 핵심 메시지를 녹화 설정에 넘겨요. 녹화 후 리포트에서 대본대로 말했는지도 함께 봐요.</p>
      </div>
    </>
  );
}
