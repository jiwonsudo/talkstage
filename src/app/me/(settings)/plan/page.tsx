'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useContact } from '@/components/contact/ContactProvider';
import { useToast } from '@/components/ui/Toast';
import { cancelPlan, fetchSubscription, resumePlan, savePlanChange, schedulePlan, shortDate, type Subscription } from '@/lib/data/billing';
import { DowngradeDialog } from '@/components/me/DowngradeDialog';
import { PlanBadge } from '@/components/ui/PlanBadge';
import { creditTone } from '@/lib/colors';
import { useCredits } from '@/lib/data/useCredits';
import Link from 'next/link';
import { CREDIT_PER_REHEARSAL, CREDIT_PER_TALK, PACKS, PACK_IDS, PLAN_PERKS, PLANS, planUsage, packList, packSave, perCredit, won, type PlanId } from '@/lib/plans';
import { UsageHelp } from '@/components/ui/UsageHelp';
import { CreditExamples } from '@/components/ui/CreditExamples';

export default function Plan() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const contact = useContact();
  const sp = useSearchParams();
  const pick = sp.get('pick'), fromWizard = sp.get('from') === 'wizard';
  const credits = useCredits(user);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState(false);
  // 내리기(해지 포함)는 모두 "다운그레이드"로, 사유를 받은 뒤 진행해요.
  const [down, setDown] = useState<PlanId | null>(null);
  const loadSub = useCallback(() => fetchSubscription().then(setSub).catch(() => setSub(null)), []);
  useEffect(() => { if (user) loadSub(); }, [user, loadSub]);
  if (!user) return null;

  const cur = user.plan, info = PLANS[cur];
  const ids = Object.keys(PLANS) as PlanId[];
  // 추천: 주소로 고른 요금제(지금보다 위일 때), 아니면 바로 한 단계 위
  const up = ids.filter((n) => PLANS[n].credits > info.credits);
  const rec = up.find((n) => n === pick) ?? up[0] ?? null;
  const c = credits?.status === 'ok' ? credits : null;

  const end = sub?.periodEnd ? shortDate(sub.periodEnd) : '';
  const upHref = (n: PlanId) => `/me/subscribe?plan=${n}${fromWizard ? '&from=wizard' : ''}`;

  // 해지·낮은 요금제 예약·해지 취소. 올리는 건 결제 화면(/me/subscribe)에서 해요.
  async function act(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try { await fn(); await Promise.all([loadSub(), refresh()]); toast(ok); }
    catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  }
  const downInfo = (n: PlanId) => n === 'Opening'
    ? end
      ? { title: 'Opening(무료)으로 다운그레이드할까요?', body: `${end}까지는 ${cur}를 그대로 쓰고, 그 뒤 Opening으로 바뀌어요. 그전에는 언제든 취소할 수 있어요.`, ok: '다운그레이드', done: `다운그레이드를 예약했어요. ${end}까지 ${cur}를 쓸 수 있어요.`, run: cancelPlan }
      : { title: 'Opening(무료)으로 다운그레이드할까요?', body: '지금 바로 Opening으로 바뀌어요.', ok: '다운그레이드', done: 'Opening(무료)으로 바꿨어요.', run: cancelPlan }
    : { title: `${n}로 다운그레이드할까요?`, body: `${end}까지는 ${cur}를 그대로 쓰고, 다음 결제일부터 ${n}(${PLANS[n].price})로 바뀌어요.`, ok: '다운그레이드', done: `${end}부터 ${n}로 바뀌어요.`, run: () => schedulePlan(n) };
  const onDown = (r: { reasons: string[]; detail: string } | null) => {
    const n = down;
    setDown(null);
    if (!r || !n) return;
    const d = downInfo(n);
    savePlanChange({ from: cur, to: n, reasons: r.reasons, detail: r.detail }).catch(() => { /* 사유 저장이 안 돼도 요금제 변경은 진행해요 */ });
    act(d.run, d.done);
  };
  const left = c ? c.left : 0, bonus = c?.bonus ?? 0, month = Math.max(0, left - bonus), all = c ? Math.max(1, c.total + bonus) : 1;

  return (
    <>
      <h1 className="title1">요금제·크레딧 관리</h1>
      <p className="subtitle">리허설 한 번에 {CREDIT_PER_REHEARSAL}크레딧, AI 대본 코칭은 대본 길이에 따라 3~9크레딧(Spotlight부터)을 써요. 발표 하나를 준비하는 데(AI 코칭 1번 + 3~4번 연습) 대략 {CREDIT_PER_TALK}크레딧이에요. 기록을 지워도 쓴 크레딧은 돌아오지 않아요.</p>
      <UsageHelp />
      <div className="hub-card hub-plan">
        <div className="hp-top"><span><small>지금 요금제</small><b><PlanBadge plan={cur} /></b></span><em>{info.price}</em></div>
        <div className="hp-bar db-split" aria-hidden="true"><i style={{ width: `${c ? (month / all) * 100 : 0}%`, background: c ? creditTone(left, all) : undefined }} />{bonus > 0 && <i style={{ width: `${(bonus / all) * 100}%`, background: `color-mix(in oklab, ${creditTone(left, all)} 45%, var(--surface-2))` }} />}</div>
        {c ? (
          <p className="hp-meta"><b>남은 크레딧 <span style={{ color: creditTone(left, all) }}>{month}</span> / {c.total}{bonus > 0 && <em className="db-bonus">+{bonus} 추가</em>}</b><span>리허설 약 {Math.floor(c.left / c.cost)}회 더 가능(예상)</span></p>
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
          <p className="hp-sub"><span>다운그레이드 예약됨 · {end}까지 {sub.plan} 사용, 그 뒤 Opening</span><button type="button" className="link-btn" disabled={busy} onClick={() => act(resumePlan, '다운그레이드 예약을 취소했어요.')}>예약 취소</button></p>
        )}
        {sub?.status === 'past_due' && (
          <p className="hp-sub is-warn"><span>지난 결제가 되지 않았어요. 카드를 확인해 주세요(하루에 한 번 다시 시도해요).</span><Link href="/me/subscribe?card=1" className="link-btn">카드 바꾸기</Link></p>
        )}
        <Link href="/me/billing" className="link-btn hp-hist">결제 관리(카드·영수증)</Link>
      </div>
      <ul className="hub-plans">
        {ids.map((n) => {
          const lower = PLANS[n].credits < info.credits;
          const scheduled = (n === 'Opening' && sub?.status === 'canceled') || (sub?.nextPlan === n);
          return (
            <li key={n} className={n === cur ? 'is-cur' : n === rec ? 'is-rec' : undefined}>
              <span>
                <b>{n}{n === rec && <i className="hp-rec">추천</i>}</b>
                <small>{PLANS[n].who} · 월 {PLANS[n].credits}크레딧 · {planUsage(n)}(예상)</small>
                {PLAN_PERKS[n].length > 0 && <span className="perks">{PLAN_PERKS[n].map((k) => <i key={k}>{k}</i>)}</span>}
              </span>
              <em>{PLANS[n].price}</em>
              {n === cur ? <span className="hp-now">사용 중</span>
                : !lower ? <Link href={upHref(n)} className={n === rec ? 'btn-fill btn-sm' : 'btn-plain btn-sm'}>업그레이드</Link>
                : scheduled ? (
                  n === 'Opening'
                    ? <button type="button" className="btn-plain btn-sm" disabled={busy} onClick={() => act(resumePlan, '다운그레이드 예약을 취소했어요.')}>{end}부터 · 취소</button>
                    : <button type="button" className="btn-plain btn-sm" disabled={busy} onClick={() => act(() => schedulePlan(cur), '다운그레이드 예약을 취소했어요.')}>{end}부터 · 취소</button>
                )
                : <button type="button" className="btn-plain btn-sm" disabled={busy || (n !== 'Opening' && !sub?.status)} onClick={() => setDown(n)}>다운그레이드</button>}
            </li>
          );
        })}
      </ul>
      <h2 className="hub-sub" id="packs">크레딧 추가 구매</h2>
      <p className="hub-hint hub-sub-hint">요금제는 그대로 두고 필요한 만큼만 사요. 산 크레딧은 기한 없이 남고, 이번 달 크레딧을 다 쓴 뒤에 쓰여요.</p>
      <CreditExamples />
      <ul className="hub-plans">
        {PACK_IDS.map((id) => (
          <li key={id}>
            <span><b>크레딧 {PACKS[id].credits}</b><small>1크레딧 약 {perCredit(PACKS[id].amount, PACKS[id].credits)}원 · 기한 없음</small></span>
            <span className="pk-price">{packSave(id) > 0 && <><s>{won(packList(id))}</s><i className="pk-off">{packSave(id)}% 할인</i></>}<em>{won(PACKS[id].amount)}</em></span>
            <Link href={`/me/pay?product=${id}`} className="btn-plain btn-sm">구매</Link>
          </li>
        ))}
      </ul>
      <p className="wiz-note">지금은 테스트 결제라 실제로 돈이 나가지 않아요. 다운그레이드해도 결제한 기간까지는 그대로 써요. 단체 요금제는 <button type="button" className="link-btn" onClick={() => contact('biz')}>도입 문의</button>로 알려 주세요.</p>
      {down && (() => { const d = downInfo(down); return <DowngradeDialog open title={d.title} body={d.body} okLabel={d.ok} onDone={onDown} />; })()}
    </>
  );
}
