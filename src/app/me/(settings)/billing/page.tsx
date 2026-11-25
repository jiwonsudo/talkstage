'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { PlanBadge } from '@/components/ui/PlanBadge';
import { creditTone } from '@/lib/colors';
import { fetchSubscription, listLedger, listPayments, shortDate, type LedgerRow, type PaymentRow, type Subscription } from '@/lib/data/billing';
import { useCredits } from '@/lib/data/useCredits';
import { PLANS, won } from '@/lib/plans';

// 결제·크레딧 내역: 지금 요금제와 남은 크레딧, 결제한 내역(구독·크레딧 구매), 크레딧을 쓴 내역을 한곳에서 봐요.
type Load<T> = { s: 'loading' } | { s: 'error' } | { s: 'ok'; rows: T[] };
const REASON: Record<string, string> = { rehearsal: '리허설', ai_script: 'AI 대본 코칭' };
const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Billing() {
  const { user } = useAuth();
  const credits = useCredits(user);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [pays, setPays] = useState<Load<PaymentRow>>({ s: 'loading' });
  const [uses, setUses] = useState<Load<LedgerRow>>({ s: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!user) return;
    let live = true;
    fetchSubscription().then((v) => live && setSub(v)).catch(() => live && setSub(null));
    listPayments().then((rows) => live && setPays({ s: 'ok', rows })).catch(() => live && setPays({ s: 'error' }));
    listLedger().then((rows) => live && setUses({ s: 'ok', rows })).catch(() => live && setUses({ s: 'error' }));
    return () => { live = false; };
  }, [user, tick]);
  if (!user) return null;

  const c = credits?.status === 'ok' ? credits : null;
  const bonus = c?.bonus ?? 0, month = c ? Math.max(0, c.left - bonus) : 0, all = c ? Math.max(1, c.total + bonus) : 1;
  const retry = () => { setPays({ s: 'loading' }); setUses({ s: 'loading' }); setTick((n) => n + 1); };
  const fail = <p className="bl-empty">내역을 불러오지 못했어요. <button type="button" className="link-btn" onClick={retry}>다시 불러오기</button></p>;
  const wait = <p className="bl-empty">불러오는 중…</p>;

  return (
    <>
      <h1 className="title1">결제·크레딧 내역</h1>
      <p className="subtitle">요금제 결제와 크레딧 구매, 크레딧을 쓴 기록을 볼 수 있어요. 영수증은 결제 때 토스페이먼츠가 보낸 메일에서 확인할 수 있어요.</p>

      <div className="hub-card bl-now">
        <div className="bl-cell">
          <small>지금 요금제</small>
          <b><PlanBadge plan={user.plan} /><span className="bl-price">{PLANS[user.plan].price}</span></b>
          <span className="bl-sub">
            {sub?.status === 'active' ? `다음 결제 ${sub.periodEnd ? shortDate(sub.periodEnd) : ''} · ${won(sub.price ?? 0)}${sub.card ? ` · ${sub.card}` : ''}`
              : sub?.status === 'canceled' ? `${sub.periodEnd ? shortDate(sub.periodEnd) : ''}까지 ${sub.plan} 사용, 그 뒤 Opening`
              : sub?.status === 'past_due' ? '지난 결제가 되지 않았어요. 카드를 확인해 주세요.'
              : '정기 결제 없음'}
          </span>
          <Link href="/me/plan" className="link-btn">요금제 관리</Link>
        </div>
        <div className="bl-cell">
          <small>남은 크레딧</small>
          {c ? (
            <>
              <b className="bl-num"><em style={{ color: creditTone(c.left, all) }}>{month}</em> / {c.total}{bonus > 0 && <i>&nbsp;+{bonus} 추가</i>}</b>
              <span className="bl-bar" aria-hidden="true"><i style={{ width: `${(month / all) * 100}%`, background: creditTone(c.left, all) }} />{bonus > 0 && <i className="mc-bonus" style={{ width: `${(bonus / all) * 100}%`, background: `color-mix(in oklab, ${creditTone(c.left, all)} 45%, var(--surface-2))` }} />}</span>
              <span className="bl-sub">이번 달 크레딧은 매달 1일에 다시 채워져요(이월 없음).{bonus > 0 ? ' 산 크레딧은 기한 없이 남고, 이번 달 크레딧을 다 쓴 뒤에 쓰여요.' : ''} 리허설 약 {Math.floor(c.left / c.cost)}회 더 가능(예상).</span>
            </>
          ) : credits?.status === 'error' ? <span className="bl-sub">크레딧을 불러오지 못했어요.</span> : <span className="bl-sub">확인 중…</span>}
          <Link href="/me/plan#packs" className="link-btn">크레딧 추가</Link>
        </div>
      </div>

      <h2 className="hub-sub">결제 내역</h2>
      {pays.s === 'loading' ? wait : pays.s === 'error' ? fail : pays.rows.length === 0 ? (
        <p className="bl-empty">아직 결제한 내역이 없어요.</p>
      ) : (
        <ul className="bl-list">
          {pays.rows.map((r) => (
            <li key={r.id}>
              <span><b>{r.title}</b><small>{when(r.at)}{r.method ? ` · ${r.method}` : ''}</small></span>
              <em className={r.status === 'failed' ? 'is-fail' : undefined}>{r.status === 'failed' ? '결제 실패' : won(r.amount)}</em>
            </li>
          ))}
        </ul>
      )}

      <h2 className="hub-sub">크레딧 사용 내역</h2>
      {uses.s === 'loading' ? wait : uses.s === 'error' ? fail : uses.rows.length === 0 ? (
        <p className="bl-empty">아직 크레딧을 쓴 기록이 없어요.</p>
      ) : (
        <ul className="bl-list">
          {uses.rows.map((r) => (
            <li key={r.id}>
              <span><b>{REASON[r.reason] ?? r.reason}</b><small>{when(r.at)} · {r.source === 'bonus' ? '산 크레딧에서' : '이번 달 크레딧에서'}</small></span>
              <em>−{r.amount}</em>
            </li>
          ))}
        </ul>
      )}
      <p className="wiz-note">기록을 지워도 쓴 크레딧은 돌아오지 않아요. 최근 60건까지 보여 드려요. 결제·환불 문의는 <Link href="/me/support" className="link-btn">지원 받기</Link>로 알려 주세요.</p>
    </>
  );
}
