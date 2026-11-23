'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

type Kind = 'biz' | 'edu';
const Ctx = createContext<(k?: Kind) => void>(() => {});
export const useContact = () => useContext(Ctx);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 도입 문의 창. 프로토타입이라 이 브라우저에만 저장해요. */
export function ContactProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<Kind>('biz');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const open = useCallback((k: Kind = 'biz') => {
    formRef.current?.reset(); setErr(''); setDone(false); setKind(k);
    ref.current?.showModal();
    setTimeout(() => (formRef.current?.elements.namedItem('org') as HTMLInputElement | null)?.focus(), 60);
  }, []);
  const close = () => ref.current?.close();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (n: string) => String(f.get(n) ?? '').trim();
    const msg = !v('org') ? '소속을 입력해 주세요.' : !v('person') ? '이름을 입력해 주세요.' : !EMAIL.test(v('mail')) ? '이메일 형식을 확인해 주세요.' : '';
    if (msg) { setErr(msg); return; }
    try {
      const leads = JSON.parse(localStorage.getItem('rc-leads-v1') ?? '[]');
      leads.push({ kind, org: v('org'), person: v('person'), size: v('size'), mail: v('mail'), note: v('note'), at: Date.now() });
      localStorage.setItem('rc-leads-v1', JSON.stringify(leads));
    } catch { /* 저장 공간을 못 쓰면 접수 화면만 보여 줘요 */ }
    setDone(true);
  }

  const edu = kind === 'edu';
  return (
    <Ctx.Provider value={open}>
      {children}
      <dialog ref={ref} className="auth contact" aria-labelledby="ctTitle" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <form ref={formRef} onSubmit={submit} noValidate>
          <button type="button" className="dlg-x" aria-label="닫기" onClick={close}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
          <div className="ct-body" hidden={done}>
            <h2 id="ctTitle">도입 문의</h2>
            <p className="auth-sub">팀 규모와 쓰임을 알려 주시면 맞춰서 안내드릴게요.</p>
            <div className="seg" role="tablist" aria-label="기관 종류">
              <button type="button" role="tab" aria-selected={!edu} onClick={() => setKind('biz')}>기업</button>
              <button type="button" role="tab" aria-selected={edu} onClick={() => setKind('edu')}>대학 · 교육기관</button>
            </div>
            <label className="field"><span>{edu ? '학교 · 기관명' : '회사명'}</span><input name="org" autoComplete="organization" required /></label>
            <div className="field-row">
              <label className="field"><span>이름</span><input name="person" autoComplete="name" required /></label>
              <label className="field"><span>인원</span>
                <select name="size" defaultValue="10–50명"><option>10명 미만</option><option>10–50명</option><option>50–200명</option><option>200명 이상</option></select>
              </label>
            </div>
            <label className="field"><span>{edu ? '기관 이메일' : '업무 이메일'}</span><input name="mail" type="email" autoComplete="email" required /></label>
            <label className="field"><span>쓰고 싶은 곳 <em>선택</em></span><textarea name="note" rows={3} placeholder="예: 신입사원 PT 교육, 분기 보고 리허설" /></label>
            <p className="auth-err" role="alert">{err}</p>
            <button type="submit" className="btn-fill btn-block">문의 보내기</button>
          </div>
          <div className="ct-done" hidden={!done}>
            <h2>접수됐어요</h2>
            <p className="auth-sub">영업일 기준 하루 안에 연락드리는 흐름이에요. 지금은 프로토타입이라 실제로 전송되지는 않고, 이 브라우저에만 저장돼요.</p>
            <button type="button" className="btn-fill btn-block" onClick={close}>확인</button>
          </div>
        </form>
      </dialog>
    </Ctx.Provider>
  );
}
