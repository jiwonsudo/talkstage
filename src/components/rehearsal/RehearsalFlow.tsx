'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { listRehearsals, saveRehearsal } from '@/lib/data/rehearsals';
import { useCreditsLeft } from '@/lib/data/useCredits';
import type { Rehearsal } from '@/lib/data/types';
import { CREDIT_PER_REHEARSAL, isPaidPlan } from '@/lib/plans';
import { clearText, loadDraft, purposeOf, saveDraft, toSetup, withPurpose, type Draft } from '@/lib/rehearsal/draft';
import { PURPOSE_BY_ID, type CatId, type PostureId } from '@/lib/scenarios';
import { Report } from './Report';
import { ScriptCheck } from './ScriptCheck';
import { Studio, type StudioResult } from './Studio';
import { STEPS, Wizard } from './Wizard';

type Stage = 'wizard' | 'script' | 'studio' | 'report';

/** 새 리허설: 설정 마법사 → (대본 점검) → 녹화 → 리포트. 리포트는 Supabase 에 점수만 저장해요(영상은 이 기기에만 있어요). */
export function RehearsalFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, ready, openAuth } = useAuth();
  const toast = useToast();
  const creditsLeft = useCreditsLeft(user);

  // 처음 열 때: 저장된 설정을 불러와 지난 대본은 비우고, 주소의 ?purpose·posture·step 을 반영해요.
  // 이 컴포넌트는 브라우저에서만 그려서(ssr:false) localStorage 를 바로 읽어도 돼요.
  const [draft, setDraft] = useState<Draft>(() => {
    let d = clearText(loadDraft());
    const pid = params.get('purpose');
    if (pid && PURPOSE_BY_ID[pid]) d = withPurpose(d, pid);
    const posture = params.get('posture');
    if (posture === 'seated' || posture === 'standing') d = { ...d, posture: posture as PostureId };
    return d;
  });
  const [step, setStep] = useState(() => {
    const s = Number(params.get('step'));
    return Number.isInteger(s) && s > 0 ? Math.min(s, STEPS.length - 1) : 0;
  });
  const [stage, setStage] = useState<Stage>('wizard');
  const [focus, setFocus] = useState<CatId | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const [run, setRun] = useState(0); // 다시 녹화할 때 Studio 를 새로 마운트하려고 써요
  const [done, setDone] = useState<StudioResult | null>(null);
  const [past, setPast] = useState<Rehearsal[]>([]);
  const urlRef = useRef<string | null>(null);

  useEffect(() => { saveDraft(draft); }, [draft]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  useEffect(() => { if (ready && !user) openAuth({ mode: 'in', reason: '리허설을 시작하려면 로그인해 주세요.', next: '/rehearsal/new' }); }, [ready, user, openAuth]);

  const update = useCallback((fn: (d: Draft) => Draft) => setDraft(fn), []);
  const go = useCallback((delta: number) => setStep((s) => Math.max(0, Math.min(STEPS.length - 1, s + delta))), []);
  const top = () => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

  const setup = useMemo(() => ({ ...toSetup(draft), focus }), [draft, focus]);
  const noCredits = creditsLeft !== null && creditsLeft < CREDIT_PER_REHEARSAL;

  const toStudio = (auto = false) => { setAutoStart(auto); setRun((n) => n + 1); setStage('studio'); top(); };

  const onDone = async (r: StudioResult) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = r.videoURL;
    const same = (h: Rehearsal) => h.purpose_id === r.setup.purposeId && h.posture === r.setup.posture;
    let history: Rehearsal[] = [];
    try { history = (await listRehearsals()).filter(same); } catch { /* 기록을 못 불러와도 리포트는 보여 줘요 */ }
    setPast(history);
    setDone(r);
    setStage('report');
    top();
    const R = r.result;
    try {
      await saveRehearsal({
        purpose_id: r.setup.purposeId, posture: r.setup.posture, topic: r.setup.topic || null,
        overall: R.overall, scores: Object.fromEntries(Object.values(R.cats).map((c) => [c.id, c.score])),
        focus: r.setup.focus ?? null, duration_sec: Math.round(r.durationSec),
      });
    } catch {
      toast('리허설 기록을 저장하지 못했어요. 리포트는 그대로 볼 수 있어요.');
    }
  };

  if (!ready || !user) {
    return (
      <section className="screen"><div className="page">
        <h1 className="title">로그인이 필요해요</h1>
        <p className="subtitle">{ready ? '리허설 기록과 크레딧을 계정에 저장하려면 로그인해 주세요.' : '불러오는 중…'}</p>
        {ready && <button type="button" className="btn" onClick={() => openAuth({ mode: 'in', next: '/rehearsal/new' })}>로그인</button>}
      </div></section>
    );
  }

  if (stage === 'studio' && noCredits) {
    return (
      <section className="screen"><div className="page">
        <h1 className="title">이번 달 크레딧을 다 썼어요</h1>
        <p className="subtitle">리허설 한 번에 {CREDIT_PER_REHEARSAL}크레딧이 필요해요. 남은 크레딧은 {creditsLeft}이에요.</p>
        <div className="next-actions">
          <Link className="btn" href="/me/plan">요금제 보기</Link>
          <button type="button" className="btn-ghost" onClick={() => setStage('wizard')}>설정으로 돌아가기</button>
        </div>
      </div></section>
    );
  }

  switch (stage) {
    case 'script':
      return <ScriptCheck draft={draft} update={update} onRecord={() => toStudio()} />;
    case 'studio':
      return (
        <Studio key={run} draft={draft} setup={setup} autoStart={autoStart}
          onFocusClear={() => setFocus(null)}
          onEdit={() => { setStage('wizard'); setStep(0); top(); }}
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
          onEdit={(f) => { setFocus(f); setStage('wizard'); setStep(0); top(); }}
          onHome={() => router.push('/')}
        />
      );
    }
    default:
      return (
        <Wizard draft={draft} update={update} step={step} go={go} paid={isPaidPlan(user.plan)}
          onAnalyzeScript={() => { setStage('script'); top(); }}
          onRecord={() => toStudio()} />
      );
  }
}
