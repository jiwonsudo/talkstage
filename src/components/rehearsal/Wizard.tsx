'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/lib/nav';
import { useAuth } from '@/components/auth/AuthProvider';
import { Picto } from '@/components/ui/Picto';
import { useToast } from '@/components/ui/Toast';
import { syllables } from '@/lib/coach/audio';
import { readScriptFile } from '@/lib/coach/script';
import {
  CUSTOM_WARN, EXAMPLES, PROMPT_COPY, SCRIPT_EXAMPLES, WORRIES,
  outcomeLabel, parsePrompt, purposeOf, recommendTime, targetSecOf, timeOpts, withPurpose, type Draft,
} from '@/lib/rehearsal/draft';
import { CAT_LABEL, POSTURES, PURPOSES, fmtMin, fmtTime, type CatId } from '@/lib/scenarios';

export const STEPS = ['purpose', 'posture', 'outcome', 'time', 'worry', 'prompt'] as const;
export type StepId = typeof STEPS[number];
const ART_OF: Record<string, number> = { interview: 1, ir: 3, report: 2, lecture: 4, conference: 7, capstone: 6, speech: 5 };
const MULTI = 3;

type Opt = { label: string; sub?: string; icon?: string; art?: number; badge?: string };
type Props = {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  step: number;
  go: (delta: number) => void;
  paid: boolean;
  /** 로그인 전이면 마지막 단계에서 로그인한다고 미리 알려요. */
  guest: boolean;
  /** 이번에 직접 고른 단계. 여기 없는 단계는 저장된 값이 있어도 체크를 보여 주지 않아요. */
  chosen: ReadonlySet<StepId>;
  /** id 를 골랐다고 표시하고, drop 에 있는 단계(앞의 선택에 따라 바뀌는 단계)는 다시 고르게 해요. */
  mark: (id: StepId, drop?: StepId[]) => void;
  onExit: () => void;
  onAnalyzeScript: () => void;
  onRecord: () => void;
};
type ChoiceProps = Pick<Props, 'draft' | 'update' | 'go' | 'paid' | 'chosen' | 'mark'>;

export function Wizard({ draft, update, step, go, paid, guest, chosen, mark, onExit, onAnalyzeScript, onRecord }: Props) {
  const id = STEPS[step];
  const [dir, setDir] = useState(1);
  const prev = useRef(step);
  useEffect(() => { setDir(step >= prev.current ? 1 : -1); prev.current = step; }, [step]);

  return (
    <section className="screen">
      <div className="page wiz">
        <div className="wiz-progress">
          <div className="wiz-bar"><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
          <span>{step + 1}/{STEPS.length}</span>
          <button type="button" className="wiz-exit" onClick={onExit}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>그만두기
          </button>
        </div>
        {guest && step === 0 && <p className="wiz-note wiz-guest">설정은 로그인 없이 골라 볼 수 있어요. 녹화를 시작할 때 로그인해 주세요.</p>}
        <div aria-live="polite" key={id} className={`step ${dir < 0 ? 'from-left' : 'from-right'}`}>
          {id === 'prompt'
            ? <PromptStep draft={draft} update={update} guest={guest} onAnalyzeScript={onAnalyzeScript} onRecord={onRecord} />
            : <ChoiceStep id={id} draft={draft} update={update} go={go} paid={paid} chosen={chosen} mark={mark} />}
        </div>
      </div>
    </section>
  );
}

// 앞 단계를 바꾸면 기본값이 바뀌는 뒤 단계: 목적 → 목표·시간, 목표 → 시간
const DEPENDS: Partial<Record<StepId, StepId[]>> = { purpose: ['outcome', 'time'], outcome: ['time'] };

function ChoiceStep({ id, draft, update, go, paid, chosen, mark }: ChoiceProps & { id: Exclude<StepId, 'prompt'> }) {
  const toast = useToast();
  const locked = useRef(false);
  const p = purposeOf(draft);

  let title = '', sub = '', options: Opt[] = [], value: number | null = null;
  let pick: (i: number) => void = () => {};
  if (id === 'purpose') {
    title = '어떤 발표인가요?'; sub = '목적에 따라 좋은 속도, 쉼, 억양, 시선의 기준이 달라져요.';
    options = PURPOSES.map((x) => ({ label: x.label, sub: x.summary, icon: x.id, art: ART_OF[x.id] }));
    value = PURPOSES.findIndex((x) => x.id === draft.purposeId);
    pick = (i) => update((d) => ({ ...withPurpose(d, PURPOSES[i].id), customPurpose: null }));
  } else if (id === 'posture') {
    title = '앉아서 하나요, 서서 하나요?'; sub = '서서 하면 전신 움직임까지 분석해요.';
    options = Object.values(POSTURES).map((x, i) => ({ label: x.label, sub: x.desc, icon: x.id, art: i ? 4 : 2 }));
    value = draft.posture === 'standing' ? 1 : 0;
    pick = (i) => update((d) => ({ ...d, posture: i === 1 ? 'standing' : 'seated' }));
  } else if (id === 'outcome') {
    title = '무엇을 얻고 싶나요?';
    sub = `${draft.customPurpose?.name || p.label}에서 이루고 싶은 것을 최대 ${MULTI}개까지 골라 주세요. 먼저 고른 것을 더 중요하게 봐요.`;
    options = p.outcomes.map((o) => ({ label: o.label }));
  } else if (id === 'time') {
    title = '목표 시간은요?'; sub = '실제 발표 자리에 맞춰 골라 주세요.';
    const rec = recommendTime(draft);
    options = timeOpts(draft).map(([s, l]) => ({ label: fmtMin(s), sub: s === rec.sec ? `${l} · ${rec.why}` : l, badge: s === rec.sec ? '추천' : '' }));
    value = timeOpts(draft).findIndex(([s]) => s === targetSecOf(draft));
    pick = (i) => update((d) => ({ ...d, targetSec: timeOpts(d)[i][0] }));
  } else {
    title = '가장 걱정되는 건 뭔가요?'; sub = '녹화 결과와 비교해서, 걱정이 맞는지와 모르고 있던 약점을 알려드려요.';
    options = [...WORRIES.map((w) => ({ label: w.label, sub: w.sub })), { label: '잘 모르겠어요' }];
    value = draft.worry ? WORRIES.findIndex((w) => w.id === draft.worry) : null;
    pick = (i) => update((d) => ({ ...d, worry: WORRIES[i]?.id ?? null }));
  }

  const multi = id === 'outcome';
  const done = chosen.has(id);
  if (!done) value = null; // 지난번 설정·기본값은 체크로 보여 주지 않아요
  const picked = multi && !done ? [] : draft.outcomeIdxs;
  const extra = draft.customGoal ? 1 : 0;
  const full = picked.length + extra >= MULTI;

  const choose = (i: number) => {
    if (multi) {
      const k = picked.indexOf(i);
      if (k < 0 && full) { toast(`최대 ${MULTI}개까지 고를 수 있어요`); return; }
      const base = done ? draft.outcomeIdxs : [];
      mark(id, DEPENDS[id]);
      update((d) => ({ ...d, outcomeIdxs: k >= 0 ? base.filter((x) => x !== i) : [...base, i], targetSec: null }));
      return;
    }
    if (locked.current) return;
    locked.current = true;
    // 같은 값을 다시 고르면 뒤 단계 선택은 그대로 둬요
    mark(id, i === value ? [] : DEPENDS[id]);
    pick(i);
    setTimeout(() => go(1), 220);
  };

  // 숫자 키로 바로 고르기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches?.('input, textarea')) return;
      if (/^[1-9]$/.test(e.key) && Number(e.key) <= options.length) choose(Number(e.key) - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const hasIco = options.some((o) => o.icon);
  return (
    <>
      <h1 className="title1">{title}</h1>
      <p className="subtitle">{sub}</p>
      <ul className={`opts${hasIco ? ' opts-ico' : ''}${multi ? ' opts-multi' : ''}`}>
        {options.map((o, i) => {
          const rank = multi ? picked.indexOf(i) : i === value ? 0 : -1;
          const sel = rank >= 0;
          return (
            <li key={o.label}>
              <button type="button" className={`opt cell-btn${sel ? ' is-sel' : ''}${multi && full && !sel ? ' is-off' : ''}`} aria-pressed={multi ? sel : undefined} onClick={() => choose(i)}>
                {o.icon
                  ? <span className={`opt-ico art-${o.art ?? 2}`}><Picto name={o.icon} /></span>
                  : <span className="opt-num">{multi ? (sel ? rank + 1 : '') : i + 1}</span>}
                <span className="opt-t"><b>{o.label}{o.badge && <em className="badge">{o.badge}</em>}</b>{o.sub && <small>{o.sub}</small>}</span>
                <span className="check" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {id === 'purpose' && <CustomPurpose draft={draft} update={update} go={go} paid={paid} mark={mark} />}
      {multi && <CustomGoalBox draft={draft} update={update} paid={paid} />}
      {multi && (
        <div className="multi-foot">
          <span>{picked.length + extra ? `${picked.length + extra}/${MULTI} 선택` : `최대 ${MULTI}개`}</span>
          <button type="button" className="btn-fill" disabled={!(picked.length + extra)} onClick={() => go(1)}>다음</button>
        </div>
      )}
    </>
  );
}

/** 유료 기능 잠금: 누르면 바로 요금제 바꾸기(Spotlight 추천)로 가요. 업그레이드하면 이 설정 화면으로 돌아와요. */
function Lock({ title }: { title: string }) {
  const router = useRouter();
  const { requireAuth } = useAuth();
  const to = '/me/plan?pick=Spotlight&from=wizard';
  return (
    <button type="button" className="custom-lock" onClick={() => requireAuth(() => router.push(to), '요금제를 바꾸려면 로그인해 주세요.', to)}>
      <span><b>{title}</b><small>Spotlight 이상 요금제에서 쓸 수 있어요</small></span><i aria-hidden="true">Spotlight</i>
    </button>
  );
}

function CustomPurpose({ draft, update, go, paid, mark }: Pick<ChoiceProps, 'draft' | 'update' | 'go' | 'paid' | 'mark'>) {
  const toast = useToast();
  const cp = draft.customPurpose;
  const [name, setName] = useState(cp?.name ?? '');
  const [base, setBase] = useState(cp?.base ?? draft.purposeId);
  if (!paid) return <Lock title="원하는 발표가 없나요? 직접 입력하기" />;
  return (
    <details className="custom-box" open={!!cp}>
      <summary>원하는 발표가 없나요? 직접 입력하기</summary>
      <label className="field"><span>발표 이름</span><input type="text" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 사내 해커톤 결선 발표" /></label>
      <p className="group-h">가장 비슷한 유형 <small>이 유형의 속도·쉼·시선 기준으로 코칭해요</small></p>
      <div className="custom-chips">
        {PURPOSES.map((x) => <button key={x.id} type="button" className={x.id === base ? 'is-on' : ''} onClick={() => setBase(x.id)}>{x.label}</button>)}
      </div>
      <p className="custom-warn">{CUSTOM_WARN}</p>
      <button type="button" className="btn-fill btn-block" onClick={() => {
        if (!name.trim()) { toast('발표 이름을 적어 주세요'); return; }
        mark('purpose', DEPENDS.purpose);
        update((d) => ({ ...withPurpose(d, base), customPurpose: { name: name.trim(), base } }));
        go(1);
      }}>이 설정으로 다음</button>
    </details>
  );
}

function CustomGoalBox({ draft, update, paid }: { draft: Draft; update: Props['update']; paid: boolean }) {
  const toast = useToast();
  const cg = draft.customGoal;
  const [label, setLabel] = useState(cg?.label ?? '');
  const [focus, setFocus] = useState<CatId>(cg?.focus ?? 'content');
  if (!paid) return <Lock title="원하는 목표를 직접 추가하기" />;
  return (
    <details className="custom-box" open={!!cg}>
      <summary>{cg ? `직접 추가한 목표: ${cg.label}` : '원하는 목표를 직접 추가하기'}</summary>
      <label className="field"><span>목표 <small>(고른 목표와 합쳐 최대 {MULTI}개)</small></span><input type="text" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 기술 질문에 막힘없이 답하기" /></label>
      <p className="group-h">가장 가까운 코칭 항목 <small>이 항목을 더 무겁게 봐요</small></p>
      <div className="custom-chips">
        {(Object.entries(CAT_LABEL) as [CatId, string][]).map(([k, l]) => <button key={k} type="button" className={k === focus ? 'is-on' : ''} onClick={() => setFocus(k)}>{l}</button>)}
      </div>
      <p className="custom-warn">{CUSTOM_WARN}</p>
      <div className="custom-act">
        <button type="button" className="btn-fill" onClick={() => {
          if (!label.trim()) { toast('목표를 적어 주세요'); return; }
          if (!cg && draft.outcomeIdxs.length >= MULTI) { toast(`목표는 최대 ${MULTI}개예요. 위에서 하나를 빼고 추가해 주세요.`); return; }
          update((d) => ({ ...d, customGoal: { label: label.trim(), focus, cta: false } }));
          toast('목표에 추가했어요');
        }}>{cg ? '바꾸기' : '목표에 추가'}</button>
        {cg && <button type="button" className="btn-ghost" onClick={() => { update((d) => ({ ...d, customGoal: null })); setLabel(''); }}>빼기</button>}
      </div>
    </details>
  );
}

function PromptStep({ draft, update, guest, onAnalyzeScript, onRecord }: Pick<Props, 'draft' | 'update' | 'guest' | 'onAnalyzeScript' | 'onRecord'>) {
  const has = draft.hasScript;
  const p = purposeOf(draft);
  const copy = PROMPT_COPY[has];
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const focusRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = setTimeout(() => focusRef.current?.focus(), 80); return () => clearTimeout(t); }, [has]);

  const scN = syllables(draft.script);
  const prN = syllables(draft.prompt);
  const parsed = parsePrompt(draft.prompt);

  async function load(f: File | undefined) {
    if (!f) return;
    try { const text = await readScriptFile(f); update((d) => ({ ...d, script: text })); setErr(''); }
    catch (e) { setErr((e as Error).message || '파일을 읽지 못했어요.'); }
  }

  const rows: [string, string][] = [
    ['주제', parsed.topic],
    ['핵심 메시지', parsed.keyMessage ? `“${parsed.keyMessage}”` : ''],
    ['원하는 결과', parsed.outcomeText || outcomeLabel(draft)],
  ];
  if (parsed.script) {
    const sec = (prN / ((p.targets.spm[0] + p.targets.spm[1]) / 2)) * 60 * 1.12;
    rows.push(['대본 예상 시간', `${fmtTime(sec)} (목표 ${fmtTime(targetSecOf(draft))})`]);
  }

  return (
    <>
      <h1 className="title1">{copy.title}</h1>
      <p className="subtitle">{copy.sub}</p>
      {has === 'yes' ? (
        <div className="wiz-pane">
          <button type="button" className="alt-path" onClick={() => update((d) => ({ ...d, hasScript: 'no' }))}>
            <b>대본이 없나요?</b><span>한두 줄 설명만 적고 바로 녹화해요</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
          </button>
          <div className={`textview wiz-drop${over ? ' is-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]); }}>
            <textarea ref={focusRef} rows={9} value={draft.script} onChange={(e) => { update((d) => ({ ...d, script: e.target.value })); setErr(''); }}
              placeholder={`발표 대본을 붙여넣거나, 파일(.txt · .md · .docx)을 여기에 끌어다 놓으세요.\n\n예시)\n${SCRIPT_EXAMPLES[p.id] ?? SCRIPT_EXAMPLES.report}`} />
          </div>
          <div className="chips-row">
            <label className="chip-btn wiz-file">파일 올리기<input type="file" accept=".txt,.md,.docx,text/plain" hidden onChange={(e) => load(e.target.files?.[0])} /></label>
            <span className="file-types">.txt · .md · .docx</span>
            <span className="count">{scN ? `${scN}음절` : ''}</span>
          </div>
          <p className="wiz-err" hidden={!err}>{err}</p>
          <label className="field"><span>핵심 메시지 <small>(선택)</small></span>
            <input type="text" maxLength={80} value={draft.key} onChange={(e) => update((d) => ({ ...d, key: e.target.value }))} placeholder="청중이 기억했으면 하는 한 문장" />
          </label>
          <button type="button" className="btn-fill btn-block w-analyze" disabled={scN < 20} onClick={onAnalyzeScript}>{guest ? '로그인하고 대본 분석하기' : '대본 분석하기'}</button>
        </div>
      ) : (
        <div className="wiz-pane">
          <button type="button" className="back-path" onClick={() => update((d) => ({ ...d, hasScript: 'yes' }))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 5l-7 7 7 7" /></svg>대본이 있어요
          </button>
          <div className="textview">
            <textarea ref={focusRef} rows={4} value={draft.prompt} onChange={(e) => update((d) => ({ ...d, prompt: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onRecord(); } }}
              placeholder={`어떤 발표인지 한두 줄만 적어 주세요 (선택). 예: ${EXAMPLES[p.id]}`} />
          </div>
          <div className="chips-row">
            <button type="button" className="chip-btn" onClick={() => update((d) => ({ ...d, prompt: EXAMPLES[p.id] }))}>예시로 채우기</button>
            <span className="count">{prN ? `${prN}음절` : ''}</span>
          </div>
          <p className="group-h">자동으로 찾은 내용</p>
          <ul className="group w-parsed">
            {rows.map(([k, v]) => <li key={k} className="cell cell-kv"><span>{k}</span><b className={v ? '' : 'empty'}>{v || '아직 없음'}</b></li>)}
            {!parsed.keyMessage && <li className="cell cell-note">핵심 메시지는 따옴표로 감싸거나 “핵심은 ~”처럼 쓰면 찾아요. 녹화 후 이 문장이 처음과 끝에 나왔는지 확인해요.</li>}
          </ul>
          <button type="button" className="btn-fill btn-block" onClick={onRecord}>{guest ? '로그인하고 녹화 준비' : '녹화 준비'}</button>
        </div>
      )}
    </>
  );
}
