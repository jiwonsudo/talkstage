'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type ConfirmOptions = {
  title: string;
  body?: React.ReactNode;
  /** 확인 버튼 글자(기본 "확인") */
  ok?: string;
  /** 취소 버튼 글자(기본 "취소") */
  cancel?: string;
  /** 되돌릴 수 없는 일(삭제 등)이면 확인 버튼을 빨갛게 */
  danger?: boolean;
  /** 입력 칸. match 가 있으면 그 문구를 그대로 입력해야 확인 버튼이 켜져요. 값은 useAsk 로 받아요. */
  fields?: { name: string; label: React.ReactNode; type?: 'text' | 'password'; placeholder?: string; match?: string; autoComplete?: string }[];
  /** 확인을 눌렀을 때 서버 확인 등을 하고, 실패하면 오류 문구를 돌려줘요(창은 열린 채로). */
  check?: (values: Record<string, string>) => Promise<string | null>;
};

type Ask = (o: ConfirmOptions) => Promise<Record<string, string> | null>;
const Ctx = createContext<Ask>(async () => null);

/**
 * window.confirm 대신 쓰는 확인 창. `const confirm = useConfirm(); if (!(await confirm({ title }))) return;`
 * 브라우저 기본 창은 디자인과 안 맞아서 쓰지 않아요.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((v: Record<string, string> | null) => void) | null>(null);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [closing, setClosing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const ask = useCallback<Ask>((o) => {
    resolver.current?.(null); // 이미 열려 있던 건 취소로
    setClosing(false); setValues({}); setErr(''); setBusy(false);
    setOpts(o);
    return new Promise((res) => { resolver.current = res; });
  }, []);

  // 내용이 그려진 뒤에 열어요. 처음 포커스는 창 자체에(버튼에 파란 테두리가 뜨지 않게).
  useEffect(() => {
    const d = ref.current;
    if (opts && d && !d.open) { d.showModal(); d.focus(); }
  }, [opts]);

  const done = (v: Record<string, string> | null) => {
    const d = ref.current;
    resolver.current?.(v);
    resolver.current = null;
    setClosing(true);
    setTimeout(() => { d?.close(); setClosing(false); setOpts(null); }, 200);
  };

  const ready = !opts?.fields || opts.fields.every((f) => (values[f.name] ?? '').trim() && (!f.match || values[f.name].trim() === f.match));
  const ok = async () => {
    if (!opts || !ready || busy) return;
    if (opts.check) {
      setBusy(true);
      const e = await opts.check(values).catch((x: Error) => x.message || '처리하지 못했어요.');
      setBusy(false);
      if (e) { setErr(e); return; }
    }
    done(values);
  };

  return (
    <Ctx.Provider value={ask}>
      {children}
      <dialog
        ref={ref}
        className={`cfm${closing ? ' closing' : ''}`}
        tabIndex={-1}
        aria-labelledby="cfmTitle"
        onCancel={(e) => { e.preventDefault(); if (!busy) done(null); }}
        onClick={(e) => { if (e.target === e.currentTarget && !busy) done(null); }}
      >
        {opts && (
          <form className="cfm-box" onSubmit={(e) => { e.preventDefault(); ok(); }}>
            <h2 id="cfmTitle">{opts.title}</h2>
            {opts.body && <p className="cfm-body">{opts.body}</p>}
            {opts.fields?.map((f) => (
              <label key={f.name} className="field cfm-field">
                <span>{f.label}</span>
                <input type={f.type ?? 'text'} placeholder={f.placeholder} autoComplete={f.autoComplete ?? 'off'} value={values[f.name] ?? ''}
                  onChange={(e) => { const v = e.target.value; setValues((o) => ({ ...o, [f.name]: v })); setErr(''); }} />
              </label>
            ))}
            {err && <p className="cfm-err" role="alert">{err}</p>}
            <div className="cfm-act">
              <button type="button" className="btn-plain" onClick={() => done(null)} disabled={busy}>{opts.cancel ?? '취소'}</button>
              <button type="submit" className={opts.danger ? 'btn-fill cfm-danger' : 'btn-fill'} disabled={!ready || busy}>{busy ? '처리 중…' : opts.ok ?? '확인'}</button>
            </div>
          </form>
        )}
      </dialog>
    </Ctx.Provider>
  );
}

/** 예/아니오 확인 */
export const useConfirm = () => {
  const ask = useContext(Ctx);
  return useCallback(async (o: ConfirmOptions) => (await ask(o)) !== null, [ask]);
};
/** 입력 칸이 있는 확인 창. 취소하면 null, 확인하면 입력값 */
export const useAsk = () => useContext(Ctx);
