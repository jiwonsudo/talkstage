'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';
import { UsageHelp } from '@/components/ui/UsageHelp';
import { SimpleCoach } from './SimpleCoach';
import { syllables } from '@/lib/coach/audio';
import { analyzeScript, contour, readScriptFile, Reader, type ScriptAnalysis, type Sent } from '@/lib/coach/script';
import { AI_COACH_TIERS, aiCoachChars, aiCoachCost, getCoachStatus, redeemPromo, requestScriptCoach, type CoachResult, type CoachStatus, type DeliveryCue } from '@/lib/coach/scriptCoach';
import { SCRIPT_EXAMPLES, defaultTitle, outcomeLabel, purposeOf, targetSecOf, timeOpts, withPurpose, type Draft } from '@/lib/rehearsal/draft';
import { PURPOSES, fmtMin, fmtTime } from '@/lib/scenarios';

const BASE_RATE: Record<string, number> = { interview: 1, ir: 1.05, report: 1.02, lecture: 0.95, conference: 1, speech: 0.92 };
const SPEEDS = [0.9, 1, 1.15];

type Props = { draft: Draft; update: (fn: (d: Draft) => Draft) => void; onRecord: () => void; paid: boolean };
type Ai = { status: 'idle' | 'loading' | 'done' | 'error'; res?: CoachResult; err?: string; key?: string };
// 받은 AI 코칭은 이 기기에 남겨 둬요(테스트 1회·크레딧을 쓴 결과가 화면을 떠나도 사라지지 않게).
const AI_SAVE = 'ts-ai-coach-v1';
const loadSaved = (): Ai => {
  try { const v = JSON.parse(localStorage.getItem(AI_SAVE) ?? 'null') as { key: string; res: CoachResult } | null; return v ? { status: 'done', res: v.res, key: v.key } : { status: 'idle' }; } catch { return { status: 'idle' }; }
};

/**
 * 대본 점검: 시간·흐름·읽기 가이드는 브라우저에서 바로 계산해요(누구나).
 * AI 대본 코칭(/api/script/coach)은 서버가 정한 조건에서만: 지금(테스트)은 프로모션 코드로 1회,
 * 정식은 유료 요금제 + 대본 길이별 크레딧(쓰기 전에 몇 크레딧인지 보여 줘요).
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
  const [ai, setAi] = useState<Ai>(loadSaved);
  const aiKey = JSON.stringify([draft.script.trim(), p.id, targetSec, draft.key.trim(), draft.aid, draft.posture]);
  const [access, setAccess] = useState<CoachStatus | null>(null);
  const [accessErr, setAccessErr] = useState('');
  useEffect(() => {
    if (!paid) return;
    let live = true;
    getCoachStatus().then((s) => { if (live) setAccess(s); }).catch((e) => { if (live) setAccessErr((e as Error).message); });
    return () => { live = false; };
  }, [paid]);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function runAi() {
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    const key = aiKey;
    setAi({ status: 'loading', key });
    try {
      const res = await requestScriptCoach({ script: draft.script, purposeId: p.id, targetSec, topic: draft.title.trim() || defaultTitle(draft), keyMessage: draft.key.trim(), outcome: outcomeLabel(draft), aid: draft.aid ?? '', posture: draft.posture }, ac.signal);
      setAi({ status: 'done', res, key });
      try { localStorage.setItem(AI_SAVE, JSON.stringify({ key, res })); } catch { /* 저장 못 해도 화면엔 보여요 */ }
      if (res.charged.kind === 'trial') setAccess({ mode: 'promo', paid: true, trial: 'used' });
      else setAccess((a) => (a?.mode === 'credits' && a.left != null ? { ...a, left: Math.max(0, a.left - (res.charged as { cost: number }).cost) } : a));
    } catch (e) {
      if (ac.signal.aborted) return;
      setAi({ status: 'error', err: (e as Error).message, key });
    }
  }
  function check() {
    setRan(true);
    setTimeout(() => outRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }
  function startAi() {
    setRan(true);
    runAi();
    setTimeout(() => aiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }
  const aiRef = useRef<HTMLDivElement>(null);

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
        <h1 className="title1">{paid ? '대본 점검' : '대본'}</h1>
        <p className="subtitle">{paid ? `${p.label} 기준으로 시간·흐름·읽기 가이드를 바로 확인하고, AI 코칭으로 대본을 먼저 이해한 뒤 고칠 문장과 말하는 방법까지 받아요.` : `대본을 적어 두면 ${p.label} 기준 간단 코칭을 근거와 함께 보여 드려요.`}</p>
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
        {!paid ? (
          <>
            {n >= 20 && <SimpleCoach draft={draft} />}
            <button type="button" className="btn-fill btn-block sc-go" disabled={!draft.title.trim()} onClick={onRecord}>이 대본으로 녹화 준비</button>
          </>
        ) : <>
        <button type="button" className="btn-fill btn-block" disabled={n < 20} onClick={check}>대본 점검하기</button>
        <div ref={aiRef}>
          <AiPanel access={access} accessErr={accessErr} ai={ai} chars={aiCoachChars(draft.script)} ok={n >= 20}
            stale={ai.status === 'done' && ai.key !== aiKey} onRun={startAi} onAccess={setAccess}
            onUseKey={(k) => { update((d) => ({ ...d, key: k })); toast('핵심 메시지로 넣었어요'); }} />
        </div>
        <div ref={outRef} aria-live="polite">
          {result && result.stats.n > 0 && <ScriptResult result={result} purposeId={p.id} purposeLabel={p.label} onRecord={onRecord} />}
        </div>
        {!result && <button type="button" className="btn-plain btn-block sc-skip" onClick={onRecord}>점검 없이 녹화</button>}
        </>}
      </div>
    </section>
  );
}

const CUE_LABEL: Record<DeliveryCue['kind'], string> = { pause: '쉬기', slow: '천천히', stress: '강조', point: '가리키기', show: '들어 보이기', eyes: '시선', gesture: '손짓' };
const FIT_NOTE = { match: '', partial: '대본이 고른 상황과 조금 달라요', mismatch: '대본이 고른 상황과 달라요' } as const;
const KEY_NOTE = { same: '적어 준 핵심 메시지가 대본에 분명히 있어요', partial: '적어 준 핵심 메시지가 대본에서 흐릿해요', missing: '적어 준 핵심 메시지가 대본에 없어요', none: '' } as const;

/** 크레딧 정책 표(쓰기 전에 꼭 보여 줘요) */
function CostTable({ chars }: { chars: number }) {
  const cur = aiCoachCost(chars);
  return (
    <ul className="ai-tiers">
      {AI_COACH_TIERS.map((t) => <li key={t.upTo} data-on={chars > 0 && t.credits === cur ? '' : undefined}><span>{t.label}</span><b>{t.credits}크레딧</b></li>)}
    </ul>
  );
}

/** AI 대본 코칭: 쓸 수 있는지(테스트 코드·크레딧) → 실행 → 결과 */
function AiPanel({ access, accessErr, ai, chars, ok, stale, onRun, onAccess, onUseKey }: {
  access: CoachStatus | null; accessErr: string; ai: Ai; chars: number; ok: boolean; stale: boolean;
  onRun: () => void; onAccess: (s: CoachStatus) => void; onUseKey: (k: string) => void;
}) {
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [busy, setBusy] = useState(false);
  const loading = ai.status === 'loading';
  const cost = aiCoachCost(chars);

  async function apply() {
    setBusy(true); setCodeErr('');
    try { onAccess(await redeemPromo(code)); setCode(''); } catch (e) { setCodeErr((e as Error).message); } finally { setBusy(false); }
  }

  let gate: React.ReactNode = null;
  if (accessErr) gate = <p className="sc-err">{accessErr}</p>;
  else if (!access) gate = <p className="ai-note">AI 코칭을 쓸 수 있는지 확인하는 중이에요…</p>;
  else if (access.mode === 'off') gate = <p className="ai-note">{access.reason}</p>;
  else if (access.mode === 'promo' && !access.paid) gate = <p className="ai-note">AI 대본 코칭은 <b>Spotlight 요금제부터</b> 쓸 수 있어요. <Link href="/me/plan?pick=Spotlight&from=wizard">요금제 보기</Link></p>;
  else if (access.mode === 'promo') {
    if (access.trial === 'none') gate = (
      <>
        <p className="ai-note">지금은 테스트 기간이라 <b>프로모션 코드</b>를 넣으면 AI 코칭을 <b>한 번</b> 받을 수 있어요(크레딧 안 씀).</p>
        <form className="ai-code" onSubmit={(e) => { e.preventDefault(); if (code.trim()) apply(); }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="프로모션 코드" autoCapitalize="characters" autoComplete="off" maxLength={40} aria-label="프로모션 코드" />
          <button type="submit" className="btn-plain" disabled={busy || !code.trim()}>{busy ? '확인 중…' : '적용'}</button>
        </form>
        {codeErr && <p className="sc-err">{codeErr}</p>}
      </>
    );
    else if (access.trial === 'used') gate = ai.status === 'done' ? null : <p className="ai-note">테스트 코칭 1회를 이미 썼어요.</p>;
    else gate = (
      <>
        <p className="ai-note">테스트 무료 <b>1회</b>가 남아 있어요. 한 번 받으면 다시 받을 수 없으니, 대본을 다 다듬은 뒤 받아 보세요.</p>
        <button type="button" className="btn-fill btn-block" disabled={!ok || loading || access.trial === 'busy'} onClick={onRun}>{loading ? 'AI가 대본을 읽는 중…' : 'AI 코칭 받기 · 테스트 1회'}</button>
      </>
    );
  } else if (!access.paid) gate = (
    <>
      <p className="ai-note">AI 대본 코칭은 <b>Spotlight 요금제부터</b> 쓸 수 있어요. 대본 길이에 따라 크레딧이 들어요.</p>
      <CostTable chars={chars} />
      <Link className="btn-plain btn-sm" href="/me/plan?pick=Spotlight&from=wizard">요금제 보기</Link>
    </>
  );
  else gate = (
    <>
      <p className="ai-note">이 대본은 <b>{chars.toLocaleString()}자</b>라 <b>{cost}크레딧</b>을 써요{access.left != null && <> · 남은 크레딧 {access.left}</>}. 코칭이 실패하면 빠지지 않고, 대본을 고쳐 다시 받으면 다시 들어요.</p>
      <CostTable chars={chars} />
      <button type="button" className="btn-fill btn-block" disabled={!ok || loading || (access.left != null && access.left < cost)} onClick={onRun}>
        {loading ? 'AI가 대본을 읽는 중…' : access.left != null && access.left < cost ? '크레딧이 모자라요' : `AI 코칭 받기 · ${cost}크레딧`}
      </button>
    </>
  );

  return (
    <section className="sc-sec sc-ai">
      <h2 className="sc-h">AI 대본 코칭 <small>대본 이해 → 고칠 문장 → 말하는 방법</small><UsageHelp label="AI 코칭 크레딧 기준" /></h2>
      {ai.status === 'loading' ? <p className="sc-ai-wait"><span className="spin" aria-hidden="true" />대본을 먼저 읽고 발표를 파악한 뒤, 고칠 문장과 말하는 방법을 정하고 있어요. 보통 30~60초 걸려요.</p> : gate}
      {ai.status === 'error' && <p className="sc-err">{ai.err}</p>}
      {ai.status === 'done' && ai.res && <AiResult res={ai.res} stale={stale} onUseKey={onUseKey} />}
    </section>
  );
}

function AiResult({ res, stale, onUseKey }: { res: CoachResult; stale: boolean; onUseKey: (k: string) => void }) {
  const { brief: b, coach: c } = res;
  return (
    <div className="ai-out">
      {stale && <p className="sc-ai-stale">아래 코칭은 고치기 전 대본 기준이에요.</p>}
      <h3 className="ai-h">AI가 파악한 발표</h3>
      <dl className="ai-brief">
        <div><dt>주제</dt><dd>{b.topic}</dd></div>
        {b.audience && <div><dt>청중</dt><dd>{b.audience}</dd></div>}
        {b.ask && <div><dt>얻고 싶은 것</dt><dd>{b.ask}</dd></div>}
        <div><dt>핵심 메시지</dt><dd>{b.keyMessage} <button type="button" className="btn-link" onClick={() => onUseKey(c.keyLine || b.keyMessage)}>핵심 메시지로 쓰기</button></dd></div>
      </dl>
      {b.purposeFit !== 'match' && <p className="ai-warn"><b>{FIT_NOTE[b.purposeFit]}</b> {b.purposeNote}</p>}
      {(b.keyFit === 'partial' || b.keyFit === 'missing') && <p className="ai-warn"><b>{KEY_NOTE[b.keyFit]}</b> {b.keyNote}</p>}
      {b.structure.length > 0 && <ol className="ai-struct">{b.structure.map((s, k) => <li key={k}><span>{s.part}</span>{s.quote}</li>)}</ol>}

      <h3 className="ai-h">총평</h3>
      <p className="sc-ai-verdict">{c.verdict}</p>
      {c.strengths.length > 0 && <ul className="goods">{c.strengths.map((g) => <li key={g}>{g}</li>)}</ul>}
      <h3 className="ai-h">고칠 문장</h3>
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
      <h3 className="ai-h">이 대본, 이렇게 말해요</h3>
      <p className="ai-plan">{c.deliveryPlan}</p>
      {c.cues.length > 0 && <ol className="ai-cues">{c.cues.map((q, k) => <li key={k}><span data-k={q.kind}>{CUE_LABEL[q.kind]}</span><div><q>{q.quote}</q><p>{q.tip}</p></div></li>)}</ol>}
      <p className="ai-charged">{res.charged.kind === 'trial' ? '테스트 무료 1회로 받은 코칭이에요.' : `${res.charged.cost}크레딧을 쓴 코칭이에요.`} 이 기기에 저장돼 있어요.</p>
    </div>
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
