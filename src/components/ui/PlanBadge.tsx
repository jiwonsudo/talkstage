import { PLAN_COLOR } from '@/lib/colors';

/** 요금제 이름 뱃지(색은 요금제마다 고정) */
export function PlanBadge({ plan }: { plan: string }) {
  return <span className="plan-badge" style={{ '--pc': PLAN_COLOR[plan] ?? 'var(--ink-3)' } as React.CSSProperties}>{plan}</span>;
}
