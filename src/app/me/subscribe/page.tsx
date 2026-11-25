'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';
import { useAuth } from '@/components/auth/AuthProvider';
import { SubscribeDone } from '@/components/me/SubscribeDone';
import { fetchSubscription, shortDate, startPlan, type Subscription } from '@/lib/data/billing';
import { CREDIT_PER_REHEARSAL, PLAN_PRICE, PLANS, isPaidPlan, isPlanId, won, type PlanId } from '@/lib/plans';

/** 자동결제(빌링)는 결제위젯 키가 아니라 API 개별 연동 키(test_ck)를 써요 */
const BILLING_KEY = process.env.NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY ?? '';

const rank = (p: PlanId | null) => (p ? PLANS[p].credits : 0);

/** 업그레이드 금액 미리 보기(서버 sub_new_payment 와 같은 계산). 실제 금액은 서버가 정해요. */
function upgradeAmount(s: Subscription, plan: PlanId) {
  if (!s.periodEnd || !s.plan) return PLAN_PRICE[plan];
  const end = new Date(s.periodEnd), start = new Date(end);
  start.setMonth(start.getMonth() - 1);
  const frac = Math.min(1, Math.max(0, (end.getTime() - Date.now()) / (end.getTime() - start.getTime())));
  return Math.max(100, PLAN_PRICE[plan] - Math.floor(PLAN_PRICE[s.plan] * frac));
}

/**
 * 월 요금제 시작·업그레이드, 카드 바꾸기(?card=1).
 * 카드가 등록돼 있으면 바로 결제하고, 없으면 토스 카드 등록창을 거쳐 /me/subscribe/success 에서 결제해요.
 */
export default function Subscribe() {
  const sp = useSearchParams();
  const raw = sp.get('plan'), onlyCard = sp.get('card') === '1', from = sp.get('from');
  const plan = isPlanId(raw) && isPaidPlan(raw) ? raw : null;
  const { user, refresh } = useAuth();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [err, setErr] = useState(() => (!BILLING_KEY ? '정기결제 설정(클라이언트 키)이 없어요.' : !plan && !onlyCard ? '고를 수 없는 요금제예요.' : ''));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ plan: PlanId; periodEnd: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    fetchSubscription().then((s) => { if (live) setSub(s); }).catch((e: Error) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [user]);

  const live = !!sub && (sub.status === 'active' || sub.status === 'canceled') && !!sub.periodEnd && new Date(sub.periodEnd) > new Date();
  const upgrade = live && !!plan && rank(plan) > rank(sub!.plan);
  const blocked = live && !!plan && !upgrade; // 같은·낮은 요금제는 요금제·크레딧 관리에서 예약
  const amount = plan ? (upgrade ? upgradeAmount(sub!, plan) : PLAN_PRICE[plan]) : 0;

  async function registerCard() {
    if (!sub || !user) return;
    setBusy(true);
    try {
      const toss = await loadTossPayments(BILLING_KEY);
      const q = new URLSearchParams();
      if (plan && !onlyCard) q.set('plan', plan);
      if (from) q.set('from', from);
      await toss.payment({ customerKey: sub.customerKey }).requestBillingAuth({
        method: 'CARD',
        successUrl: `${location.origin}/me/subscribe/success?${q}`,
        failUrl: `${location.origin}/me/pay/fail?kind=card`,
        customerEmail: user.email,
        customerName: user.name,
      });
    } catch (e) {
      console.warn(e); // 창을 닫은 경우 등
      setBusy(false);
    }
  }

  async function payWithSaved() {
    if (!plan) return;
    setBusy(true); setErr('');
    try {
      const r = await startPlan({ plan });
      await refresh();
      setDone({ plan: r.plan ?? plan, periodEnd: r.periodEnd ?? '' });
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  if (done) return <SubscribeDone plan={done.plan} periodEnd={done.periodEnd} fromWizard={from === 'wizard'} />;

  return (
    <div className="page pay">
      <Link href="/me/plan" className="pay-back">← 요금제·크레딧 관리</Link>
      <h1 className="title1">{onlyCard ? '결제 카드 바꾸기' : plan ? (upgrade ? `${plan}로 업그레이드` : `${plan} 시작하기`) : '요금제'}</h1>
      {plan && !onlyCard && (
        <p className="subtitle">
          매달 {PLANS[plan].credits}크레딧(리허설 약 {Math.floor(PLANS[plan].credits / CREDIT_PER_REHEARSAL)}회 예상) · {PLANS[plan].price}.{' '}
          {upgrade ? '지금 요금제의 남은 날만큼 빼고 결제하고, 오늘부터 한 달씩 결제돼요.' : '오늘 결제하고, 매달 같은 날 자동으로 결제돼요.'} 언제든 해지할 수 있어요.
        </p>
      )}
      {onlyCard && <p className="subtitle">다음 결제부터 새 카드로 결제돼요.</p>}

      {err ? <p className="pay-err" role="alert">{err}</p> : null}
      {blocked && <p className="pay-err">이미 {sub!.plan}를 쓰고 있어요. 낮은 요금제로는 요금제·크레딧 관리에서 다음 결제일부터 바꿀 수 있어요.</p>}

      {!sub && !err && <p className="pay-wait-line">불러오는 중…</p>}
      {sub && !blocked && !(err && !BILLING_KEY) && (
        <div className="sub-box">
          {plan && !onlyCard && (
            <div className="sub-sum">
              <span>오늘 결제</span><b>{won(amount)}</b>
              {upgrade && <small>{PLAN_PRICE[plan].toLocaleString('ko-KR')}원에서 {sub.plan} 남은 기간 {(PLAN_PRICE[plan] - amount).toLocaleString('ko-KR')}원을 뺐어요</small>}
              <small>다음 결제: {upgrade || !live ? '한 달 뒤' : sub.periodEnd ? shortDate(sub.periodEnd) : ''} · {won(PLAN_PRICE[plan])}</small>
            </div>
          )}
          {sub.card && plan && !onlyCard ? (
            <>
              <button type="button" className="btn-fill btn-block" disabled={busy} onClick={payWithSaved}>{busy ? '결제하는 중…' : `${sub.card}로 ${won(amount)} 결제하기`}</button>
              <button type="button" className="link-btn sub-other" disabled={busy} onClick={registerCard}>다른 카드로 결제</button>
            </>
          ) : (
            <button type="button" className="btn-fill btn-block" disabled={busy} onClick={registerCard}>
              {busy ? '카드 등록창 여는 중…' : onlyCard ? '새 카드 등록하기' : `카드 등록하고 ${won(amount)} 결제하기`}
            </button>
          )}
        </div>
      )}
      <p className="pay-note">지금은 테스트 결제라 실제로 돈이 나가지 않아요. 카드 정보는 토스페이먼츠가 보관하고, Talkstage 에는 가려진 카드 번호만 남아요.</p>
    </div>
  );
}
