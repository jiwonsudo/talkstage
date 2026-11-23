import type { PlanId } from '@/lib/plans';

export type Profile = { id: string; email: string; name: string; plan: PlanId };

export type Rehearsal = {
  id: string;
  created_at: string;
  purpose_id: string;
  posture: 'seated' | 'standing';
  topic: string | null;
  overall: number | null;
  scores: Record<string, number | null>;
  focus: string | null;
  duration_sec: number | null;
};
