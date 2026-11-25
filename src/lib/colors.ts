import type { CatId } from './scenarios';

/** 항목마다 늘 같은 원색(랜딩 예시·대시보드가 같이 써요). 순위가 아니라 항목을 따라가요. */
export const CAT_COLOR: Record<CatId, string> = {
  gaze: 'var(--blue)',
  posture: 'var(--green)',
  gesture: 'var(--orange)',
  tone: 'var(--pink)',
  pause: 'var(--purple)',
  pace: 'var(--red)',
  filler: 'var(--yellow)',
  content: 'var(--ink)',
  time: 'color-mix(in oklab, var(--blue) 45%, var(--green))',
  showing: 'color-mix(in oklab, var(--pink) 55%, var(--orange))',
};

/** 밝은 색이라 그 위 글자는 어둡게 */
export const LIGHT_COLOR = new Set<string>(['posture', 'filler']);

/** 발표 상황 색(scenarios 의 PURPOSES 순서대로 고정) */
export const PURPOSE_COLOR: Record<string, string> = {
  interview: 'var(--blue)',
  ir: 'var(--pink)',
  report: 'var(--orange)',
  lecture: 'var(--green)',
  conference: 'var(--purple)',
  capstone: 'var(--yellow)',
  speech: 'var(--red)',
};

/** 요금제 뱃지 색(고정) */
export const PLAN_COLOR: Record<string, string> = { Opening: 'var(--ink-3)', Spotlight: 'var(--blue)', Headliner: 'var(--purple)' };

/**
 * 남은 크레딧 비율(0~1)에 따른 색: 넉넉하면 초록, 줄수록 노랑·주황을 거쳐 빨강으로 이어져요.
 * oklch 색상(hue)만 145(초록) → 25(빨강)로 옮겨 밝기는 비슷하게 유지해요.
 */
export function creditTone(left: number, total: number) {
  const r = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  return `oklch(0.66 0.18 ${Math.round(25 + 120 * r)})`;
}
