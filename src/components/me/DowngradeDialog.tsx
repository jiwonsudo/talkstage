'use client';
import { useEffect, useRef, useState } from 'react';
import { DOWN_REASONS } from '@/lib/data/billing';

const MIN = 10;
const MAX = 3;

/**
 * 요금제를 내릴 때: 무엇이 바뀌는지 알려 주고 사유를 받아요. 사유는 1~3개, 고른 순서가 우선순위예요(1이 가장 큰 이유).
 * '직접 작성'을 고르면 10자 이상 적어야 해요. 빠진 칸은 빨간 윤곽으로 바로 보여 줘요.
 */
export function DowngradeDialog({ open, title, body, okLabel, onDone }: {
  open: boolean; title: string; body: string; okLabel: string;
  onDone: (r: { reasons: string[]; detail: string } | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [full, setFull] = useState(0); // 4번째를 누르면 잠깐 흔들어 알려요
  const [detail, setDetail] = useState('');
  const [tried, setTried] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) { setReasons([]); setDetail(''); setTried(false); d.showModal(); d.focus(); }
  }, [open]);
  const shut = (r: { reasons: string[]; detail: string } | null) => {
    setClosing(true);
    setTimeout(() => { ref.current?.close(); setClosing(false); onDone(r); }, 180);
  };
  const other = reasons.includes('other');
  const reasonErr = reasons.length ? '' : '사유를 하나 이상 골라 주세요.';
  const detailErr = other && detail.trim().length < MIN ? `${MIN}자 이상 적어 주세요(지금 ${detail.trim().length}자).` : '';
  const submit = () => {
    if (reasonErr || detailErr) { setTried(true); if (detailErr) textRef.current?.focus(); return; }
    shut({ reasons, detail: other ? detail.trim() : '' });
  };
  if (!open) return null;
  return (
    <dialog ref={ref} className={`cfm down-dlg${closing ? ' closing' : ''}`} tabIndex={-1} aria-labelledby="downTitle"
      onCancel={(e) => { e.preventDefault(); shut(null); }} onClick={(e) => { if (e.target === e.currentTarget) shut(null); }}>
      <form className="cfm-box" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <h2 id="downTitle">{title}</h2>
        <p className="cfm-body">{body}</p>
        <fieldset className={`down-reasons${tried && reasonErr ? ' is-bad' : ''}`}>
          <legend>요금제를 내리는 이유 <em className="req">필수</em> <small>최대 {MAX}개 · 고른 순서가 우선순위예요</small></legend>
          {DOWN_REASONS.map((r) => {
            const rank = reasons.indexOf(r.id), on = rank >= 0;
            const off = !on && reasons.length >= MAX;
            return (
              <label key={r.id} className={`${on ? 'is-on' : ''}${off ? ' is-off' : ''}`}>
                <input type="checkbox" value={r.id} checked={on} aria-disabled={off || undefined}
                  onChange={() => {
                    if (on) { setReasons((x) => x.filter((v) => v !== r.id)); return; }
                    if (off) { setFull((n) => n + 1); return; }
                    setReasons((x) => [...x, r.id]);
                    if (r.id === 'other') setTimeout(() => textRef.current?.focus(), 30);
                  }} />
                <span className="dr-num" aria-hidden="true">{on ? rank + 1 : ''}</span>
                <span>{r.label}</span>
              </label>
            );
          })}
        </fieldset>
        {tried && reasonErr && <p className="field-err" role="alert">{reasonErr}</p>}
        {full > 0 && reasons.length >= MAX && <p key={full} className="field-err dr-full" role="status">최대 {MAX}개까지 고를 수 있어요. 하나를 빼고 골라 주세요.</p>}
        {other && (
          <label className={`field${tried && detailErr ? ' is-bad' : ''}`}>
            <span>직접 작성 <small>({MIN}자 이상)</small></span>
            <textarea ref={textRef} rows={3} maxLength={500} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="어떤 점이 아쉬웠는지 알려 주시면 고쳐 볼게요." aria-invalid={(tried && !!detailErr) || undefined} />
            <small className="count-line">{detail.trim().length}/{MIN}자 이상</small>
            {tried && detailErr && <em className="field-err" role="alert">{detailErr}</em>}
          </label>
        )}
        <div className="cfm-act">
          <button type="button" className="btn-plain" onClick={() => shut(null)}>계속 쓰기</button>
          <button type="submit" className="btn-fill cfm-danger">{okLabel}</button>
        </div>
      </form>
    </dialog>
  );
}
