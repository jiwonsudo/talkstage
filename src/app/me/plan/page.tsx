'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useContact } from '@/components/contact/ContactProvider';
import { useToast } from '@/components/ui/Toast';
import { setPlan } from '@/lib/data/profile';
import { countRehearsalsSince } from '@/lib/data/rehearsals';
import { monthStart } from '@/lib/data/useCredits';
import { CREDIT_PER_REHEARSAL, PLANS, type PlanId } from '@/lib/plans';

export default function Plan() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const contact = useContact();
  const pick = useSearchParams().get('pick');
  const [used, setUsed] = useState(0);

  useEffect(() => { countRehearsalsSince(monthStart()).then((n) => setUsed(n * CREDIT_PER_REHEARSAL)).catch(() => {}); }, []);
  if (!user) return null;

  const cur = user.plan, info = PLANS[cur];
  const left = Math.max(0, info.credits - used);
  const pct = Math.min(100, Math.round((used / info.credits) * 100));

  async function change(n: PlanId) {
    try {
      await setPlan(user!.id, n);
      await refresh();
      toast(n === 'Opening' ? 'Opening(무료)으로 바꿨어요.' : `프로토타입이라 결제 없이 ${n}을 켰어요.`);
    } catch { toast('요금제를 바꾸지 못했어요.'); }
  }

  return (
    <>
      <h1 className="title1">요금제 관리</h1>
      <p className="subtitle">리허설 한 번(녹화 10분 + 대본 점검)에 {CREDIT_PER_REHEARSAL}크레딧을 써요.</p>
      <div className="hub-card hub-plan">
        <div className="hp-top"><span><small>지금 요금제</small><b>{cur}</b></span><em>{info.price}</em></div>
        <div className="hp-bar"><i style={{ width: `${pct}%` }} /></div>
        <p className="hp-meta"><b>{left}크레딧 남음</b><span>이번 달 {used} / {info.credits} 사용 · 리허설 약 {Math.floor(left / CREDIT_PER_REHEARSAL)}회 더 가능</span></p>
      </div>
      <ul className="hub-plans">
        {(Object.keys(PLANS) as PlanId[]).map((n) => (
          <li key={n} className={`${n === cur ? 'is-cur' : ''}${n === pick && n !== cur ? ' is-pick' : ''}`}>
            <span><b>{n}</b><small>{PLANS[n].who} · 월 {PLANS[n].credits}크레딧</small></span>
            <em>{PLANS[n].price}</em>
            {n === cur ? <span className="hp-now">사용 중</span> : (
              <button type="button" className={n === pick ? 'btn-fill btn-sm' : 'btn-plain btn-sm'} onClick={() => change(n)}>{PLANS[n].credits > info.credits ? '올리기' : '내리기'}</button>
            )}
          </li>
        ))}
      </ul>
      <p className="wiz-note">정식 출시 전이라 결제 없이 바뀌어요. 단체 요금제는 <button type="button" className="link-btn" onClick={() => contact('biz')}>도입 문의</button>로 알려 주세요.</p>
    </>
  );
}
