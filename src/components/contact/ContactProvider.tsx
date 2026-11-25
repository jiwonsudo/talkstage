'use client';
import { SegPill } from '@/components/ui/SegPill';
import { getSupabase } from '@/lib/supabase/client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

type Kind = 'biz' | 'edu';
const Ctx = createContext<(k?: Kind) => void>(() => {});
export const useContact = () => useContext(Ctx);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Field = 'org' | 'person' | 'mail' | 'agree';

/** 도입 문의 창. 로그인 없이 보낼 수 있고, Supabase leads 표에 저장돼요(0008). 개인정보 수집·이용 동의가 필수예요. */
export function ContactProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<Kind>('biz');
  const [bad, setBad] = useState<Partial<Record<Field, string>>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const open = useCallback((k: Kind = 'biz') => {
    formRef.current?.reset(); setBad({}); setErr(''); setDone(false); setBusy(false); setKind(k);
    ref.current?.showModal();
    ref.current?.focus(); // 첫 포커스는 창에(닫기 버튼 파란 테두리 방지)
    if (ref.current) ref.current.scrollTop = 0;
  }, []);
  const close = () => ref.current?.close();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const v = (n: string) => String(f.get(n) ?? '').trim();
    const edu = kind === 'edu';
    const next: Partial<Record<Field, string>> = {};
    if (!v('org')) next.org = edu ? '학교·기관명을 적어 주세요.' : '회사명을 적어 주세요.';
    if (!v('person')) next.person = '이름을 적어 주세요.';
    if (!v('mail')) next.mail = '이메일을 적어 주세요.';
    else if (!EMAIL.test(v('mail'))) next.mail = '이메일 형식을 확인해 주세요(예: name@company.com).';
    if (!f.get('agree')) next.agree = '개인정보 수집·이용에 동의해야 문의를 보낼 수 있어요.';
    setBad(next); setErr('');
    const first = (Object.keys(next) as Field[])[0];
    if (first) {
      const el = form.elements.namedItem(first) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
      return;
    }
    const s = getSupabase();
    if (!s) { setErr('지금은 문의를 보낼 수 없어요. 잠시 뒤에 다시 시도해 주세요.'); return; }
    setBusy(true);
    const { error } = await s.from('leads').insert({
      kind, org: v('org').slice(0, 100), person: v('person').slice(0, 50), size: v('size') || null,
      mail: v('mail').slice(0, 200), note: v('note').slice(0, 1000) || null, consent_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) { setErr('문의를 보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.'); return; }
    setDone(true);
    if (ref.current) ref.current.scrollTop = 0;
  }

  const edu = kind === 'edu';
  const cls = (k: Field) => `field${bad[k] ? ' is-bad' : ''}`;
  const clear = (k: Field) => () => { if (bad[k]) setBad((b) => ({ ...b, [k]: undefined })); };
  const msg = (k: Field) => bad[k] && <em className="field-err" role="alert">{bad[k]}</em>;
  return (
    <Ctx.Provider value={open}>
      {children}
      <dialog ref={ref} className="auth contact" tabIndex={-1} aria-labelledby="ctTitle" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <form ref={formRef} onSubmit={submit} noValidate>
          <button type="button" className="dlg-x" aria-label="닫기" onClick={close}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
          <div className="ct-body" hidden={done}>
            <h2 id="ctTitle">도입 문의</h2>
            <p className="auth-sub">팀 규모와 쓰임을 알려 주시면 맞춰서 안내드릴게요.</p>
            <div className="seg" role="tablist" aria-label="기관 종류">
              <button type="button" role="tab" aria-selected={!edu} onClick={() => setKind('biz')}>기업</button>
              <button type="button" role="tab" aria-selected={edu} onClick={() => setKind('edu')}>대학 · 교육기관</button>
              <SegPill />
            </div>
            <label className={cls('org')}><span>{edu ? '학교 · 기관명' : '회사명'} <em className="req">필수</em></span><input name="org" autoComplete="organization" maxLength={100} onInput={clear('org')} aria-invalid={!!bad.org || undefined} />{msg('org')}</label>
            <div className="field-row">
              <label className={cls('person')}><span>이름 <em className="req">필수</em></span><input name="person" autoComplete="name" maxLength={50} onInput={clear('person')} aria-invalid={!!bad.person || undefined} />{msg('person')}</label>
              <label className="field"><span>인원</span>
                <select name="size" defaultValue="10–50명"><option>10명 미만</option><option>10–50명</option><option>50–200명</option><option>200명 이상</option></select>
              </label>
            </div>
            <label className={cls('mail')}><span>{edu ? '기관 이메일' : '업무 이메일'} <em className="req">필수</em></span><input name="mail" type="email" autoComplete="email" maxLength={200} onInput={clear('mail')} aria-invalid={!!bad.mail || undefined} />{msg('mail')}</label>
            <label className="field"><span>쓰고 싶은 곳 <em>선택</em></span><textarea name="note" rows={3} maxLength={1000} placeholder="예: 신입사원 PT 교육, 분기 보고 리허설" /></label>
            <div className={`consent${bad.agree ? ' is-bad' : ''}`}>
              <table className="consent-tbl">
                <caption>개인정보 수집·이용 안내</caption>
                <tbody>
                  <tr><th scope="row">수집 항목</th><td>소속, 이름, 이메일, 인원, 문의 내용</td></tr>
                  <tr><th scope="row">이용 목적</th><td>도입 상담과 견적 안내</td></tr>
                  <tr><th scope="row">보유 기간</th><td>상담 종료 후 1년. 그전에 삭제를 요청하면 바로 지워요.</td></tr>
                </tbody>
              </table>
              <p>동의하지 않을 수 있어요. 다만 동의하지 않으면 문의를 접수할 수 없어요.</p>
              <label className="consent-check"><input type="checkbox" name="agree" onChange={clear('agree')} aria-invalid={!!bad.agree || undefined} /><span>위 개인정보 수집·이용에 동의해요 <em className="req">필수</em></span></label>
              {msg('agree')}
            </div>
            <p className="auth-err" role="alert">{err}</p>
            <button type="submit" className="btn-fill btn-block" disabled={busy}>{busy ? '보내는 중…' : '문의 보내기'}</button>
          </div>
          <div className="ct-done" hidden={!done}>
            <h2>문의를 받았어요</h2>
            <p className="auth-sub">적어 주신 이메일로 연락드릴게요.</p>
            <button type="button" className="btn-fill btn-block" onClick={close}>확인</button>
          </div>
        </form>
      </dialog>
    </Ctx.Provider>
  );
}
