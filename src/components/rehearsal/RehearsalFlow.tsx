'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/lib/nav';
import { useAuth } from '@/components/auth/AuthProvider';
import { listRehearsals, NoCreditsError, recordRehearsal } from '@/lib/data/rehearsals';
import { useCredits } from '@/lib/data/useCredits';
import type { Rehearsal } from '@/lib/data/types';
import { isPaidPlan } from '@/lib/plans';
import { clearText, loadDraft, purposeOf, saveDraft, toSetup, withPurpose, type Draft } from '@/lib/rehearsal/draft';
import { PURPOSE_BY_ID, type CatId, type PostureId } from '@/lib/scenarios';
import { Report } from './Report';
import { ScriptCheck } from './ScriptCheck';
import { Studio, type StudioResult } from './Studio';
import { STEPS, Wizard, type StepId } from './Wizard';

type Stage = 'wizard' | 'script' | 'studio' | 'report' | 'nocredit';

const stepOf = (sp: URLSearchParams) => {
  const s = Number(sp.get('step'));
  return Number.isInteger(s) && s > 0 ? Math.min(s, STEPS.length - 1) : 0;
};
/** 설정 단계마다 브라우저 기록을 남겨서 뒤로(내비 화살표·폰 뒤로 가기)가 이전 단계로 가게 해요. */
const pushView = (step: number, view: 'wizard' | 'script' = 'wizard') => {
  const u = new URL(location.href);
  u.searchParams.set('step', String(step));
  if (view === 'script') u.searchParams.set('view', 'script'); else u.searchParams.delete('view');
  u.searchParams.delete('resume');
  history.pushState(null, '', u.pathname + u.search);
};

/**
 * 새 리허설: 설정 마법사 → (대본 점검) → 녹화 → 리포트. 리포트는 Supabase 에 점수만 저장해요(영상은 이 기기에만 있어요).
 * 크레딧은 "종료하고 분석" 뒤 서버(record_rehearsal)가 확인·차감하고, 저장이 성공해야 리포트를 보여 줘요.
 * 크레딧을 확인할 수 없거나 모자라면 녹화 화면에 들어가지 못해요.
 * 설정은 로그인 없이 고를 수 있고, 마지막 단계(대본 분석·녹화 준비)에서 로그인해요. 로그인 뒤 고른 설정 그대로 이어가요.
 */
export function RehearsalFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, requireAuth } = useAuth();
  const credits = useCredits(user);

  // 처음 열 때: 저장된 설정을 불러와 지난 대본은 비우고, 주소의 ?purpose·posture·step 을 반영해요.
  // ?resume=1 은 로그인(소셜 로그인 리다이렉트) 뒤 돌아온 경우라 적어 둔 대본·설명을 그대로 둬요.
  // 이 컴포넌트는 브라우저에서만 그려서(ssr:false) localStorage 를 바로 읽어도 돼요.
  const resume = params.get('resume') === '1';
  const [draft, setDraft] = useState<Draft>(() => {
    let d = resume ? loadDraft() : clearText(loadDraft());
    const pid = params.get('purpose');
    if (pid && PURPOSE_BY_ID[pid]) d = withPurpose(d, pid);
    const posture = params.get('posture');
    if (posture === 'seated' || posture === 'standing') d = { ...d, posture: posture as PostureId };
    return d;
  });
  const [step, setStep] = useState(() => stepOf(params));
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);
  // 이번에 직접 고른 단계. 지난번 설정이나 기본값은 체크로 보여 주지 않아요(체크돼 있는데 안 넘어가는 혼란 방지).
  const [chosen, setChosen] = useState<ReadonlySet<StepId>>(() => {
    if (resume) return new Set(STEPS);
    const s = new Set<StepId>();
    if (params.get('purpose') && PURPOSE_BY_ID[params.get('purpose')!]) s.add('purpose');
    if (params.get('posture')) s.add('posture');
    return s;
  });
  const [stage, setStage] = useState<Stage>('wizard');
  const [focus, setFocus] = useState<CatId | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const [run, setRun] = useState(0); // 다시 녹화할 때 Studio 를 새로 마운트하려고 써요
  const [done, setDone] = useState<StudioResult | null>(null);
  const [past, setPast] = useState<Rehearsal[]>([]);
  const [saving, setSaving] = useState<{ r: StudioResult; failed: boolean } | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => { saveDraft(draft); }, [draft]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const update = useCallback((fn: (d: Draft) => Draft) => setDraft(fn), []);
  const mark = useCallback((id: StepId, drop: StepId[] = []) => setChosen((c) => {
    const n = new Set(c); n.add(id); drop.forEach((x) => n.delete(x)); return n;
  }), []);
  const go = useCallback((delta: number) => {
    const s = stepRef.current, n = Math.max(0, Math.min(STEPS.length - 1, s + delta));
    if (n === s) return;
    if (delta > 0) pushView(n);
    stepRef.current = n;
    setStep(n);
  }, []);

  // 중간 단계로 바로 들어오면(랜딩의 상황 카드 → step=1, 다시 연습 → step=2, 로그인 후 복귀 등) 앞 단계 기록을 채워서
  // 뒤로 가기가 홈이 아니라 이전 단계(결국 발표 목적 고르기)로 가게 해요. StrictMode 두 번 실행에 대비해 ref 로 한 번만.
  const seeded = useRef(false);
  useEffect(() => {
    const n = stepRef.current;
    if (seeded.current || n === 0 || new URLSearchParams(location.search).get('view')) return;
    seeded.current = true;
    const u = new URL(location.href);
    u.searchParams.delete('resume');
    u.searchParams.set('step', '0');
    history.replaceState(history.state, '', u.pathname + u.search);
    for (let i = 1; i <= n; i++) { u.searchParams.set('step', String(i)); history.pushState(null, '', u.pathname + u.search); }
  }, []);

  // 뒤로/앞으로 가기: 주소의 step·view 로 화면을 맞춰요(녹화·리포트에서 뒤로 가면 설정으로 돌아와요).
  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(location.search);
      const n = stepOf(sp);
      stepRef.current = n;
      setStep(n);
      setStage(sp.get('view') === 'script' ? 'script' : 'wizard');
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const top = () => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

  const setup = useMemo(() => ({ ...toSetup(draft), focus }), [draft, focus]);

  const toStudio = (auto = false) => { setAutoStart(auto); setRun((n) => n + 1); setStage('studio'); top(); };
  // 마지막 단계에서만 로그인을 받아요. 소셜 로그인은 페이지를 떠났다가 마지막 단계로 돌아와요.
  const signedIn = (fn: () => void) => requireAuth(fn, '고른 설정은 그대로 남아 있어요. 로그인하면 바로 이어서 진행해요.', `/rehearsal/new?step=${STEPS.length - 1}&resume=1`);

  const dropVideo = () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = null; };

  // 서버에 저장(=크레딧 차감)이 성공해야 리포트로 넘어가요.
  const commit = async (r: StudioResult) => {
    setSaving({ r, failed: false });
    const R = r.result;
    let saved: Rehearsal;
    try {
      saved = await recordRehearsal({
        purpose_id: r.setup.purposeId, posture: r.setup.posture, topic: r.setup.topic || null,
        overall: R.overall, scores: Object.fromEntries(Object.values(R.cats).map((c) => [c.id, c.score])),
        focus: r.setup.focus ?? null, duration_sec: Math.round(r.durationSec),
      });
    } catch (e) {
      if (e instanceof NoCreditsError) { dropVideo(); setSaving(null); setStage('nocredit'); top(); return; }
      setSaving({ r, failed: true });
      return;
    }
    const same = (h: Rehearsal) => h.id !== saved.id && h.purpose_id === r.setup.purposeId && h.posture === r.setup.posture;
    let history: Rehearsal[] = [];
    try { history = (await listRehearsals()).filter(same); } catch { /* 지난 기록을 못 불러와도 리포트는 보여 줘요 */ }
    setPast(history);
    setDone(r);
    setSaving(null);
    setStage('report');
    top();
  };

  const onDone = (r: StudioResult) => {
    dropVideo();
    urlRef.current = r.videoURL;
    void commit(r);
  };

  // 로그인 없이 대본 점검·녹화 화면에 들어온 경우(로그아웃 등)는 설정으로 돌려보내요.
  if (!user && stage !== 'wizard') {
    return (
      <section className="screen"><div className="page">
        <h1 className="title">로그인이 필요해요</h1>
        <p className="subtitle">리허설 기록과 크레딧을 계정에 저장하려면 로그인해 주세요. 고른 설정은 그대로 남아 있어요.</p>
        <div className="next-actions">
          <button type="button" className="btn" onClick={() => signedIn(() => {})}>로그인</button>
          <button type="button" className="btn-ghost" onClick={() => setStage('wizard')}>설정으로 돌아가기</button>
        </div>
      </div></section>
    );
  }

  if (saving?.failed) {
    return (
      <section className="screen"><div className="page">
        <h1 className="title">리허설을 저장하지 못했어요</h1>
        <p className="subtitle">인터넷 연결을 확인하고 다시 시도해 주세요. 저장되면 바로 리포트를 보여 드려요. 녹화 내용은 이 화면을 벗어나기 전까지 남아 있어요.</p>
        <div className="next-actions">
          <button type="button" className="btn" onClick={() => void commit(saving.r)}>다시 시도</button>
          <button type="button" className="btn-ghost" onClick={() => { dropVideo(); setSaving(null); setStage('wizard'); top(); }}>버리고 설정으로</button>
        </div>
      </div></section>
    );
  }

  // 녹화 화면에 들어갈 때(저장 중이 아닐 때) 크레딧을 확인해요.
  if ((stage === 'studio' && !saving) || stage === 'nocredit') {
    const c = credits;
    if (!c || c.status === 'loading') {
      return <section className="screen"><div className="page"><p className="subtitle">남은 크레딧을 확인하는 중이에요…</p></div></section>;
    }
    if (c.status === 'error') {
      return (
        <section className="screen"><div className="page">
          <h1 className="title">크레딧을 확인하지 못했어요</h1>
          <p className="subtitle">남은 크레딧을 확인해야 녹화를 시작할 수 있어요. 인터넷 연결을 확인하고 다시 시도해 주세요.</p>
          <div className="next-actions">
            <button type="button" className="btn" onClick={c.retry}>다시 확인</button>
            <button type="button" className="btn-ghost" onClick={() => setStage('wizard')}>설정으로 돌아가기</button>
          </div>
        </div></section>
      );
    }
    if (stage === 'nocredit' || c.left < c.cost) {
      return (
        <section className="screen"><div className="page">
          <h1 className="title">이번 달 크레딧을 다 썼어요</h1>
          <p className="subtitle">리허설 한 번에 {c.cost}크레딧이 필요해요. 남은 크레딧은 {c.left}이에요. 다음 달 1일에 다시 채워져요.</p>
          <div className="next-actions">
            <Link className="btn" href="/me/plan">요금제 보기</Link>
            <button type="button" className="btn-ghost" onClick={() => setStage('wizard')}>설정으로 돌아가기</button>
          </div>
        </div></section>
      );
    }
  }

  switch (stage) {
    case 'script':
      return <ScriptCheck draft={draft} update={update} onRecord={() => toStudio()} />;
    case 'studio':
      return (
        <Studio key={run} draft={draft} setup={setup} autoStart={autoStart}
          onFocusClear={() => setFocus(null)}
          onEdit={() => { pushView(0); setStage('wizard'); setStep(0); top(); }}
          onDone={onDone} />
      );
    case 'report': {
      if (!done) return null;
      const prev = past[0] ?? null; // listRehearsals 는 최신순
      return (
        <Report
          result={done.result} videoURL={done.videoURL} setup={done.setup} purpose={purposeOf(draft)}
          prev={prev}
          history={[...past].reverse().map((h) => ({ at: Date.parse(h.created_at), overall: h.overall, focus: h.focus }))}
          onRetry={(f) => { setFocus(f); toStudio(true); }}
          onEdit={(f) => { setFocus(f); pushView(0); setStage('wizard'); setStep(0); top(); }}
          onHome={() => router.push('/')}
        />
      );
    }
    default:
      return (
        <Wizard draft={draft} update={update} step={step} go={go} paid={isPaidPlan(user?.plan)}
          guest={!user} chosen={chosen} mark={mark}
          onExit={() => router.push('/')}
          onAnalyzeScript={() => signedIn(() => { pushView(stepRef.current, 'script'); setStage('script'); top(); })}
          onRecord={() => signedIn(() => toStudio())} />
      );
  }
}
