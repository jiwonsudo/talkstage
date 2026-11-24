'use client';
import { SegPill } from '@/components/ui/SegPill';
import { createContext, useContext, useRef, useState } from 'react';

type Which = 'solo' | 'team';
const Ctx = createContext<{ which: Which; set: (w: Which) => void }>({ which: 'solo', set: () => {} });

export function PlansProvider({ children }: { children: React.ReactNode }) {
  const [which, set] = useState<Which>('solo');
  return <Ctx.Provider value={{ which, set }}>{children}</Ctx.Provider>;
}

/** 개인 / 대학 · 팀 · 기업 요금표 전환 */
export function PlanSwitch() {
  const { which, set } = useContext(Ctx);
  return (
    <div className="seg cmp-switch rv" role="tablist" aria-label="요금제 종류">
      <button type="button" role="tab" aria-selected={which === 'solo'} onClick={() => set('solo')}>개인</button>
      <button type="button" role="tab" aria-selected={which === 'team'} onClick={() => set('team')}>대학 · 팀 · 기업</button>
      <SegPill />
    </div>
  );
}

export function PlanTable({ which, className, children, ...rest }: React.HTMLAttributes<HTMLDivElement> & { which: Which }) {
  const cur = useContext(Ctx).which;
  return <div className={className} hidden={cur !== which} {...rest}>{children}</div>;
}

/**
 * 요금표를 접어 두는 틀. 접혀 있으면 윗부분만 보이고 아래로 갈수록 블러가 세져요.
 * "요금제 보기"를 누르면 실제 높이까지 펼친 뒤 높이 제한을 풀어요(탭 전환으로 높이가 바뀌어도 괜찮게).
 */
export function PlansFold({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const expand = () => {
    const el = body.current;
    if (el) {
      el.style.maxHeight = `${el.scrollHeight}px`;
      // 펼친 뒤엔 높이 제한을 풀어요(모션 줄이기 설정이면 transitionend 가 안 와서 타이머로)
      setTimeout(() => { el.style.maxHeight = 'none'; }, 750);
    }
    setOpen(true);
  };
  return (
    <div className="plans-fold" data-open={open || undefined}>
      <div ref={body} id="plans-body" className="plans-fold-body" inert={!open}>
        {children}
      </div>
      {!open && (
        <div className="plans-veil">
          <i style={{ '--from': '0%' }} />
          <i style={{ '--from': '20%' }} />
          <i style={{ '--from': '40%' }} />
          <i style={{ '--from': '60%' }} />
          <button type="button" className="btn-fill" aria-expanded={false} aria-controls="plans-body" onClick={expand}>
            요금제 보기
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
