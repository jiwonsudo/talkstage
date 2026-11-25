'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AI_COACH_TIERS } from '@/lib/coach/scriptCoach';
import { CREDIT_PER_REHEARSAL, PLANS, type PlanId } from '@/lib/plans';

// "약 N회(예상)"가 어떻게 나오는지: "예상 횟수 산정 기준 ?" 을 누르면 계산 기준을 보여 줘요(랜딩 요금표·요금제 관리·대본 코칭).
// 창은 body 로 띄워요(문단·제목 안에 둬도 HTML 이 깨지지 않게). 숫자는 plans.ts·scriptCoach.ts 값에서 계산해요 — 손으로 적지 말 것.

const SET_AI = AI_COACH_TIERS[0].credits; // 5분 발표 대본 AI 코칭 1회
const SET_RUNS = 3;                       // 같은 발표를 3번 연습
const SET = SET_AI + SET_RUNS * CREDIT_PER_REHEARSAL;
const IDS: PlanId[] = ['Opening', 'Spotlight', 'Headliner'];

export function UsageHelp({ label = '예상 횟수 산정 기준' }: { label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); d.focus(); }
  }, [open]);
  const close = () => {
    setClosing(true);
    setTimeout(() => { ref.current?.close(); setClosing(false); setOpen(false); }, 180);
  };

  return (
    <>
      <button type="button" className="help-link" aria-haspopup="dialog" onClick={() => setOpen(true)}>{label}<i aria-hidden="true">?</i></button>
      {open && createPortal(
        <dialog ref={ref} className={`cfm usage-dlg${closing ? ' closing' : ''}`} tabIndex={-1} aria-labelledby="usageTitle"
          onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="cfm-box">
            <h2 id="usageTitle">예상 횟수 산정 기준</h2>
            <p className="cfm-body">아래 횟수는 모두 <b>대략적인 예상</b>이에요. 실제 횟수는 대본 길이·AI 코칭 사용 여부에 따라 달라져요.</p>
            <h3 className="usage-h">리허설(녹화 분석)</h3>
            <ul className="usage-list">
              <li>한 번에 <b>{CREDIT_PER_REHEARSAL}크레딧</b>이에요. 녹화 길이와 관계없이 같아요(목표 시간 30분까지 고를 수 있어요).</li>
              <li>대본 점검(예상 시간·흐름·읽기 가이드)은 브라우저에서 계산해서 크레딧이 들지 않아요.</li>
              <li>20초보다 짧거나 목소리가 거의 없으면 리허설로 치지 않아 <b>빠지지 않아요</b>. 저장에 실패해도 빠지지 않아요.</li>
            </ul>
            <h3 className="usage-h">AI 대본 코칭(Spotlight부터)</h3>
            <ul className="usage-list">
              <li>대본 글자 수(공백 포함)에 따라 들어요. 받기 전에 몇 크레딧인지 먼저 보여 드려요.</li>
              <li className="usage-tiers">{AI_COACH_TIERS.map((t) => <span key={t.upTo}>{t.label}<b>{t.credits}크레딧</b></span>)}</li>
              <li>코칭이 실패하면 빠지지 않아요. 대본을 고쳐 다시 받으면 다시 들어요.</li>
              <li>지금은 테스트 기간이라 프로모션 코드로 1회 무료로 받을 수 있어요(크레딧 안 씀).</li>
            </ul>
            <h3 className="usage-h">요금제별 예상</h3>
            <table className="usage-tbl">
              <thead><tr><th /><th>월 크레딧</th><th>리허설만</th><th>발표 준비 세트</th></tr></thead>
              <tbody>
                {IDS.map((id) => (
                  <tr key={id}>
                    <th>{id}</th>
                    <td>{PLANS[id].credits}</td>
                    <td>약 {Math.floor(PLANS[id].credits / CREDIT_PER_REHEARSAL)}회</td>
                    <td>{id === 'Opening' ? '—' : `대략 ${Math.floor(PLANS[id].credits / SET)}세트`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="cfm-body">
              리허설만 = 월 크레딧 ÷ {CREDIT_PER_REHEARSAL}(나머지는 버림). 발표 준비 세트 = 5분 발표 대본 AI 코칭 1회({SET_AI}) + 같은 발표 리허설 {SET_RUNS}회({SET_RUNS * CREDIT_PER_REHEARSAL}) = {SET}크레딧.
              대본이 길면 AI 코칭이 더 들어서 세트 수가 줄어요. 월 크레딧은 매달 1일(한국 시간)에 다시 채워지고 남은 크레딧은 넘어가지 않아요. 따로 산 크레딧은 기한 없이 남아요.
            </p>
            <div className="cfm-act usage-act"><button type="button" className="btn-fill" onClick={close}>확인</button></div>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  );
}
