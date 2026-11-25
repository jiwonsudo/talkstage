'use client';
import { useEffect, useRef, useState } from 'react';
import { DOWN_REASONS } from '@/lib/data/billing';

const MIN = 10;

/**
 * 요금제를 내릴 때: 무엇이 바뀌는지 알려 주고 사유를 받아요. 사유는 꼭 하나 골라야 하고,
 * '직접 작성'이면 10자 이상 적어야 해요. 빠진 칸은 빨간 윤곽으로 바로 보여 줘요.
 */
export function DowngradeDialog({ open, title, body, okLabel, onDone }: {
  open: boolean; title: string; body: string; okLabel: string;
  onDone: (r: { reason: string; detail: string } | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [tried, setTried] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) { setReason(''); setDetail(''); setTried(false); d.showModal(); d.focus(); }
  }, [open]);
  const shut = (r: { reason: string; detail: string } | null) => {
    setClosing(true);
    setTimeout(() => { ref.current?.close(); setClosing(false); onDone(r); }, 180);
  };
  const other = reason === 'other';
  const reasonErr = reason ? '' : '사유를 하나 골라 주세요.';
  const detailErr = other && detail.trim().length < MIN ? `${MIN}자 이상 적어 주세요(지금 ${detail.trim().length}자).` : '';
  const submit = () => {
    if (reasonErr || detailErr) { setTried(true); if (detailErr) textRef.current?.focus(); return; }
    shut({ reason, detail: other ? detail.trim() : '' });
  };
  if (!open) return null;
  return (
    <dialog ref={ref} className={`cfm down-dlg${closing ? ' closing' : ''}`} tabIndex={-1} aria-labelledby="downTitle"
      onCancel={(e) => { e.preventDefault(); shut(null); }} onClick={(e) => { if (e.target === e.currentTarget) shut(null); }}>
      <form className="cfm-box" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <h2 id="downTitle">{title}</h2>
        <p className="cfm-body">{body}</p>
        <fieldset className={`down-reasons${tried && reasonErr ? ' is-bad' : ''}`}>
          <legend>요금제를 내리는 이유 <em className="req">필수</em></legend>
          {DOWN_REASONS.map((r) => (
            <label key={r.id} className={reason === r.id ? 'is-on' : ''}>
              <input type="radio" name="reason" value={r.id} checked={reason === r.id}
                onChange={() => { setReason(r.id); if (r.id === 'other') setTimeout(() => textRef.current?.focus(), 30); }} />
              <span>{r.label}</span>
            </label>
          ))}
        </fieldset>
        {tried && reasonErr && <p className="field-err" role="alert">{reasonErr}</p>}
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
