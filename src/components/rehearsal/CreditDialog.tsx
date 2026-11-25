'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/lib/nav';
import { PACKS, packList, packSave, perCredit, won, type PackId } from '@/lib/plans';

// 창에는 작은·중간·가장 큰 묶음만(전부는 크레딧 관리에서)
const SHOWN: PackId[] = ['pack48', 'pack192', 'pack480'];

/**
 * 녹화로 넘어가기 전에 크레딧이 모자라거나(리허설 1번도 못 함) 빠듯하면(이 발표를 몇 번 더 연습하기엔 부족) 띄워요.
 * 크레딧 추가 구매로 이어 주고, 빠듯한 경우에는 그대로 녹화할 수도 있어요. 횟수는 모두 대략적인 예상이에요.
 */
export function CreditDialog({ open, left, cost, need, runs, onContinue, onClose }: {
  open: boolean; left: number; cost: number; /** 이 발표를 더 연습하는 데 필요한 크레딧(예상) */ need: number; runs: number;
  onContinue: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) { d.showModal(); d.focus(); }
  }, [open]);
  const shut = (then?: () => void) => {
    setClosing(true);
    setTimeout(() => { ref.current?.close(); setClosing(false); onClose(); then?.(); }, 180);
  };
  if (!open) return null;
  const short = left < cost;
  const can = Math.floor(left / cost);
  return (
    <dialog ref={ref} className={`cfm credit-dlg${closing ? ' closing' : ''}`} tabIndex={-1} aria-labelledby="crTitle"
      onCancel={(e) => { e.preventDefault(); shut(); }} onClick={(e) => { if (e.target === e.currentTarget) shut(); }}>
      <div className="cfm-box">
        <h2 id="crTitle">{short ? '크레딧이 모자라요' : '크레딧이 조금 빠듯해요'}</h2>
        <p className="cfm-body">
          {short
            ? <>리허설 한 번에 {cost}크레딧이 들어요. 지금 남은 크레딧은 <b>{left}</b>이에요.</>
            : <>지금 <b>{left}크레딧</b>이면 리허설을 대략 {can}번 더 할 수 있어요. 이 발표를 {runs}번 연습하려면 대략 <b>{need}크레딧</b>이 필요해요(예상).</>}
          {' '}크레딧을 추가하면 기한 없이 남고, 이번 달 크레딧을 다 쓴 뒤에 쓰여요.
        </p>
        <ul className="cr-packs">
          {SHOWN.map((id) => (
            <li key={id}>
              <button type="button" onClick={() => shut(() => router.push(`/me/pay?product=${id}`))}>
                <span><b>크레딧 {PACKS[id].credits}</b><small>1크레딧 약 {perCredit(PACKS[id].amount, PACKS[id].credits)}원 · 기한 없음</small></span><span className="pk-price">{packSave(id) > 0 && <><s>{won(packList(id))}</s><i className="pk-off">{packSave(id)}%</i></>}<em>{won(PACKS[id].amount)}</em></span>
              </button>
            </li>
          ))}
        </ul>
        <div className="cfm-act">
          {short
            ? <button type="button" className="btn-plain" onClick={() => shut()}>나중에</button>
            : <button type="button" className="btn-plain" onClick={() => shut(onContinue)}>그대로 녹화</button>}
          <button type="button" className="btn-fill" onClick={() => shut(() => router.push('/me/plan#packs'))}>다른 묶음 보기</button>
        </div>
      </div>
    </dialog>
  );
}
