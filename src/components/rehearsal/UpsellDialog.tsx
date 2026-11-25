'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/lib/nav';
import { PLANS, approxRuns, approxTalks } from '@/lib/plans';

/**
 * 무료 요금제가 녹화로 넘어갈 때 한 번 거치는 요금제 안내. 지어낸 숫자 없이 실제로 더 받는 것만 적어요.
 * "무료로 계속하기"를 누르면 그대로 녹화로 가요.
 */
export function UpsellDialog({ open, onContinue, onClose }: { open: boolean; onContinue: () => void; onClose: () => void }) {
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
  const sp = PLANS.Spotlight, op = PLANS.Opening;
  return (
    <dialog ref={ref} className={`cfm upsell${closing ? ' closing' : ''}`} tabIndex={-1} aria-labelledby="upTitle"
      onCancel={(e) => { e.preventDefault(); shut(); }} onClick={(e) => { if (e.target === e.currentTarget) shut(); }}>
      <div className="cfm-box">
        <p className="up-kicker">Spotlight · {sp.price}</p>
        <h2 id="upTitle">요금제를 올리면 이번 발표를 더 깊게 코칭해요</h2>
        <ul className="up-list">
          <li><b>AI 대본 코칭</b><span>AI가 대본을 먼저 읽고 발표 목적·핵심 메시지를 파악한 뒤, 이 상황에 맞게 고칠 문장을 고쳐 쓰고 문장마다 쉬기·강조·가리키기·시선까지 정해 줘요.</span></li>
          <li><b>회차별 비교 통계</b><span>같은 발표를 여러 번 연습하면 지난 회차와 점수·약점을 나란히 비교해서, 무엇이 나아졌고 무엇이 남았는지 숫자로 보여 줘요.</span></li>
          <li><b>크레딧 약 {Math.round((sp.credits / op.credits) * 10) / 10}배</b><span>월 {sp.credits}크레딧이면 AI 코칭 1번 + 3~4번 연습으로 발표를 대략 {approxTalks(sp.credits)}개 준비할 수 있어요(예상). 무료는 AI 코칭 없이 리허설 대략 {approxRuns(op.credits)}번이에요.</span></li>
          <li><b>기록 전체 보관 · 하이라이트 클립 저장</b><span>지난 리포트를 지우지 않고 모아 두고, 잘한 장면을 클립으로 남겨요.</span></li>
        </ul>
        <div className="cfm-act">
          <button type="button" className="btn-plain" onClick={() => shut(onContinue)}>무료로 계속하기</button>
          <button type="button" className="btn-fill" onClick={() => shut(() => router.push('/me/plan?pick=Spotlight&from=wizard'))}>요금제 보기</button>
        </div>
      </div>
    </dialog>
  );
}
