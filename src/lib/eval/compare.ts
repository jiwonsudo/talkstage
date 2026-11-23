/**
 * 정확도 검증: 사람이 적은 정답(라벨)과 분석 결과를 항목별로 비교해요.
 * 합격선은 여기 한곳에서 정해요. 바꾸면 /dev/eval 결과 표가 바로 따라 바뀌어요.
 */
import type { Analysis } from '@/lib/coach/analysis';
import type { PostureId } from '@/lib/scenarios';

/** 영상마다 붙이는 정답 파일(같은 이름의 .json). 모르는 값은 빼면 그 항목은 비교하지 않아요. */
export type EvalLabel = {
  purpose?: string;
  posture?: PostureId;
  /** 목표 시간(초). 없으면 녹화 길이로 둬서 시간 점수가 만점이 돼요 */
  targetSec?: number;
  /** 같은 사람이 같은 발표를 다시 찍은 영상끼리 같은 값 → 점수 일관성 비교 */
  pair?: string;
  /** 실제로 한 말(“음”, “어”까지 그대로). 넣으면 받아쓰기 대신 써요 → 인식기 오차를 뺀 나머지 로직만 검증 */
  transcript?: string;
  truth?: {
    /** 분당 음절 수(실제 말한 음절 ÷ 말한 시간) */
    spm?: number;
    /** 카메라(청중)를 본 시간 비율 0–1 */
    gazeOn?: number;
    /** 바른 자세였던 시간 비율 0–1 */
    goodPosture?: number;
    /** 손짓한 시간 비율 0–1 */
    gesture?: number;
    /** 3초 이상 말이 끊긴 횟수 */
    longSilences?: number;
    /** “음, 어, 그…” 같은 군더더기 말 횟수 */
    fillers?: number;
    /** 사람이 매긴 전체 점수 0–100(여러 명이면 평균) */
    humanScore?: number;
  };
};

export type MetricId = 'spm' | 'gazeOn' | 'goodPosture' | 'gesture' | 'longSilences' | 'fillers';

type MetricDef = {
  label: string;
  /** 분석 결과에서 측정값 꺼내기(못 쟀으면 null) */
  get: (a: Analysis) => number | null;
  /** 합격 여부 */
  ok: (measured: number, truth: number) => boolean;
  /** 합격선 설명 */
  rule: string;
  fmt: (v: number) => string;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const METRICS: Record<MetricId, MetricDef> = {
  spm: {
    label: '말 빠르기', get: (a) => a.cats.pace?.raw ?? null,
    ok: (m, t) => Math.abs(m - t) / t <= 0.1, rule: '정답의 ±10% 안', fmt: (v) => `${Math.round(v)}음절/분`,
  },
  gazeOn: {
    label: '시선', get: (a) => a.cats.gaze?.raw ?? null,
    ok: (m, t) => Math.abs(m - t) <= 0.1, rule: '±10%p 안', fmt: pct,
  },
  goodPosture: {
    label: '자세', get: (a) => a.cats.posture?.raw ?? null,
    ok: (m, t) => Math.abs(m - t) <= 0.15, rule: '±15%p 안', fmt: pct,
  },
  gesture: {
    label: '제스처', get: (a) => a.cats.gesture?.raw ?? null,
    ok: (m, t) => Math.abs(m - t) <= 0.1, rule: '±10%p 안', fmt: pct,
  },
  longSilences: {
    label: '긴 침묵', get: (a) => (a.cats.pause?.extra?.longSil as number | undefined) ?? null,
    ok: (m, t) => Math.abs(m - t) <= 1, rule: '±1번 안', fmt: (v) => `${v}번`,
  },
  fillers: {
    label: '군더더기 말', get: (a) => (a.cats.filler?.extra?.count as number | undefined) ?? null,
    // 놓치는 쪽이 문제라 '정답의 70% 이상 잡고, 130% 넘게 과하게 세지 않기'
    ok: (m, t) => (t === 0 ? m <= 1 : m / t >= 0.7 && m / t <= 1.3), rule: '정답의 70–130%', fmt: (v) => `${v}번`,
  },
};
export const METRIC_IDS = Object.keys(METRICS) as MetricId[];

export type Cell = { measured: number | null; truth: number | null; pass: boolean | null };

export function compareClip(a: Analysis, label: EvalLabel): Record<MetricId, Cell> {
  const out = {} as Record<MetricId, Cell>;
  for (const id of METRIC_IDS) {
    const measured = METRICS[id].get(a);
    const truth = label.truth?.[id] ?? null;
    out[id] = { measured, truth, pass: measured == null || truth == null ? null : METRICS[id].ok(measured, truth) };
  }
  return out;
}

/** 항목별 합격률. 정답이 있는데 측정을 못 한 경우도 '불합격'으로 세요(사용자에겐 빈칸이 곧 실패라서). */
export function summarize(rows: Record<MetricId, Cell>[]) {
  return METRIC_IDS.map((id) => {
    const withTruth = rows.map((r) => r[id]).filter((c) => c.truth != null);
    const passed = withTruth.filter((c) => c.pass === true).length;
    const missed = withTruth.filter((c) => c.measured == null).length;
    return { id, n: withTruth.length, passed, missed, rate: withTruth.length ? passed / withTruth.length : null };
  });
}

/** 순위 상관(스피어만). 사람 점수와 앱 총점의 순서가 얼마나 맞는지 -1–1. 3개 미만이면 null */
export function spearman(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const rank = (v: number[]) => {
    const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}
