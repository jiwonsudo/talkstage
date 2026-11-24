'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { SubscribeDone } from '@/components/me/SubscribeDone';
import { startPlan } from '@/lib/data/billing';
import { REHEARSALS_CHANGED } from '@/lib/data/rehearsals';
import { isPaidPlan, isPlanId, type PlanId } from '@/lib/plans';

/** 토스 카드 등록창에서 돌아오는 곳. 서버가 카드를 저장하고, 고른 요금제가 있으면 바로 결제해요. */
export default function SubscribeSuccess() {
  const sp = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<{ s: 'wait' } | { s: 'card' } | { s: 'ok'; plan: PlanId; periodEnd: string } | { s: 'err'; msg: string }>({ s: 'wait' });
  const sent = useRef(false); // StrictMode 두 번 실행에도 한 번만(authKey 는 한 번만 쓸 수 있어요)

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const raw = sp.get('plan');
    const plan = isPlanId(raw) && isPaidPlan(raw) ? raw : undefined;
    startPlan({ authKey: sp.get('authKey') ?? '', customerKey: sp.get('customerKey') ?? '', plan })
      .then(async (r) => {
        if (!plan) { setState({ s: 'card' }); return; }
        await refresh();
        window.dispatchEvent(new Event(REHEARSALS_CHANGED));
        setState({ s: 'ok', plan: r.plan ?? plan, periodEnd: r.periodEnd ?? '' });
      })
      .catch((e: Error) => setState({ s: 'err', msg: e.message }));
  }, [sp, refresh]);

  if (state.s === 'ok') return <SubscribeDone plan={state.plan} periodEnd={state.periodEnd} fromWizard={sp.get('from') === 'wizard'} />;
  return (
    <div className="page pay">
      {state.s === 'wait' && <><h1 className="title1">카드를 등록하는 중…</h1><p className="subtitle">창을 닫지 말고 잠시만 기다려 주세요.</p></>}
      {state.s === 'card' && (
        <>
          <h1 className="title1">카드를 바꿨어요</h1>
          <p className="subtitle">다음 결제부터 새 카드로 결제돼요.</p>
          <div className="pay-actions"><Link href="/me/plan" className="btn-fill">요금제 관리로</Link></div>
        </>
      )}
      {state.s === 'err' && (
        <>
          <h1 className="title1">결제를 마치지 못했어요</h1>
          <p className="subtitle">{state.msg} 카드가 등록됐다면 요금제 관리에서 다시 시도할 수 있어요.</p>
          <div className="pay-actions"><Link href="/me/plan" className="btn-plain">요금제 관리로</Link></div>
        </>
      )}
    </div>
  );
}
