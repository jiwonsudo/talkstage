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
