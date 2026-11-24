'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/** 결제를 취소했거나 실패해서 토스 결제창에서 돌아오는 곳. 돈은 나가지 않았어요. */
export default function PayFail() {
  const sp = useSearchParams();
  const canceled = sp.get('code') === 'PAY_PROCESS_CANCELED';
  return (
    <div className="page pay">
      <h1 className="title1">{canceled ? '결제를 취소했어요' : '결제가 되지 않았어요'}</h1>
      <p className="subtitle">{canceled ? '돈은 나가지 않았어요.' : `${sp.get('message') ?? '알 수 없는 이유로 실패했어요.'} 돈은 나가지 않았어요.`}</p>
      <div className="pay-actions"><Link href="/me/plan" className="btn-plain">요금제 관리로</Link></div>
    </div>
  );
}
