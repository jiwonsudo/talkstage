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
};

const Ctx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/**
 * window.confirm 대신 쓰는 확인 창. `const confirm = useConfirm(); if (!(await confirm({ title }))) return;`
 * 브라우저 기본 창은 디자인과 안 맞아서 쓰지 않아요.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [closing, setClosing] = useState(false);

  const confirm = useCallback((o: ConfirmOptions) => {
    resolver.current?.(false); // 이미 열려 있던 건 취소로
    setClosing(false);
    setOpts(o);
    return new Promise<boolean>((res) => { resolver.current = res; });
  }, []);

  // 내용이 그려진 뒤에 열어요. 처음 포커스는 창 자체에(버튼에 파란 테두리가 뜨지 않게).
  useEffect(() => {
    const d = ref.current;
    if (opts && d && !d.open) { d.showModal(); d.focus(); }
  }, [opts]);

  const done = (v: boolean) => {
    const d = ref.current;
    resolver.current?.(v);
    resolver.current = null;
    setClosing(true);
    setTimeout(() => { d?.close(); setClosing(false); setOpts(null); }, 200);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <dialog
        ref={ref}
        className={`cfm${closing ? ' closing' : ''}`}
        tabIndex={-1}
        aria-labelledby="cfmTitle"
        onCancel={(e) => { e.preventDefault(); done(false); }}
        onClick={(e) => { if (e.target === e.currentTarget) done(false); }}
      >
        {opts && (
          <div className="cfm-box">
            <h2 id="cfmTitle">{opts.title}</h2>
            {opts.body && <p className="cfm-body">{opts.body}</p>}
            <div className="cfm-act">
              <button type="button" className="btn-plain" onClick={() => done(false)}>{opts.cancel ?? '취소'}</button>
              <button type="button" className={opts.danger ? 'btn-fill cfm-danger' : 'btn-fill'} onClick={() => done(true)}>{opts.ok ?? '확인'}</button>
            </div>
          </div>
        )}
      </dialog>
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
