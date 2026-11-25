'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/lib/nav';
import { useAuth } from '@/components/auth/AuthProvider';
import { Picto } from '@/components/ui/Picto';
import { useToast } from '@/components/ui/Toast';
import { syllables } from '@/lib/coach/audio';
import { readScriptFile } from '@/lib/coach/script';
import { AID_OPTS, aidOf, deliveryOf } from '@/lib/delivery';
import { SimpleCoach } from './SimpleCoach';
import { SegPill } from '@/components/ui/SegPill';
import Link from 'next/link';
import {
  CUSTOM_WARN, defaultTitle, PROMPT_COPY, SCRIPT_EXAMPLES, WORRIES,
  purposeOf, recommendTime, targetSecOf, timeOpts, withPurpose, type Draft, type PracticeMode,
} from '@/lib/rehearsal/draft';
import { CAT_LABEL, POSTURES, PURPOSES, fmtMin, type CatId } from '@/lib/scenarios';

export const STEPS = ['purpose', 'posture', 'aid', 'outcome', 'time', 'worry', 'prompt'] as const;
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
  onAnalyzeScript: () => void;
  onRecord: () => void;
};
type ChoiceProps = Pick<Props, 'draft' | 'update' | 'go' | 'paid' | 'chosen' | 'mark'>;

export function Wizard({ draft, update, step, go, paid, guest, chosen, mark, onAnalyzeScript, onRecord }: Props) {
  const id = STEPS[step];
  const [dir, setDir] = useState(1);
  const prev = useRef(step);
  useEffect(() => { setDir(step >= prev.current ? 1 : -1); prev.current = step; }, [step]);

  return (
    <section className="screen">
      <div className="page wiz">
        <div className="wiz-progress">
          <div className="wiz-bar"><i style={{ width: `${((step + 1) / STEPS.length) * 100}%`, '--f': (step + 1) / STEPS.length }} /></div>
          <span>{step + 1}/{STEPS.length}</span>
        </div>
        {guest && step === 0 && <p className="wiz-note wiz-guest">설정은 로그인 없이 골라 볼 수 있어요. 녹화를 시작할 때 로그인해 주세요.</p>}
        <div aria-live="polite" key={id} className={`step ${dir < 0 ? 'from-left' : 'from-right'}`}>
          {id === 'prompt'
            ? <PromptStep draft={draft} update={update} guest={guest} paid={paid} onAnalyzeScript={onAnalyzeScript} onRecord={onRecord} />
            : <ChoiceStep id={id} draft={draft} update={update} go={go} paid={paid} chosen={chosen} mark={mark} />}
        </div>
      </div>
    </section>
  );
}

// 앞 단계를 바꾸면 기본값이 바뀌는 뒤 단계: 목적 → 목표·시간, 목표 → 시간
const DEPENDS: Partial<Record<StepId, StepId[]>> = { purpose: ['aid', 'outcome', 'time'], outcome: ['time'] };

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
  } else if (id === 'aid') {
    const dl = deliveryOf(draft.purposeId);
    const interview = dl.aids.includes('panel');
    title = interview ? '어떤 면접인가요?' : '무엇을 보여 주며 발표하나요?';
    sub = interview
      ? '대면 면접이면 면접관 여러 명에게 시선을 나누는지까지 봐요. 카메라는 가운데 면접관 자리에 두세요.'
      : '화면·제품을 가리키고 들어 보이는 순간은 시선 감점 없이, 제대로 보여 줬는지를 따로 코칭해요.';
    options = dl.aids.map((a) => ({ label: AID_OPTS[a].label, sub: a === dl.defaultAid ? `${AID_OPTS[a].sub} · 이 발표에서 가장 흔해요` : AID_OPTS[a].sub }));
    value = dl.aids.indexOf(aidOf(draft.purposeId, draft.aid));
    pick = (i) => update((d) => ({ ...d, aid: dl.aids[i] }));
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

// 직접 입력한 발표 이름에서 가장 가까운 기본 유형을 찾아요(키워드). 못 찾으면 null.
const PURPOSE_WORDS: Record<string, string[]> = {
  interview: ['면접', '인터뷰', '채용', '입사', '전형', 'pt면접', '임원'],
  ir: ['ir', '투자', '피칭', '데모데이', '스타트업', '창업', '경진', '공모전', '시연', '데모', '제품', '세일즈', '영업', '제안'],
  report: ['보고', '회의', '브리핑', '사내', '팀장', '주간', '월간', '분기', '기획', '결과'],
  lecture: ['강의', '수업', '교육', '강연', '워크숍', '튜토리얼', '온보딩', '특강'],
  conference: ['학회', '세미나', '컨퍼런스', '포럼', '논문', '연구', '심포지엄', '콜로키엄'],
  capstone: ['졸업', '캡스톤', '과제', '조별', '팀플', '수행평가', '해커톤', '프로젝트', '학기'],
  speech: ['축사', '연설', '스피치', '건배', '인사말', '추도', '결혼', '사회', '스토리'],
};
const GENERAL_BASE = 'conference';
function guessPurpose(name: string): string | null {
  const t = name.toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  let best: string | null = null, hits = 0;
  for (const [id, words] of Object.entries(PURPOSE_WORDS)) {
    const n = words.filter((w) => t.includes(w)).length;
    if (n > hits) { best = id; hits = n; }
  }
  return best;
}
const plabel = (id: string) => PURPOSES.find((x) => x.id === id)?.label ?? id;
const norm = (s: string) => s.toLowerCase().replace(/[\s·,.!?~\-()]/g, '');
/** 두 문구가 거의 같은지(글자 2개씩 겹치는 비율) */
function similar(a: string, b: string) {
  const A = norm(a), B = norm(b);
  if (!A || !B) return false;
  if (A === B || A.includes(B) || B.includes(A)) return true;
  const grams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const ga = grams(A), gb = grams(B);
  const common = [...ga].filter((g) => gb.has(g)).length;
  return common / Math.max(1, Math.min(ga.size, gb.size)) >= 0.6;
}

function CustomPurpose({ draft, update, go, paid, mark }: Pick<ChoiceProps, 'draft' | 'update' | 'go' | 'paid' | 'mark'>) {
  const cp = draft.customPurpose;
  const [name, setName] = useState(cp?.name ?? '');
  // base: 고른 유형 id, 'none' = 비슷한 유형이 없어요. picked: 사용자가 직접 골랐는지(자동 추천이 덮어쓰지 않게)
  const [base, setBase] = useState<string>(cp ? (cp.general ? 'none' : cp.base) : '');
  const [picked, setPicked] = useState(!!cp);
  const [tried, setTried] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  if (!paid) return <Lock title="원하는 발표가 없나요? 직접 입력하기" />;

  const n = name.trim();
  const guess = guessPurpose(n);
  const shown = picked ? base : (guess ?? base);
  const same = PURPOSES.find((x) => similar(x.label, n) || x.label.split(/\s*·\s*/).some((w) => norm(w) === norm(n)));
  const nameErr = !n ? '발표 이름을 적어 주세요.' : n.length < 2 ? '두 글자 이상으로 적어 주세요.' : '';
  const baseErr = shown ? '' : '가장 비슷한 유형을 하나 골라 주세요. 없으면 "비슷한 유형이 없어요"를 골라 주세요.';
  const choose = (id: string) => { setBase(id); setPicked(true); };
  const submit = () => {
    if (nameErr || baseErr) { setTried(true); if (nameErr) nameRef.current?.focus(); return; }
    const general = shown === 'none';
    const b = general ? GENERAL_BASE : shown;
    mark('purpose', DEPENDS.purpose);
    update((d) => ({ ...withPurpose(d, b), customPurpose: { name: n, base: b, ...(general ? { general: true } : {}) } }));
    go(1);
  };
  return (
    <details className="custom-box" open={!!cp}>
      <summary>원하는 발표가 없나요? 직접 입력하기</summary>
      <label className={`field${tried && nameErr ? ' is-bad' : ''}`}>
        <span>발표 이름 <em className="req">필수</em></span>
        <input ref={nameRef} type="text" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 사내 해커톤 결선 발표" aria-invalid={(tried && !!nameErr) || undefined} />
        {tried && nameErr && <em className="field-err" role="alert">{nameErr}</em>}
      </label>
      {same && (
        <p className="custom-hint">
          &lsquo;{same.label}&rsquo;은 이미 있는 유형이에요. 기본 유형으로 고르면 목표·기준이 더 잘 맞아요.{' '}
          <button type="button" className="link-btn" onClick={() => { mark('purpose', DEPENDS.purpose); update((d) => ({ ...withPurpose(d, same.id), customPurpose: null })); go(1); }}>{same.label}(으)로 고르기</button>
        </p>
      )}
      <p className="group-h">가장 비슷한 유형 <em className="req">필수</em> <small>이 유형의 속도·쉼·시선 기준으로 코칭해요</small></p>
      <div className={`custom-chips${tried && baseErr ? ' is-bad' : ''}`}>
        {PURPOSES.map((x) => <button key={x.id} type="button" className={x.id === shown ? 'is-on' : ''} aria-pressed={x.id === shown} onClick={() => choose(x.id)}>{x.label}</button>)}
        <button type="button" className={`chip-none${shown === 'none' ? ' is-on' : ''}`} aria-pressed={shown === 'none'} onClick={() => choose('none')}>비슷한 유형이 없어요</button>
      </div>
      {!picked && guess && <p className="custom-hint">발표 이름을 보고 &lsquo;{plabel(guess)}&rsquo;를 골라 뒀어요. 다르면 바꿔 주세요.</p>}
      {shown === 'none' && <p className="custom-hint">청중 앞에서 설명하는 일반 발표 기준({plabel(GENERAL_BASE)}과 같은 속도·쉼·시선)으로 코칭해요. 상황에 꼭 맞는 기준이 아니라 점수가 덜 정확할 수 있어요.</p>}
      {tried && baseErr && <p className="field-err" role="alert">{baseErr}</p>}
      <p className="custom-warn">{CUSTOM_WARN}</p>
      <button type="button" className="btn-fill btn-block" onClick={submit}>이 설정으로 다음</button>
    </details>
  );
}

function CustomGoalBox({ draft, update, paid }: { draft: Draft; update: Props['update']; paid: boolean }) {
  const toast = useToast();
  const cg = draft.customGoal;
  const [label, setLabel] = useState(cg?.label ?? '');
  const [focus, setFocus] = useState<CatId | 'none' | ''>(cg?.focus ?? '');
  const [tried, setTried] = useState(false);
  const inRef = useRef<HTMLInputElement>(null);
  if (!paid) return <Lock title="원하는 목표를 직접 추가하기" />;

  const t = label.trim();
  const outs = purposeOf(draft).outcomes;
  const dupIdx = t ? outs.findIndex((o) => similar(o.label, t)) : -1;
  const full = !cg && draft.outcomeIdxs.length >= MULTI;
  const labelErr = !t ? '목표를 적어 주세요.' : t.length < 4 ? '조금 더 구체적으로 적어 주세요(4자 이상).' : '';
  const focusErr = focus ? '' : '가장 가까운 코칭 항목을 골라 주세요. 없으면 "딱 맞는 항목이 없어요"를 골라 주세요.';
  const fullErr = full ? `목표는 최대 ${MULTI}개예요. 위에서 하나를 빼고 추가해 주세요.` : '';
  const submit = () => {
    if (labelErr || focusErr || fullErr) { setTried(true); if (labelErr) inRef.current?.focus(); return; }
    update((d) => ({ ...d, customGoal: { label: t, focus: focus as CatId | 'none', cta: false } }));
    setTried(false);
    toast('목표에 추가했어요');
  };
  return (
    <details className="custom-box" open={!!cg}>
      <summary>{cg ? `직접 추가한 목표: ${cg.label}` : '원하는 목표를 직접 추가하기'}</summary>
      <label className={`field${tried && labelErr ? ' is-bad' : ''}`}>
        <span>목표 <em className="req">필수</em> <small>(고른 목표와 합쳐 최대 {MULTI}개)</small></span>
        <input ref={inRef} type="text" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 기술 질문에 막힘없이 답하기" aria-invalid={(tried && !!labelErr) || undefined} />
        {tried && labelErr && <em className="field-err" role="alert">{labelErr}</em>}
      </label>
      {dupIdx >= 0 && (
        <p className="custom-hint">
          위 목록의 &lsquo;{outs[dupIdx].label}&rsquo;과 거의 같아요.{' '}
          {draft.outcomeIdxs.includes(dupIdx) ? '이미 골라 둔 목표예요.' : (
            <button type="button" className="link-btn" disabled={draft.outcomeIdxs.length >= MULTI}
              onClick={() => { update((d) => ({ ...d, outcomeIdxs: [...d.outcomeIdxs, dupIdx] })); setLabel(''); toast('목록의 목표를 골랐어요'); }}>
              {draft.outcomeIdxs.length >= MULTI ? `목표가 이미 ${MULTI}개예요` : '목록에서 고르기'}
            </button>
          )}
        </p>
      )}
      <p className="group-h">가장 가까운 코칭 항목 <em className="req">필수</em> <small>이 항목을 더 무겁게 봐요</small></p>
      <div className={`custom-chips${tried && focusErr ? ' is-bad' : ''}`}>
        {(Object.entries(CAT_LABEL) as [CatId, string][]).map(([k, l]) => <button key={k} type="button" className={k === focus ? 'is-on' : ''} aria-pressed={k === focus} onClick={() => setFocus(k)}>{l}</button>)}
        <button type="button" className={`chip-none${focus === 'none' ? ' is-on' : ''}`} aria-pressed={focus === 'none'} onClick={() => setFocus('none')}>딱 맞는 항목이 없어요</button>
      </div>
      {focus === 'none' && <p className="custom-hint">특정 항목에 가중치를 두지 않고, 목표 문구만 리포트에 함께 보여 드려요.</p>}
      {tried && focusErr && <p className="field-err" role="alert">{focusErr}</p>}
      {tried && fullErr && <p className="field-err" role="alert">{fullErr}</p>}
      <p className="custom-warn">{CUSTOM_WARN}</p>
      <div className="custom-act">
        <button type="button" className="btn-fill" onClick={submit}>{cg ? '바꾸기' : '목표에 추가'}</button>
        {cg && <button type="button" className="btn-ghost" onClick={() => { update((d) => ({ ...d, customGoal: null })); setLabel(''); setFocus(''); setTried(false); }}>빼기</button>}
      </div>
    </details>
  );
}

const MODES: [PracticeMode, string][] = [['full', '영상+음성'], ['voice', '음성만'], ['script', '대본만']];
const MODE_NOTE: Record<PracticeMode, string> = {
  full: '권장 · 카메라와 마이크로 말·시선·자세·제스처까지 봐요.',
  voice: '카메라가 없거나 켜기 어려울 때 · 마이크로 말 빠르기·쉼·톤·군더더기 말·시간만 봐요. 리허설 1번과 같은 크레딧이에요.',
  script: '말하기 어려울 때 · 녹화 없이 대본만 분석해요. 리허설 크레딧은 쓰지 않아요.',
};

function PromptStep({ draft, update, guest, paid, onAnalyzeScript, onRecord }: Pick<Props, 'draft' | 'update' | 'guest' | 'paid' | 'onAnalyzeScript' | 'onRecord'>) {
  const has = draft.hasScript;
  const p = purposeOf(draft);
  const mode = draft.mode;
  const scriptOnly = mode === 'script';
  const copy = scriptOnly ? PROMPT_COPY.script : PROMPT_COPY[has];
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  // 버튼은 늘 누를 수 있어요. 누르면 빠진 칸을 빨간 윤곽과 이유로 바로 보여 주고 그 칸으로 데려가요.
  const [tried, setTried] = useState(false);
  const focusRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = setTimeout(() => focusRef.current?.focus(), 80); return () => clearTimeout(t); }, [has]);

  const scN = syllables(draft.script);
  const titleErr = draft.title.trim() ? '' : '리허설 제목을 적어 주세요. 같은 제목끼리 연습 기록이 모여요.';
  // 대본 점검·AI 코칭으로 가려면 대본이 있어야 해요(무료는 대본 없이도 녹화할 수 있어요).
  const needScript = has === 'yes' && (guest || paid || scriptOnly);
  const scriptErr = needScript && scN < 20 ? (scN ? `대본이 너무 짧아요. 지금 ${scN}음절, 20음절 이상 적어 주세요.` : '대본을 붙여넣거나 파일을 올려 주세요.') : '';

  function attempt(next: () => void, checkScript: boolean) {
    const bad: [string, HTMLElement | null][] = [[titleErr, titleRef.current], [checkScript ? scriptErr : '', scriptRef.current]];
    const first = bad.find(([e]) => e);
    if (first) {
      setTried(true);
      first[1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => first[1]?.focus({ preventScroll: true }), 250);
      return;
    }
    next();
  }

  async function load(f: File | undefined) {
    if (!f) return;
    try { const text = await readScriptFile(f); update((d) => ({ ...d, script: text })); setErr(''); }
    catch (e) { setErr((e as Error).message || '파일을 읽지 못했어요.'); }
  }

  const showTitleErr = tried && !!titleErr;
  const showScriptErr = tried && !!scriptErr;
  const titleField = (
    <label className={`field w-title${showTitleErr ? ' is-bad' : ''}`}><span>리허설 제목 <em className="req">필수</em> <small>(같은 제목끼리 연습 기록이 모여요)</small></span>
      <input ref={titleRef} type="text" maxLength={60} required aria-required="true" aria-invalid={showTitleErr || undefined} value={draft.title}
        onChange={(e) => update((d) => ({ ...d, title: e.target.value }))} placeholder={`예: ${defaultTitle(draft)}`} />
      {showTitleErr && <em className="field-err" role="alert">{titleErr}</em>}
    </label>
  );

  // 연습 방식: 영상+음성(기본) · 음성만(카메라 없이) · 대본만(녹화 없이). 대본만은 대본이 있어야 해요.
  const pickMode = (m: PracticeMode) => update((d) => ({ ...d, mode: m, hasScript: m === 'script' ? 'yes' : d.hasScript }));
  const recLabel = mode === 'voice' ? '녹음 준비' : '녹화 준비';
  const modeField = (
    <div className="field w-mode"><span id="wModeLab">연습 방식</span>
      <div className="seg seg-3" role="radiogroup" aria-labelledby="wModeLab">
        {MODES.map(([m, l]) => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => pickMode(m)}>{l}</button>)}
        <SegPill />
      </div>
      <small className="w-mode-note" key={mode}>{MODE_NOTE[mode]}</small>
    </div>
  );

  return (
    <>
      <h1 className="title1">{copy.title}</h1>
      <p className="subtitle">{copy.sub}</p>
      {has === 'yes' || scriptOnly ? (
        <div className="wiz-pane">
          {titleField}
          {modeField}
          {!scriptOnly && (
            <button type="button" className="alt-path" onClick={() => update((d) => ({ ...d, hasScript: 'no' }))}>
              <b>대본이 없나요?</b><span>제목과 핵심 메시지만 적고 바로 {mode === 'voice' ? '녹음' : '녹화'}해요</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </button>
          )}
          <div className={`textview wiz-drop${over ? ' is-over' : ''}${showScriptErr ? ' is-bad' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]); }}>
            <textarea ref={(el) => { scriptRef.current = el; focusRef.current = el as HTMLTextAreaElement & HTMLInputElement; }} rows={9} value={draft.script} aria-invalid={showScriptErr || undefined}
              onChange={(e) => { update((d) => ({ ...d, script: e.target.value })); setErr(''); }}
              placeholder={`발표 대본을 붙여넣거나, 파일(.txt · .md · .docx)을 여기에 끌어다 놓으세요.\n\n예시)\n${SCRIPT_EXAMPLES[p.id] ?? SCRIPT_EXAMPLES.report}`} />
          </div>
          {showScriptErr && <p className="field-err" role="alert">{scriptErr}</p>}
          <div className="chips-row">
            <label className="chip-btn wiz-file">파일 올리기<input type="file" accept=".txt,.md,.docx,text/plain" hidden onChange={(e) => load(e.target.files?.[0])} /></label>
            <span className="file-types">.txt · .md · .docx</span>
            <span className="count">{scN ? `${scN}음절` : ''}</span>
          </div>
          <p className="wiz-err" hidden={!err}>{err}</p>
          <label className="field"><span>핵심 메시지 <small>(선택)</small></span>
            <input type="text" maxLength={80} value={draft.key} onChange={(e) => update((d) => ({ ...d, key: e.target.value }))} placeholder="청중이 기억했으면 하는 한 문장" />
          </label>
          {!guest && !paid && scN >= 20 && <SimpleCoach draft={draft} />}
          {guest ? <button type="button" className="btn-fill btn-block w-analyze" onClick={() => attempt(onAnalyzeScript, true)}>{scriptOnly ? '로그인하고 대본 분석하기' : '로그인하고 계속하기'}</button>
            : paid ? <button type="button" className="btn-fill btn-block w-analyze" onClick={() => attempt(onAnalyzeScript, true)}>{scriptOnly ? '대본 분석·AI 코칭 받기' : '대본 점검·AI 코칭 받기'}</button>
            : scriptOnly ? (
              <div className="w-script-free">
                <p className="wiz-note">무료 요금제는 위의 간단 코칭까지 볼 수 있어요. 시간·흐름·읽기 가이드와 AI 대본 코칭은 Spotlight부터예요.</p>
                <Link href="/me/plan?pick=Spotlight&from=wizard" className="btn-fill btn-block">요금제 보고 AI 코칭 받기</Link>
                <button type="button" className="btn-plain btn-block" onClick={() => attempt(() => { pickMode('full'); onRecord(); }, true)}>이 대본으로 녹화 준비</button>
              </div>
            )
            : <button type="button" className="btn-fill btn-block w-analyze" onClick={() => attempt(onRecord, false)}>{recLabel}</button>}
        </div>
      ) : (
        <div className="wiz-pane">
          {titleField}
          {modeField}
          <button type="button" className="back-path" onClick={() => update((d) => ({ ...d, hasScript: 'yes' }))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 5l-7 7 7 7" /></svg>대본이 있어요
          </button>
          <label className="field"><span>핵심 메시지 <small>(선택)</small></span>
            <input ref={focusRef} type="text" maxLength={80} value={draft.key} onChange={(e) => update((d) => ({ ...d, key: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); attempt(onRecord, false); } }}
              placeholder="청중이 기억했으면 하는 한 문장" />
          </label>
          <p className="wiz-note">적어 두면 {mode === 'voice' ? '녹음' : '녹화'}한 뒤 이 문장을 처음과 끝에 말했는지 확인해요.</p>
          <button type="button" className="btn-fill btn-block" onClick={() => attempt(onRecord, false)}>{guest ? `로그인하고 ${recLabel}` : recLabel}</button>
        </div>
      )}
    </>
  );
}
