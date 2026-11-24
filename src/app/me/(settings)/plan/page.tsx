'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useContact } from '@/components/contact/ContactProvider';
import { useToast } from '@/components/ui/Toast';
import { cancelPlan, fetchSubscription, resumePlan, schedulePlan, shortDate, type Subscription } from '@/lib/data/billing';
import { useCredits } from '@/lib/data/useCredits';
import Link from 'next/link';
import { CREDIT_PER_REHEARSAL, PACKS, PLANS, won, type PackId, type PlanId } from '@/lib/plans';

export default function Plan() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const contact = useContact();
  const sp = useSearchParams();
  const pick = sp.get('pick'), fromWizard = sp.get('from') === 'wizard';
  const credits = useCredits(user);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState(false);
  const loadSub = useCallback(() => fetchSubscription().then(setSub).catch(() => setSub(null)), []);
  useEffect(() => { if (user) loadSub(); }, [user, loadSub]);
  if (!user) return null;

  const cur = user.plan, info = PLANS[cur];
  const ids = Object.keys(PLANS) as PlanId[];
  // 추천: 주소로 고른 요금제(지금보다 위일 때), 아니면 바로 한 단계 위
  const up = ids.filter((n) => PLANS[n].credits > info.credits);
  const rec = up.find((n) => n === pick) ?? up[0] ?? null;
  const c = credits?.status === 'ok' ? credits : null;
  const pct = c ? Math.min(100, Math.round((c.used / c.total) * 100)) : 0;

  const end = sub?.periodEnd ? shortDate(sub.periodEnd) : '';
  const upHref = (n: PlanId) => `/me/subscribe?plan=${n}${fromWizard ? '&from=wizard' : ''}`;

  // 해지·낮은 요금제 예약·해지 취소. 올리는 건 결제 화면(/me/subscribe)에서 해요.
  async function act(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try { await fn(); await Promise.all([loadSub(), refresh()]); toast(ok); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  }
  const cancel = () => {
    if (!confirm(end ? `해지할까요? ${end}까지는 ${cur}를 그대로 쓰고, 그 뒤 Opening(무료)으로 바뀌어요.` : 'Opening(무료)으로 바꿀까요?')) return;
    act(cancelPlan, end ? `해지를 예약했어요. ${end}까지 ${cur}를 쓸 수 있어요.` : 'Opening(무료)으로 바꿨어요.');
  };

  return (
    <>
      <h1 className="title1">요금제 관리</h1>
      <p className="subtitle">리허설 한 번(녹화 10분 + 대본 점검)에 {CREDIT_PER_REHEARSAL}크레딧을 써요. 기록을 지워도 쓴 크레딧은 돌아오지 않아요.</p>
      <div className="hub-card hub-plan">
        <div className="hp-top"><span><small>지금 요금제</small><b>{cur}</b></span><em>{info.price}</em></div>
        <div className="hp-bar"><i style={{ width: `${pct}%` }} /></div>
        {c ? (
          <p className="hp-meta"><b>{c.left}크레딧 남음</b><span>이번 달 {c.used} / {c.total} 사용{c.bonus ? ` · 산 크레딧 ${c.bonus}` : ''} · 리허설 {Math.floor(c.left / c.cost)}회 더 가능</span></p>
        ) : credits?.status === 'error' ? (
          <p className="hp-meta"><b>크레딧을 불러오지 못했어요</b><button type="button" className="link-btn" onClick={credits.retry}>다시 불러오기</button></p>
        ) : (
          <p className="hp-meta"><b>크레딧 확인 중…</b></p>
        )}
        {sub?.status === 'active' && (
          <p className="hp-sub">
            <span>다음 결제 {end} · {won(sub.price ?? 0)}{sub.nextPlan ? ` · ${sub.nextPlan}로 바뀜` : ''}{sub.card ? ` · ${sub.card}` : ''}</span>
            <Link href="/me/subscribe?card=1" className="link-btn">카드 바꾸기</Link>
          </p>
        )}
        {sub?.status === 'canceled' && (
          <p className="hp-sub"><span>해지 예약됨 · {end}까지 {sub.plan} 사용, 그 뒤 Opening</span><button type="button" className="link-btn" disabled={busy} onClick={() => act(resumePlan, '해지를 취소했어요.')}>해지 취소</button></p>
        )}
        {sub?.status === 'past_due' && (
          <p className="hp-sub is-warn"><span>지난 결제가 되지 않았어요. 카드를 확인해 주세요(하루에 한 번 다시 시도해요).</span><Link href="/me/subscribe?card=1" className="link-btn">카드 바꾸기</Link></p>
        )}
      </div>
      <ul className="hub-plans">
        {ids.map((n) => (
          <li key={n} className={n === cur ? 'is-cur' : n === rec ? 'is-rec' : undefined}>
            <span>
              <b>{n}{n === rec && <i className="hp-rec">추천</i>}</b>
              <small>{PLANS[n].who} · 월 {PLANS[n].credits}크레딧 · 리허설 {Math.floor(PLANS[n].credits / CREDIT_PER_REHEARSAL)}회</small>
            </span>
            <em>{PLANS[n].price}</em>
            {n === cur ? <span className="hp-now">사용 중</span>
              : PLANS[n].credits > info.credits ? <Link href={upHref(n)} className={n === rec ? 'btn-fill btn-sm' : 'btn-plain btn-sm'}>업그레이드</Link>
              : n === 'Opening' ? (sub?.status === 'canceled' ? <span className="hp-now">{end}부터</span>
                : <button type="button" className="btn-plain btn-sm" disabled={busy} onClick={cancel}>해지</button>)
              : sub?.nextPlan === n ? <button type="button" className="btn-plain btn-sm" disabled={busy} onClick={() => act(() => schedulePlan(cur), '변경 예약을 취소했어요.')}>예약 취소</button>
              : <button type="button" className="btn-plain btn-sm" disabled={busy || !sub?.status} onClick={() => act(() => schedulePlan(n), `${end}부터 ${n}로 바뀌어요.`)}>다운그레이드</button>}
          </li>
        ))}
      </ul>
      <h2 className="hub-sub">리허설 회차 추가</h2>
      <p className="hub-hint hub-sub-hint">요금제는 그대로 두고 필요한 만큼만 사요. 산 회차는 매달 초기화되지 않아요.</p>
      <ul className="hub-plans">
        {(Object.keys(PACKS) as PackId[]).map((id) => (
          <li key={id}>
            <span><b>리허설 {PACKS[id].times}회</b><small>{PACKS[id].credits}크레딧 · 기한 없음 · 간편결제 가능</small></span>
            <em>{won(PACKS[id].amount)}</em>
            <Link href={`/me/pay?product=${id}`} className="btn-fill btn-sm">구매</Link>
          </li>
        ))}
      </ul>
      <p className="wiz-note">지금은 테스트 결제라 실제로 돈이 나가지 않아요. 해지해도 결제한 기간까지는 그대로 써요. 단체 요금제는 <button type="button" className="link-btn" onClick={() => contact('biz')}>도입 문의</button>로 알려 주세요.</p>
    </>
  );
}
