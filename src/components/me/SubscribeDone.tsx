'use client';
import Link from 'next/link';
import { shortDate } from '@/lib/data/billing';
import { CREDIT_PER_REHEARSAL, PLANS, type PlanId } from '@/lib/plans';

/** 요금제 결제가 끝난 화면. 마법사에서 왔으면(직접 입력 잠금) 설정 화면으로 돌려보내요. */
export function SubscribeDone({ plan, periodEnd, fromWizard }: { plan: PlanId; periodEnd: string; fromWizard: boolean }) {
  return (
    <div className="page pay">
      <h1 className="title1">{plan}를 시작했어요</h1>
      <p className="subtitle">
        이번 달부터 {PLANS[plan].credits}크레딧(리허설 약 {Math.floor(PLANS[plan].credits / CREDIT_PER_REHEARSAL)}회 예상)을 쓸 수 있어요.
        {periodEnd ? ` 다음 결제는 ${shortDate(periodEnd)}이에요.` : ''}
      </p>
      <div className="pay-actions">
        {fromWizard
          ? <Link href="/rehearsal/new?resume=1" className="btn-fill">리허설 설정으로 돌아가기</Link>
          : <Link href="/rehearsal/new" className="btn-fill">새 리허설 시작</Link>}
        <Link href="/me/plan" className="btn-plain">요금제 관리</Link>
      </div>
    </div>
  );
}
