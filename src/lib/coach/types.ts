import type { CatId, Outcome, PostureId } from '@/lib/scenarios';

export type CustomGoal = { label: string; focus: CatId; cta: boolean };

/** 리허설 설정(마법사에서 고른 값) */
export type Setup = {
  purposeId: string;
  /** 직접 입력한 발표 유형 이름(유료). 없으면 기본 유형 이름 */
  purposeName?: string;
  posture: PostureId;
  outcomeIdxs: number[];
  outcomeIdx?: number;
  customGoal?: CustomGoal | null;
  targetSec: number;
  topic?: string;
  keyMessage?: string;
  profile?: Record<string, number> | null;
  outcomeText?: string;
  /** 리포트 다시 하기에서 고른 집중 항목. 실시간 알림을 이 항목에만 띄워요. */
  focus?: CatId | null;
};

export type PickedOutcome = Outcome & { custom?: boolean };
export type Dir = 'low' | 'high' | 'ok' | null;
export type Status = 'good' | 'warn' | 'bad' | 'na';

export type Issue = { id: string; t0: number; t1: number; cat: CatId; sev: number; title: string; detail: string; reason?: string };
export type Check = { id: string; label: string; pass: boolean | null; detail: string; fix: string; evidence: string[] };

/** 항목별 결과. extra 는 항목마다 담는 값이 달라요(리포트 표시용). */
export type CatResult = {
  id: CatId;
  label: string;
  score: number | null;
  status: Status;
  dir: Dir;
  value: number | string | null;
  raw: number | null;
  target: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 항목별로 모양이 다른 표시용 값
  extra: Record<string, any>;
};

export type Highlight = {
  kind: 'strength' | 'weakness';
  t0: number; t1: number;
  title: string;
  reasons: string[];
  cat: CatId | string;
  score?: number;
  issueId?: string;
  sev?: number;
};
