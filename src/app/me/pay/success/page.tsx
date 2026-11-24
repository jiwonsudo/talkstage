'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { confirmPayment } from '@/lib/data/payments';
import { REHEARSALS_CHANGED } from '@/lib/data/rehearsals';
import { CREDIT_PER_REHEARSAL } from '@/lib/plans';

/** 토스 결제창에서 돌아오는 곳. 서버에 승인을 요청하고, 성공하면 추가된 회차를 보여 줘요. */
export default function PaySuccess() {
  const sp = useSearchParams();
  const [state, setState] = useState<{ s: 'wait' } | { s: 'ok'; credits: number } | { s: 'err'; msg: string }>({ s: 'wait' });
  const sent = useRef(false); // StrictMode 두 번 실행에도 승인 요청은 한 번만(서버도 중복을 막아요)

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const paymentKey = sp.get('paymentKey') ?? '', orderId = sp.get('orderId') ?? '', amount = Number(sp.get('amount'));
    confirmPayment({ paymentKey, orderId, amount })
      .then(({ credits }) => { setState({ s: 'ok', credits }); window.dispatchEvent(new Event(REHEARSALS_CHANGED)); })
      .catch((e: Error) => setState({ s: 'err', msg: e.message }));
  }, [sp]);

  return (
    <div className="page pay">
      {state.s === 'wait' && <><h1 className="title1">결제를 확인하는 중…</h1><p className="subtitle">창을 닫지 말고 잠시만 기다려 주세요.</p></>}
      {state.s === 'ok' && (
        <>
          <h1 className="title1">리허설 {Math.round(state.credits / CREDIT_PER_REHEARSAL)}회가 추가됐어요</h1>
          <p className="subtitle">{state.credits}크레딧이 들어왔어요. 이번 달 크레딧을 다 쓴 뒤에 쓰이고, 다음 달로 넘어가도 남아요.</p>
          <div className="pay-actions">
            <Link href="/rehearsal/new" className="btn-fill">새 리허설 시작</Link>
            <Link href="/me/rehearsals" className="btn-plain">내 리허설</Link>
          </div>
        </>
      )}
      {state.s === 'err' && (
        <>
          <h1 className="title1">결제를 마치지 못했어요</h1>
          <p className="subtitle">{state.msg}</p>
          <div className="pay-actions"><Link href="/me/plan" className="btn-plain">요금제 관리로</Link></div>
        </>
      )}
    </div>
  );
}
