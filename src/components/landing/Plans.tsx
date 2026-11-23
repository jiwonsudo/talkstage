'use client';
import { createContext, useContext, useState } from 'react';

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
    </div>
  );
}

export function PlanTable({ which, className, children, ...rest }: React.HTMLAttributes<HTMLDivElement> & { which: Which }) {
  const cur = useContext(Ctx).which;
  return <div className={className} hidden={cur !== which} {...rest}>{children}</div>;
}
