'use client';
import { useEffect, useRef, useState } from 'react';
import { CreditExamples } from '@/components/ui/CreditExamples';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { loadTossPayments, type TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
import { useAuth } from '@/components/auth/AuthProvider';
import { createOrder, type Order } from '@/lib/data/payments';
import { PACKS, isPackId, won } from '@/lib/plans';

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? '';

/**
 * 크레딧 구매 결제 화면(토스페이먼츠 결제위젯). 카드·토스페이·카카오페이·네이버페이 등을 한 화면에서 골라요.
 * 주문(금액)은 DB 가 먼저 만들고, 결제가 끝나면 /me/pay/success 에서 서버가 승인해요.
 */
export default function Pay() {
  const product = useSearchParams().get('product');
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState(() => (isPackId(product) ? (CLIENT_KEY ? '' : '결제 설정(클라이언트 키)이 없어요.') : '고를 수 없는 상품이에요.'));
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const widgets = useRef<TossPaymentsWidgets | null>(null);

  useEffect(() => {
    if (!user || !isPackId(product) || !CLIENT_KEY) return;
    let live = true;
    let undo: (() => void) | null = null;
    // 개발 모드(StrictMode)는 effect 를 바로 두 번 돌려요. 한 틱 미뤄서 첫 번째는 시작도 하지 않게 해요
    // (결제 UI 는 한 화면에 하나만 그릴 수 있어서).
    const t = setTimeout(async () => {
      try {
        const o = await createOrder(product);
        if (!live) return;
        setOrder(o);
        const toss = await loadTossPayments(CLIENT_KEY);
        const w = toss.widgets({ customerKey: user.id });
        await w.setAmount({ currency: 'KRW', value: o.amount });
        const [pm, ag] = await Promise.all([
          w.renderPaymentMethods({ selector: '#pay-methods' }),
          w.renderAgreement({ selector: '#pay-agree' }),
        ]);
        undo = () => { pm.destroy().catch(() => {}); ag.destroy().catch(() => {}); };
        if (!live) { undo(); return; }
        widgets.current = w;
        setReady(true);
      } catch (e) {
        console.error(e);
        if (live) setErr('결제창을 불러오지 못했어요. 새로 고침해 주세요.');
      }
    }, 0);
    return () => { live = false; clearTimeout(t); undo?.(); widgets.current = null; };
  }, [user, product]);

  async function pay() {
    const w = widgets.current;
    if (!w || !order || !user) return;
    setPaying(true);
    try {
      await w.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${location.origin}/me/pay/success`,
        failUrl: `${location.origin}/me/pay/fail`,
        customerEmail: user.email,
        customerName: user.name,
      });
    } catch (e) {
      // 결제창을 닫은 경우 등. 리다이렉트 방식이라 성공하면 여기로 오지 않아요.
      console.warn(e);
      setPaying(false);
    }
  }

  const pack = isPackId(product) ? PACKS[product] : null;
  return (
    <div className="page pay">
      <Link href="/me/plan" className="pay-back">← 요금제·크레딧 관리</Link>
      <h1 className="title1">크레딧 {pack?.credits ?? ''} 구매</h1>
      <p className="subtitle">
        {pack ? `${won(pack.amount)} · 산 크레딧은 기한 없이 남고, 이번 달 크레딧을 다 쓴 뒤에 쓰여요.` : ''}
      </p>
      {pack && <CreditExamples />}
      {err ? <p className="pay-err" role="alert">{err}</p> : (
        <>
          <div className="pay-box">
            <div id="pay-methods" />
            <div id="pay-agree" />
            {!ready && <p className="pay-wait">결제창을 불러오는 중…</p>}
          </div>
          <button type="button" className="btn-fill btn-block pay-go" disabled={!ready || paying} onClick={pay}>
            {paying ? '결제창 여는 중…' : `${order ? won(order.amount) : ''} 결제하기`}
          </button>
          <p className="pay-note">지금은 테스트 결제라 실제로 돈이 나가지 않아요.</p>
        </>
      )}
    </div>
  );
}
