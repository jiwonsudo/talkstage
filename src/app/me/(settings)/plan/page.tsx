'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useContact } from '@/components/contact/ContactProvider';
import { useToast } from '@/components/ui/Toast';
import { setPlan } from '@/lib/data/profile';
import { useCredits } from '@/lib/data/useCredits';
import { CREDIT_PER_REHEARSAL, PLANS, type PlanId } from '@/lib/plans';

export default function Plan() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const contact = useContact();
  const router = useRouter();
  const sp = useSearchParams();
  const pick = sp.get('pick'), fromWizard = sp.get('from') === 'wizard';
  const credits = useCredits(user);
  if (!user) return null;

  const cur = user.plan, info = PLANS[cur];
  const ids = Object.keys(PLANS) as PlanId[];
  // 추천: 주소로 고른 요금제(지금보다 위일 때), 아니면 바로 한 단계 위
  const up = ids.filter((n) => PLANS[n].credits > info.credits);
  const rec = up.find((n) => n === pick) ?? up[0] ?? null;
  const c = credits?.status === 'ok' ? credits : null;
  const pct = c ? Math.min(100, Math.round((c.used / c.total) * 100)) : 0;

  async function change(n: PlanId) {
    try {
      await setPlan(user!.id, n);
      await refresh();
      toast(n === 'Opening' ? 'Opening(무료)으로 바꿨어요.' : `프로토타입이라 결제 없이 ${n}을 켰어요.`);
      if (fromWizard && n !== 'Opening') router.back(); // 직접 입력하려다 왔으면 설정 화면으로 돌아가요
    } catch { toast('요금제를 바꾸지 못했어요.'); }
  }

  return (
    <>
      <h1 className="title1">요금제 관리</h1>
      <p className="subtitle">리허설 한 번(녹화 10분 + 대본 점검)에 {CREDIT_PER_REHEARSAL}크레딧을 써요. 기록을 지워도 쓴 크레딧은 돌아오지 않아요.</p>
      <div className="hub-card hub-plan">
        <div className="hp-top"><span><small>지금 요금제</small><b>{cur}</b></span><em>{info.price}</em></div>
        <div className="hp-bar"><i style={{ width: `${pct}%` }} /></div>
        {c ? (
          <p className="hp-meta"><b>{c.left}크레딧 남음</b><span>이번 달 {c.used} / {c.total} 사용 · 리허설 {Math.floor(c.left / c.cost)}회 더 가능</span></p>
        ) : credits?.status === 'error' ? (
          <p className="hp-meta"><b>크레딧을 불러오지 못했어요</b><button type="button" className="link-btn" onClick={credits.retry}>다시 불러오기</button></p>
        ) : (
          <p className="hp-meta"><b>크레딧 확인 중…</b></p>
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
            {n === cur ? <span className="hp-now">사용 중</span> : (
              <button type="button" className={n === rec ? 'btn-fill btn-sm' : 'btn-plain btn-sm'} onClick={() => change(n)}>{PLANS[n].credits > info.credits ? '업그레이드' : '다운그레이드'}</button>
            )}
          </li>
        ))}
      </ul>
      <p className="wiz-note">정식 출시 전이라 결제 없이 바뀌어요. 단체 요금제는 <button type="button" className="link-btn" onClick={() => contact('biz')}>도입 문의</button>로 알려 주세요.</p>
    </>
  );
}
