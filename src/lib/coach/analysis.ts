// 녹화 데이터 분석: 지표 계산, 문제 구간 탐지, 하이라이트 선정, 내용 구조 점검
import { syllables } from './audio';
import { CAT_LABEL, type CatId, type PostureId, type Purpose, type Range } from '@/lib/scenarios';
import type { AudioFrame, FinalText, TranscriptResult } from './audio';
import type { FaceFrame, PoseFrame, VisionFrame } from './vision';
import { analyzeShowing, type ShowingResult } from './showing';
import { aidOf, audienceOf, deliveryOf, isShowing, type Audience } from '@/lib/delivery';
import type { CatResult, Check, Dir, Highlight, Issue, PickedOutcome, Setup, Status } from './types';

type Run = { t0: number; t1: number };
type BoolRun = Run & { v: boolean };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : NaN);
function quantile(a: number[], q: number) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const median = (a: number[]) => quantile(a, 0.5);
function std(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
}
function trimmedStd(a: number[], lo = 0.05, hi = 0.95) {
  const l = quantile(a, lo), h = quantile(a, hi);
  return std(a.filter((v) => v >= l && v <= h));
}
const round = (v: number | null | undefined, d = 0): number | null => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

// 짧은 run을 반대 값으로 바꿉니다(가장자리 run 제외).
function smoothRuns(arr: boolean[], value: boolean, maxLen: number) {
  const out = arr.slice();
  let i = 0;
  while (i < out.length) {
    if (out[i] !== value) { i++; continue; }
    let j = i;
    while (j < out.length && out[j] === value) j++;
    if (j - i <= maxLen && i > 0 && j < out.length) for (let k = i; k < j; k++) out[k] = !value;
    i = j;
  }
  return out;
}
function boolRuns(times: number[], vals: boolean[], dt: number) {
  const out: BoolRun[] = [];
  let cur: BoolRun | null = null;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (cur && cur.v === v) cur.t1 = times[i] + dt;
    else { if (cur) out.push(cur); cur = { t0: times[i], t1: times[i] + dt, v }; }
  }
  if (cur) out.push(cur);
  return out;
}
function mergeRuns(rs: Run[], gap: number) {
  const out: Run[] = [];
  for (const r of rs) {
    const last = out[out.length - 1];
    if (last && r.t0 - last.t1 < gap) last.t1 = r.t1;
    else out.push({ t0: r.t0, t1: r.t1 });
  }
  return out;
}
function lowerBound<T extends { t: number }>(arr: T[], t: number, key: (x: T) => number = (x) => x.t) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (key(arr[m]) < t) lo = m + 1; else hi = m; }
  return lo;
}
function rangeScore(v: number, r: Range, soft: number): number;
function rangeScore(v: number | null | undefined, r: Range, soft: number): number | null;
function rangeScore(v: number | null | undefined, [lo, hi]: Range, soft: number) {
  if (v == null || !isFinite(v)) return null;
  // 범위 밖: 경계 85점에서 soft 만큼 벗어나면 0점
  if (v < lo) return clamp(IN_RANGE_MIN * (1 - (lo - v) / soft), 0, 100);
  if (v > hi) return clamp(IN_RANGE_MIN * (1 - (v - hi) / soft), 0, 100);
  // 범위 안: 가운데(이상적인 값)에 가까울수록 100, 경계면 85. 범위 안이면 모두 100이던 계단식이라 결과가 획일적이었어요.
  const d = hi > lo ? Math.abs(v - (lo + hi) / 2) / ((hi - lo) / 2) : 0;
  return IN_RANGE_MIN + (100 - IN_RANGE_MIN) * (1 - d ** 0.7);
}
/** 목표 범위 경계에서의 점수(그래도 '좋음' 80 이상) */
const IN_RANGE_MIN = 85;
const dirOf = (v: number | null | undefined, [lo, hi]: Range): Dir => (v == null ? null : v < lo ? 'low' : v > hi ? 'high' : 'ok');
const statusOf = (s: number | null | undefined): Status => (s == null ? 'na' : s >= 80 ? 'good' : s >= 55 ? 'warn' : 'bad');

// ---------------- 보정(녹화 직전 3초) ----------------
export type Calibration = ReturnType<typeof buildCalibration>;
export function buildCalibration(audioFrames: AudioFrame[], visionFrames: VisionFrame[]) {
  const dbs = audioFrames.map((f) => f.db);
  const noiseDb = dbs.length ? Math.min(quantile(dbs, 0.5), -30) : -60;
  const faces = visionFrames.filter((f): f is FaceFrame => f.face);
  const poses = visionFrames.filter((f): f is PoseFrame => f.pose);
  const m = <F,>(arr: F[], k: (f: F) => number, d: number) => (arr.length ? median(arr.map(k)) : d);
  return {
    noiseDb,
    yaw0: clamp(m(faces, (f) => f.yawP, 0), -0.12, 0.12),
    pitch0: clamp(m(faces, (f) => f.pitchP, 0.55), 0.3, 0.8),
    eyeDown0: clamp(m(faces, (f) => f.eyeDown, 0.1), 0, 0.4),
    slouch0: poses.length >= 3 ? median(poses.map((f) => f.slouchR)) : null,
  };
}

/** zone: 청중이 여럿(room)일 때 본 방향. C = 가운데(카메라), S1/S2 = 양옆(어느 쪽인지는 영상 좌우 기준) */
export type FrameClass = { gaze: boolean | null; lookDown: boolean; bad: boolean | null; reasons: string[]; zone: 'C' | 'S1' | 'S2' | null };
export function classifyFrame(f: VisionFrame, calib: Calibration, posture: PostureId, audience: Audience = 'camera') {
  const c: FrameClass = { gaze: null, lookDown: false, bad: null, reasons: [], zone: null };
  if (f.face) {
    const dy = f.yawP - calib.yaw0;
    const dp = f.pitchP - calib.pitch0;
    const ed = f.eyeDown - calib.eyeDown0;
    c.lookDown = dp > 0.09 || ed > 0.32;
    const level = Math.abs(dp) < 0.09 && ed < 0.32;
    c.gaze = Math.abs(dy) < 0.11 && level && f.eyeH < 0.55;
    if (c.gaze) c.zone = 'C';
    // 청중이 여럿이면(대면 면접·서서 하는 발표) 고개를 옆으로 돌려 옆 사람을 보는 것도 청중을 보는 거예요.
    // 고개를 크게(0.32 넘게) 돌리면 청중 밖(창밖·화면)으로 봐요.
    else if (audience === 'room' && level && Math.abs(dy) < 0.32) { c.gaze = true; c.zone = dy > 0 ? 'S1' : 'S2'; }
  }
  if (f.pose) {
    const r = [];
    // 고개를 옆으로 돌린 동안(옆 면접관·청중을 볼 때)은 코·눈·어깨가 비스듬히 찍혀서 "등이 굽음·고개 기울임·어깨 기울어짐"으로
    // 잘못 잡혔어요. 그때는 머리·어깨 각도로 자세를 판단하지 않아요(팔짱·화면 밖은 그대로 봐요).
    const turned = f.face && Math.abs(f.yawP - calib.yaw0) >= 0.11;
    if (!turned) {
      if (calib.slouch0 && f.slouchR < calib.slouch0 * 0.8) r.push('slouch');
      if (f.shoulderTilt > 7) r.push('shoulderTilt');
      const ht = f.face ? f.faceTilt : f.headTilt;
      if (ht != null && ht > 12) r.push('headTilt');
    }
    if (f.armsCrossed) r.push('crossed');
    if (posture === 'seated' && (f.noseX < 0.18 || f.noseX > 0.82)) r.push('offCenter');
    c.bad = r.length > 0;
    c.reasons = r;
  }
  return c;
}

export const REASON_TEXT: Record<string, string> = {
  slouch: '등이 굽고 고개가 앞으로 나온',
  shoulderTilt: '어깨가 한쪽으로 기운',
  headTilt: '고개가 옆으로 기운',
  crossed: '팔짱을 끼거나 팔로 몸을 막은',
  offCenter: '화면 가장자리로 벗어난',
};

// ---------------- 한국어 군더더기 말 ----------------
const FILLERS = new Set(['어', '어어', '음', '음음', '으음', '흠', '저', '저기', '이제', '약간', '막', '뭐', '뭔가', '뭐랄까', '그냥']);
const stripTok = (w: string) => w.replace(/[.,!?~…"'“”‘’()\[\]]/g, '');

// ---------------- 내용 구조 ----------------
const JOSA = /(으로서|으로써|에서는|에게서|이라는|라는|으로|에서|에게|까지|부터|처럼|보다|입니다|합니다|이다|은|는|이|가|을|를|에|의|와|과|도|로|만)$/;
function keyTokens(text: string | undefined) {
  return [...new Set(String(text || '').split(/\s+/).map(stripTok).map((w) => w.replace(JOSA, '')).filter((w) => w.length >= 2))].slice(0, 8);
}
const hasAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

// 고른 목표(최대 3개). 먼저 고른 목표일수록 가중치를 더 줍니다.
export function pickOutcomes(purpose: Purpose, setup: Setup): PickedOutcome[] {
  const idxs = Array.isArray(setup.outcomeIdxs) && setup.outcomeIdxs.length ? setup.outcomeIdxs : [setup.outcomeIdx ?? 0];
  const list: PickedOutcome[] = idxs.map((i) => purpose.outcomes[i]).filter(Boolean);
  if (setup.customGoal?.label) list.push({ ...setup.customGoal, custom: true });
  return list.length ? list.slice(0, 3) : [purpose.outcomes[0]];
}
export function outcomeWeight(outs: PickedOutcome[], id: CatId) {
  const boosts = [1.3, 1.2, 1.1];
  return outs.reduce((w, o, k) => (o.focus === id ? Math.max(w, boosts[k] || 1.1) : w), 1);
}


export function contentAnalysis(finals: FinalText[], purpose: Purpose, setup: Setup, dur: number) {
  const outs = pickOutcomes(purpose, setup);
  const outcome = { label: outs.map((o) => o.label).join(' · '), cta: outs.some((o) => o.cta) };
  const ids = [...purpose.contentChecks];
  if (outcome.cta && !ids.includes('cta')) ids.push('cta');
  const full = finals.map((f) => f.text).join(' ');
  const within = (a: number, b: number) => finals.filter((f) => f.t >= a && f.t0 <= b).map((f) => f.text).join(' ');
  const openEnd = Math.min(35, dur * 0.25);
  const closeStart = Math.max(dur - 35, dur * 0.75);
  const opening = within(0, openEnd);
  const closing = within(closeStart, dur + 5);
  const tokens = keyTokens(setup.keyMessage);
  const need = Math.max(1, Math.ceil(tokens.length * 0.5));
  const hit = (txt: string) => tokens.filter((t) => txt.includes(t)).length >= need;
  const checks: Check[] = [];
  const add = (id: string, label: string, pass: boolean | null, detail: string, fix: string, evidence: string[]) => checks.push({ id, label, pass, detail, fix, evidence });
  const noText = full.replace(/\s/g, '').length < 15;

  for (const id of ids) {
    if (noText) { checks.push({ id, label: CHECK_LABEL[id], pass: null, detail: '받아쓰기 내용이 없어 확인하지 못했어요.', fix: '', evidence: [] }); continue; }
    if (id === 'keyMessage') {
      if (!tokens.length) { add(id, CHECK_LABEL[id], null, '핵심 메시지를 입력하지 않아 확인하지 못했어요.', '', ['anderson2016']); continue; }
      const coverage = tokens.filter((t) => full.includes(t)).length / tokens.length;
      const mentions = finals.filter((f) => hit(f.text)).length;
      const inOpen = hit(opening), inClose = hit(closing);
      const pass = coverage >= 0.6 && (inOpen || inClose);
      add(id, CHECK_LABEL[id], pass,
        `핵심어 ${Math.round(coverage * 100)}% 언급 · ${mentions}번 등장 · 시작부 ${inOpen ? '있음' : '없음'} · 마무리 ${inClose ? '있음' : '없음'}`,
        '핵심 메시지 한 문장을 처음 30초 안에 한 번, 마무리에서 한 번 더 그대로 말하세요.', ['anderson2016']);
    } else if (id === 'conclusionFirst') {
      const markers = ['결론', '핵심', '요약하면', '말씀드리면', '제안', '요청', '결과적으로', '정리하면', '한마디로', '저는'];
      const pass = hasAny(opening, markers) || (tokens.length > 0 && hit(opening));
      add(id, CHECK_LABEL[id], pass, pass ? '시작부에 결론이나 입장이 나왔어요.' : `처음 ${Math.round(openEnd)}초 동안 결론이나 입장이 드러나지 않았어요.`,
        '첫 문장을 “결론부터 말씀드리면 ~입니다”로 시작해 보세요.', purpose.id === 'interview' ? ['minto', 'star'] : ['minto']);
    } else if (id === 'numbers') {
      const nums = (full.match(/\d+(?:[.,]\d+)?/g) || []).length + (full.match(/(퍼센트|프로|억|만 명|천만|배|개월|분기)/g) || []).length;
      const needN = Math.max(2, Math.round(dur / 60));
      add(id, CHECK_LABEL[id], nums >= needN, `구체적인 숫자 표현 ${nums}번 (권장 ${needN}번 이상)`,
        '주장마다 근거 숫자를 하나씩 붙이세요. 예: “전환율이 3배 올랐습니다”.', purpose.id === 'ir' ? ['kawasaki', 'duarte2010'] : ['minto']);
    } else if (id === 'cta') {
      const words = ['부탁', '요청', '제안', '함께', '검토', '연락', '결정', '승인', '투자', '참여', '시작해', '해 주시', '해주시', '도와', '만나'];
      const pass = hasAny(closing, words);
      add(id, CHECK_LABEL[id], pass, pass ? '마무리에 구체적인 요청이 있었어요.' : '마무리에서 청중에게 무엇을 해 달라는 요청이 들리지 않았어요.',
        `원하는 결과(“${outcome.label}”)에 맞게, 마지막 문장에서 청중이 할 행동을 직접 요청하세요.`, ['duarte2010']);
    } else if (id === 'questions') {
      const q = (full.match(/(까요|나요|을까|ㄹ까|습니까|입니까|\?)/g) || []).length;
      const needQ = Math.max(1, Math.round(dur / 120));
      add(id, CHECK_LABEL[id], q >= needQ, `청중에게 던진 질문 ${q}번 (권장 ${needQ}번 이상)`,
        '설명 중간에 “여러분이라면 어떻게 하시겠어요?”처럼 질문을 던지고 3초 기다리세요.', ['rowe1986']);
    } else if (id === 'recap') {
      const pass = hasAny(closing, ['정리', '요약', '다시 한번', '다시 한 번', '다시 말해', '기억해', '마지막으로', '오늘 말씀드린']);
      add(id, CHECK_LABEL[id], pass, pass ? '마무리에서 내용을 다시 정리했어요.' : '마무리에서 핵심을 다시 정리하는 부분이 없었어요.',
        '끝나기 전에 “오늘 말씀드린 내용은 세 가지입니다”로 다시 정리하세요.', ['mayer', 'anderson2016']);
    } else if (id === 'star') {
      const groups = [
        ['당시', '상황', '때', '처음에'],
        ['목표', '과제', '맡', '역할', '문제'],
        ['했습니다', '진행', '시도', '개선', '만들', '제안했'],
        ['결과', '성과', '달성', '늘', '줄', '퍼센트', '%', '배'],
      ];
      const found = groups.filter((g) => hasAny(full, g)).length;
      add(id, CHECK_LABEL[id], found >= 3, `상황·과제·행동·결과 중 ${found}가지 요소가 들렸어요.`,
        '경험을 말할 때 “상황 → 맡은 과제 → 내가 한 행동 → 숫자로 된 결과” 순서로 말하세요.', ['star']);
    } else if (id === 'contrast') {
      const now = hasAny(full, ['지금', '현재', '기존', '문제', '불편', '어려움']);
      const fut = hasAny(full, ['앞으로', '미래', '바꾸', '해결', '가능', '새로운', '꿈']);
      add(id, CHECK_LABEL[id], now && fut, now && fut ? '현재와 미래의 대비가 있었어요.' : '“지금의 문제”와 “바뀐 미래”의 대비가 약해요.',
        '“지금은 ~하지만, ~하면 ~가 됩니다”처럼 현재와 미래를 대비시키세요.', ['duarte2010']);
    } else if (id === 'story') {
      const n = ['그때', '처음', '어느 날', '당시', '기억', '순간', '이야기', '그날'].filter((w) => full.includes(w)).length;
      add(id, CHECK_LABEL[id], n >= 2, `이야기 장치(시간·장면 표현) ${n}가지 사용`,
        '“그날, ~에서”처럼 구체적인 장면 하나로 시작해 보세요.', ['duarte2010']);
    }
  }
  return checks;
}
export const CHECK_LABEL: Record<string, string> = {
  keyMessage: '핵심 메시지 전달',
  conclusionFirst: '결론 먼저',
  numbers: '숫자 근거',
  cta: '행동 요청',
  questions: '청중 질문',
  recap: '마무리 정리',
  star: 'STAR 구조',
  contrast: '현재 ↔ 미래 대비',
  story: '이야기 장면',
};

// ---------------- 메인 분석 ----------------
/** 리허설로 칠 최소 조건. 못 넘으면 점수·저장·크레딧 차감 없이 다시 녹화하게 해요. */
export const MIN_REHEARSAL_SEC = 20;
/** 실제 목소리(음높이가 잡히는 소리)가 이만큼은 있어야 해요: 최소 8초, 그리고 녹화의 20% 이상 */
const MIN_VOICE_SEC = 8, MIN_VOICE_FRAC = 0.2;
/** 말이 거의 알아들을 수 없을 때 종합 점수 상한 */
const UNCLEAR_CAP = 35;

export type AnalyzeInput = { audio: AudioFrame[]; vision: VisionFrame[]; transcript: TranscriptResult | null; calib: Calibration; purpose: Purpose; setup: Setup; durationSec: number };
export type Analysis = ReturnType<typeof analyze>;
export function analyze({ audio, vision, transcript, calib, purpose, setup, durationSec }: AnalyzeInput) {
  const T = purpose.targets;
  const posture = setup.posture;
  const dur = Math.max(1, durationSec);
  const nSec = Math.ceil(dur);
  const issues: Issue[] = [];
  const limits: string[] = [];
  const cats = {} as Record<CatId, CatResult>;
  const pushIssue = (o: Omit<Issue, 'id'>) => issues.push({ id: `i${issues.length}`, ...o, t0: Math.max(0, o.t0), t1: Math.min(dur, o.t1) });

  // ---------- 음성 구간 ----------
  const tA = audio.map((f) => f.t);
  const dbs = audio.map((f) => f.db);
  const dtA = audio.length > 1 ? (tA[tA.length - 1] - tA[0]) / (audio.length - 1) : 0.025;
  const noise = Math.min(calib.noiseDb ?? -60, audio.length ? quantile(dbs, 0.1) : -60);
  const loud = audio.length ? quantile(dbs, 0.9) : -60;
  const thr = Math.max(noise + 6, noise + 0.35 * (loud - noise));
  let voiced = audio.map((f) => f.db > thr);
  voiced = smoothRuns(voiced, false, Math.round(0.2 / dtA));
  voiced = smoothRuns(voiced, true, Math.round(0.08 / dtA));
  const vr = boolRuns(tA, voiced, dtA);
  const speech = vr.filter((r) => r.v);
  const speechTime = sum(speech.map((r) => r.t1 - r.t0));
  const hasSpeech = speechTime > 3;
  if (!hasSpeech) limits.push('말소리가 거의 감지되지 않았어요. 마이크 연결과 입력 음량을 확인하세요.');
  const spanStart = speech[0]?.t0 ?? 0;
  const spanEnd = speech[speech.length - 1]?.t1 ?? dur;
  const span = Math.max(1, spanEnd - spanStart);
  const silences = vr.filter((r) => !r.v && r.t0 >= spanStart && r.t1 <= spanEnd + 1e-6);
  const pauses = silences.filter((r) => r.t1 - r.t0 >= 0.3);
  const pauseRatio = hasSpeech ? sum(pauses.map((r) => r.t1 - r.t0)) / span : null;
  const bigSil = silences.filter((r) => r.t1 - r.t0 > 2);
  const bigSilTotal = sum(bigSil.map((r) => r.t1 - r.t0));

  const voicedSec = new Array(nSec).fill(0);
  for (let i = 0; i < audio.length; i++) if (voiced[i]) { const s = Math.floor(tA[i]); if (s < nSec) voicedSec[s] += dtA; }

  // 호흡 없이 길게 이어 말한 구간
  const phrases = mergeRuns(speech, 0.4);
  const longRuns = phrases.filter((r) => r.t1 - r.t0 > 18);
  longRuns.forEach((r) => pushIssue({ t0: r.t0, t1: r.t1, cat: 'pause', sev: r.t1 - r.t0 > 28 ? 3 : 2, title: '쉼 없이 길게 이어 말함', detail: `${Math.round(r.t1 - r.t0)}초 동안 0.4초 이상 쉬지 않았어요.` }));
  silences.filter((r) => r.t1 - r.t0 >= 3).forEach((r) => pushIssue({
    t0: r.t0, t1: r.t1, cat: 'pause', sev: purpose.id === 'lecture' || purpose.id === 'speech' ? 1 : 2,
    title: '말이 오래 끊김', detail: `${(r.t1 - r.t0).toFixed(1)}초 동안 말이 멈췄어요. 의도한 쉼이 아니라면 다음 문장을 잊은 것처럼 보일 수 있어요.`,
  }));

  // 말끝 흐림: 발화 단위의 마지막 20% 음량이 중앙값보다 6dB 이상 떨어지는지
  const utts = mergeRuns(speech, 0.35).filter((r) => r.t1 - r.t0 >= 0.8);
  const fades = [];
  for (const u of utts) {
    const i0 = lowerBound(audio, u.t0), i1 = lowerBound(audio, u.t1);
    const seg = dbs.slice(i0, i1);
    if (seg.length < 10) continue;
    const tailN = Math.max(Math.round(0.2 / dtA), Math.round(seg.length * 0.2));
    const drop = median(seg) - median(seg.slice(-tailN));
    if (drop >= 6) fades.push({ ...u, drop });
  }
  const fadeRatio = utts.length >= 4 ? fades.length / utts.length : null;
  if (fadeRatio != null && fadeRatio > T.fade) {
    fades.sort((a, b) => b.drop - a.drop).slice(0, 4).forEach((f) => pushIssue({
      t0: Math.max(f.t1 - 2.5, f.t0), t1: f.t1, cat: 'tone', sev: 1, title: '말끝이 흐려짐', detail: `문장 끝 음량이 ${Math.round(f.drop)}dB 떨어졌어요.`,
    }));
  }

  // 음높이 변화(반음)
  const pitched = audio.filter((f, i) => voiced[i] && f.pitch > 0);
  let pitchVar = null;
  const pitchMed = pitched.length ? median(pitched.map((f) => f.pitch)) : null;
  const semi = (p: number) => 12 * Math.log2(p / (pitchMed ?? 1));
  if (pitched.length >= 40) pitchVar = trimmedStd(pitched.map((f) => semi(f.pitch)));
  else if (hasSpeech) limits.push('음높이를 측정할 만큼 또렷한 목소리 구간이 부족했어요.');
  const windowPitchStd = (a: number, b: number) => {
    const i0 = lowerBound(pitched, a), i1 = lowerBound(pitched, b);
    const seg = pitched.slice(i0, i1);
    return seg.length >= 40 ? trimmedStd(seg.map((f) => semi(f.pitch))) : null;
  };
  if (pitchVar != null) {
    const mono = [];
    for (let s = 0; s + 15 <= dur; s += 5) {
      const vfrac = sum(voicedSec.slice(s, s + 15)) / 15;
      const sd = windowPitchStd(s, s + 15);
      if (vfrac >= 0.5 && sd != null && sd < 1.3) mono.push({ t0: s, t1: s + 15 });
    }
    mergeRuns(mono, 0.1).slice(0, 3).forEach((r) => pushIssue({ t0: r.t0, t1: r.t1, cat: 'tone', sev: 2, title: '억양이 단조로움', detail: '음높이가 거의 변하지 않아 같은 톤이 이어졌어요.' }));
  }

  // ---------- 또렷함 ----------
  // 받아쓰기가 돌았는데 목소리 길이에 비해 알아들은 말이 거의 없으면 웅얼거린 거예요. 소리만 보면 억양·쉼·시선은 멀쩡해서
  // 말 한마디 안 하고도 60점대가 나왔어요. 또렷하게 말하면 말한 1초에 4~7음절쯤 받아써져요(받아쓰기가 일부 놓쳐도 3 이상).
  const finals = transcript?.finals || [];
  const syllTotalT = sum(finals.map((f) => syllables(f.text)));
  const sttRan = !!transcript && !transcript.error && setup.source !== 'file';
  const clarityRatio = sttRan && speechTime >= 10 ? syllTotalT / speechTime : null;
  const clarity: 'low' | 'part' | 'ok' | null = clarityRatio == null ? null : clarityRatio < 1 ? 'low' : clarityRatio < 2 ? 'part' : 'ok';
  if (clarity === 'low' || clarity === 'part') {
    // 말소리는 있는데 받아쓴 말이 적은 10초 구간
    const tSyll = new Array(nSec).fill(0);
    for (const f of finals) {
      const n = syllables(f.text), a = Math.max(0, Math.floor(f.t0)), b = Math.max(a + 1, Math.ceil(f.t));
      for (let k = a; k < b && k < nSec; k++) tSyll[k] += n / (b - a);
    }
    const bad: Run[] = [];
    for (let s0 = 0; s0 + 10 <= nSec; s0 += 5) {
      const v = sum(voicedSec.slice(s0, s0 + 10));
      if (v >= 4 && sum(tSyll.slice(s0, s0 + 10)) / v < 1.2) bad.push({ t0: s0, t1: s0 + 10 });
    }
    mergeRuns(bad, 0.1).sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0)).slice(0, 3).forEach((r) => pushIssue({
      t0: r.t0, t1: r.t1, cat: 'tone', sev: clarity === 'low' ? 3 : 2, title: '말이 또렷하게 들리지 않음',
      detail: `목소리는 났지만 ${Math.round(r.t1 - r.t0)}초 동안 알아들을 수 있는 말이 거의 없었어요. 입을 크게 열고 단어 끝까지 또박또박 말해 보세요.`,
    }));
    limits.push(clarity === 'low'
      ? `목소리는 ${Math.round(speechTime)}초 났는데 받아쓴 말이 ${Math.round(syllTotalT)}음절뿐이라, 말이 또렷하지 않았다고 보고 종합 점수를 ${UNCLEAR_CAP}점 아래로 낮췄어요. 또렷하게 말했는데도 이렇게 나왔다면 받아쓰기가 끊긴 거라 다시 녹화해 주세요.`
      : '받아쓴 말이 목소리 길이에 비해 적어요. 일부 구간은 말이 또렷하지 않았을 수 있어요.');
  }

  // ---------- 말 빠르기 ----------
  let rateSource: 'transcript' | 'estimate' | 'audio' | null = null;
  let syllTimes: { t: number; n: number }[] = [];
  // 웅얼거려서 받아쓴 말이 적으면 그걸로 세면 "아주 느림"이 돼요. 그때는 소리로 추정해요.
  if (syllTotalT >= 15 && clarity !== 'low') {
    rateSource = 'transcript';
    const ev = transcript?.events || [];
    const evTotal = sum(ev.map((e) => e.n));
    if (ev.length >= 5 && evTotal > 0) {
      const k = syllTotalT / evTotal;
      syllTimes = ev.map((e) => ({ t: Math.max(0, e.t - 0.6), n: e.n * k }));
    } else {
      for (const f of finals) {
        const n = syllables(f.text);
        const steps = Math.max(1, Math.round((f.t - f.t0) / 0.5));
        for (let k = 0; k < steps; k++) syllTimes.push({ t: f.t0 + ((f.t - f.t0) * (k + 0.5)) / steps, n: n / steps });
      }
    }
  } else if (hasSpeech) {
    rateSource = 'estimate';
    const sm = dbs.map((_, i) => (dbs[Math.max(0, i - 1)] + dbs[i] + dbs[Math.min(dbs.length - 1, i + 1)]) / 3);
    const w = 3, back = 6, minGap = 0.11;
    let last = -1;
    for (let i = back; i < sm.length - w; i++) {
      if (!voiced[i]) continue;
      let isMax = true;
      for (let k = -w; k <= w; k++) if (sm[i + k] > sm[i]) { isMax = false; break; }
      if (!isMax) continue;
      const lo = Math.min(...sm.slice(i - back, i));
      if (sm[i] - lo < 2.5 || tA[i] - last < minGap) continue;
      last = tA[i];
      syllTimes.push({ t: tA[i], n: 1.3 }); // 음량 봉우리는 음절을 적게 세는 경향이 있어 보정
    }
    limits.push(clarity === 'low' ? '받아쓴 말이 너무 적어서 말 빠르기는 음량 변화로 추정했어요. 실제와 차이가 클 수 있어요.' : '받아쓰기가 없어서 말 빠르기는 음량 변화로 추정했어요. 실제와 차이가 클 수 있어요.');
  }
  const syllTotal = sum(syllTimes.map((s) => s.n));
  const effTime = Math.max(1, span - bigSilTotal);
  const spm = rateSource ? (syllTotal / effTime) * 60 : null;
  const syllSec = new Array(nSec).fill(0);
  for (const s of syllTimes) { const i = Math.floor(s.t); if (i >= 0 && i < nSec) syllSec[i] += s.n; }
  const rateSec = new Array(nSec).fill(null);
  if (rateSource) {
    for (let s = 0; s < nSec; s++) {
      const a = Math.max(spanStart, s - 6), b = Math.min(spanEnd, s + 6);
      if (b - a < 4) continue;
      let eff = b - a;
      for (const r of bigSil) eff -= Math.max(0, Math.min(b, r.t1) - Math.max(a, r.t0));
      const vfrac = sum(voicedSec.slice(Math.max(0, Math.floor(a)), Math.ceil(b))) / (b - a);
      if (eff < 4 || vfrac < 0.3) continue;
      rateSec[s] = (sum(syllSec.slice(Math.max(0, Math.floor(a)), Math.ceil(b))) / eff) * 60;
    }
  }
  const [lo, hi] = T.spm;
  const rated = rateSec.filter((v) => v != null);
  const fastFrac = rated.length ? rated.filter((v) => v > hi + 30).length / rated.length : 0;
  const slowFrac = rated.length ? rated.filter((v) => v < lo - 40).length / rated.length : 0;
  const secRuns = (pred: (s: number) => boolean, minLen: number) => {
    const out: Run[] = [];
    let st: number | null = null;
    for (let s = 0; s <= nSec; s++) {
      const ok = s < nSec && pred(s);
      if (ok && st == null) st = s;
      if (!ok && st != null) { if (s - st >= minLen) out.push({ t0: st, t1: s }); st = null; }
    }
    return out;
  };
  secRuns((s) => rateSec[s] != null && rateSec[s] > hi + 30, 6).forEach((r) => {
    const peak = Math.max(...rateSec.slice(r.t0, r.t1).filter((v) => v != null));
    pushIssue({ t0: r.t0, t1: r.t1, cat: 'pace', sev: peak > hi + 70 ? 3 : 2, title: '말이 빨라짐', detail: `이 구간은 분당 약 ${Math.round(peak)}음절이에요 (목표 ${lo}–${hi}).` });
  });
  secRuns((s) => rateSec[s] != null && rateSec[s] < lo - 40, 8).forEach((r) => {
    pushIssue({ t0: r.t0, t1: r.t1, cat: 'pace', sev: 1, title: '말이 느려짐', detail: `이 구간은 목표(${lo}–${hi}음절/분)보다 느렸어요.` });
  });

  // ---------- 군더더기 말 ----------
  const fillerTimes: { t: number; w: string }[] = [];
  const fillerCount: Record<string, number> = {};
  for (const f of finals) {
    const toks = f.text.split(/\s+/).filter(Boolean);
    toks.forEach((w, k) => {
      const s = stripTok(w);
      if (FILLERS.has(s)) {
        fillerCount[s] = (fillerCount[s] || 0) + 1;
        fillerTimes.push({ t: f.t0 + ((f.t - f.t0) * (k + 0.5)) / toks.length, w: s });
      }
    });
  }
  const fillerN = fillerTimes.length;
  const fillerPerMin = finals.length && syllTotalT >= 15 ? fillerN / (dur / 60) : null;
  {
    const used = new Set();
    for (let i = 0; i < fillerTimes.length; i++) {
      if (used.has(i)) continue;
      const win = fillerTimes.filter((x, j) => j >= i && x.t - fillerTimes[i].t <= 20);
      if (win.length >= 3) {
        for (let j = i; j < i + win.length; j++) used.add(j);
        pushIssue({ t0: win[0].t - 1, t1: win[win.length - 1].t + 1, cat: 'filler', sev: win.length >= 5 ? 2 : 1, title: '군더더기 말이 몰림', detail: `20초 안에 ${win.map((x) => `“${x.w}”`).join(', ')}가 나왔어요.` });
      }
    }
  }

  // ---------- 영상: 시선 · 자세 · 제스처 ----------
  const V = vision;
  const dtV = V.length > 1 ? median(V.slice(1).map((f, i) => f.t - V[i].t)) || 0.1 : 0.1;
  const aid = aidOf(purpose.id, setup.aid);
  const audience = audienceOf(aid, posture);
  const cls = V.map((f) => classifyFrame(f, calib, posture, audience));
  const faceFrames = V.filter((f) => f.face).length;
  const poseFrames = V.filter((f) => f.pose).length;
  const faceOK = V.length > 0 && faceFrames / V.length >= 0.4;
  const poseOK = V.length > 0 && poseFrames / V.length >= 0.4;
  if (setup.source === 'file') limits.push('올린 영상 파일은 받아쓰기를 할 수 없어서 군더더기 말·내용 구조는 분석하지 않았고, 말 빠르기는 소리로 추정했어요. 영상 처음 3초를 기준 자세·주변 소음으로 썼어요.');
  if (setup.mode === 'voice') limits.push('음성만 리허설이라 시선·자세·제스처·보여 주기는 분석하지 않고, 목소리와 내용 항목으로만 점수를 냈어요.');
  else if (!V.length) limits.push('영상 분석 모델을 쓰지 못해 시선·자세·제스처는 분석하지 않았어요.');
  else {
    if (!faceOK) limits.push('얼굴이 화면에서 자주 사라져 시선 분석이 정확하지 않을 수 있어요. 조명을 얼굴 정면에 두세요.');
    if (!poseOK) limits.push(posture === 'seated' ? '어깨가 화면에 잘 잡히지 않아 자세 분석을 생략했어요.' : '상체가 화면에 잘 잡히지 않아 자세 분석을 생략했어요.');
  }
  // 보여 주기(화면·제품): 가리키는 중·직후의 시선은 채점에서 빼요(그때 화면을 보는 건 자연스러워요)
  let showing: ShowingResult | null = null;
  if (isShowing(aid) && poseOK) {
    showing = analyzeShowing({ V, cls, dt: dtV, dur, aid, purposeId: purpose.id, finals, score: rangeScore });
    showing.exempt.forEach((x, i) => { if (x && cls[i].gaze === false) { cls[i].gaze = null; cls[i].lookDown = false; } });
    showing.issues.forEach((is) => pushIssue({ ...is, cat: 'showing' }));
    if (showing.wrongSide) limits.push('가리키는 방향이 고른 화면 위치와 반대예요. 다음 리허설에서 화면 위치를 다시 골라 주세요.');
  }
  const gazeSec: (number | null)[] = new Array(nSec).fill(null);
  const badSec: (number | null)[] = new Array(nSec).fill(null);
  const gestSec: (number | null)[] = new Array(nSec).fill(null);
  const smileSec: (number | null)[] = new Array(nSec).fill(null);
  type Acc = { n: number; s: number };
  const acc = (arr: (Acc | undefined)[], s: number, v: number) => { if (s < 0 || s >= nSec) return; if (!arr[s]) arr[s] = { n: 0, s: 0 }; arr[s].n++; arr[s].s += v; };
  const gA: (Acc | undefined)[] = [], bA: (Acc | undefined)[] = [], geA: (Acc | undefined)[] = [], smA: (Acc | undefined)[] = [];

  // 원고(종이)를 두 손으로 들고 있는 프레임: 두 손목이 가까이 붙어 가슴 높이에 있음.
  // 이때 손이 함께 흔들리는 건 종이가 움직이는 거지 손짓이 아니라서 제스처로 세지 않아요.
  // 제품·기기를 들고 보여 주는 발표는 들고 있는 게 정상이라 빼요(보여 주기에서 따로 봐요).
  const holdsThing = aid === 'product' || aid === 'device';
  const heldScript = V.map((f) => {
    if (holdsThing || !f.pose || !f.lw || !f.rw || !f.sw) return false;
    const dx = Math.abs(f.lw.x - f.rw.x) / f.sw, dy = Math.abs(f.lw.y - f.rw.y) / f.sw;
    const h = ((f.lw.y + f.rw.y) / 2 - f.smy) / f.sw; // 어깨선 아래로 얼마나(어깨 너비 단위)
    return dx < 1.3 && dy < 0.5 && h > -0.1 && h < 0.62;
  });
  // 손 움직임 속도
  const active = V.map(() => false);
  for (let i = 1; i < V.length; i++) {
    const f = V[i], p = V[i - 1];
    if (!f.pose || !p.pose) continue;
    const dt = f.t - p.t;
    if (dt <= 0 || dt > 0.4) continue;
    const hipY = f.hipVis && f.hipY != null ? f.hipY : f.smy + f.sw * 1.2;
    let sp = 0;
    for (const k of ['lw', 'rw'] as const) {
      const a = f[k], b = p[k];
      if (!a || !b) continue;
      if (posture === 'standing' && a.y > hipY) continue;
      sp = Math.max(sp, Math.hypot(a.x - b.x, a.y - b.y) / f.sw / dt);
    }
    active[i] = sp > 0.8 && !heldScript[i];
  }
  for (let i = 0; i < V.length; i++) {
    const s = Math.floor(V[i].t);
    if (cls[i].gaze != null) acc(gA, s, cls[i].gaze ? 1 : 0);
    if (cls[i].bad != null) acc(bA, s, cls[i].bad ? 1 : 0);
    if (V[i].pose) acc(geA, s, active[i] ? 1 : 0);
    const vf = V[i];
    if (vf.face) acc(smA, s, vf.smile > 0.35 ? 1 : 0);
  }
  for (let s = 0; s < nSec; s++) {
    const ratio = (a: Acc | undefined) => (a && a.n >= 2 ? a.s / a.n : null);
    gazeSec[s] = ratio(gA[s]) ?? gazeSec[s];
    badSec[s] = ratio(bA[s]) ?? badSec[s];
    gestSec[s] = ratio(geA[s]) ?? gestSec[s];
    smileSec[s] = ratio(smA[s]) ?? smileSec[s];
  }

  // 시선
  let gazeRatio = null, downRatio = 0;
  let spread: { side: number; balance: number; issue?: 'center' | 'oneSide' | null } | null = null;
  if (faceOK) {
    const gf = cls.filter((c) => c.gaze != null);
    gazeRatio = gf.filter((c) => c.gaze).length / gf.length;
    const off = gf.filter((c) => !c.gaze);
    downRatio = off.length ? off.filter((c) => c.lookDown).length / off.length : 0;
    // 청중이 여럿이면 시선을 나눴는지: 옆을 본 비율, 양옆 균형
    if (audience === 'room') {
      const on = gf.filter((c) => c.gaze);
      const s1 = on.filter((c) => c.zone === 'S1').length, s2 = on.filter((c) => c.zone === 'S2').length;
      if (on.length * dtV >= 15) {
        spread = { side: (s1 + s2) / on.length, balance: Math.max(s1, s2) ? Math.min(s1, s2) / Math.max(s1, s2) : 0 };
        spread.issue = spread.side < 0.1 ? 'center' : spread.side >= 0.2 && spread.balance < 0.25 ? 'oneSide' : null;
      }
    }
    const idx = V.map((f, i) => i).filter((i) => cls[i].gaze != null);
    let offVals = idx.map((i) => !cls[i].gaze);
    offVals = smoothRuns(offVals, false, Math.round(0.4 / dtV));
    const rs = boolRuns(idx.map((i) => V[i].t), offVals, dtV).filter((r) => r.v && r.t1 - r.t0 >= 2.5);
    rs.forEach((r) => {
      const inR = idx.filter((i) => V[i].t >= r.t0 && V[i].t < r.t1);
      const down = inR.filter((i) => cls[i].lookDown).length / Math.max(1, inR.length) > 0.5;
      const d = r.t1 - r.t0;
      pushIssue({ t0: r.t0, t1: r.t1, cat: 'gaze', sev: d >= 6 ? 3 : d >= 4 ? 2 : 1,
        title: down ? '아래(원고)를 내려다봄' : '시선이 카메라를 벗어남',
        detail: `${d.toFixed(1)}초 동안 ${down ? '시선이 아래를 향했어요' : '카메라가 아닌 다른 곳을 봤어요'}.` });
    });
  }

  // 자세
  let goodFrac = null, briefBad = 0, swayFrac = 0, mainIssue = null, mainReason: string | null = null, framingPenalty = 0;
  if (poseOK) {
    const idx = V.map((f, i) => i).filter((i) => cls[i].bad != null);
    let vals = idx.map((i) => cls[i].bad === true);
    vals = smoothRuns(vals, false, Math.round(0.5 / dtV));
    const rs = boolRuns(idx.map((i) => V[i].t), vals, dtV).filter((r) => r.v);
    const longBad = rs.filter((r) => r.t1 - r.t0 >= 2);
    const poseTime = idx.length * dtV;
    goodFrac = clamp(1 - sum(longBad.map((r) => r.t1 - r.t0)) / Math.max(1, poseTime), 0, 1);
    // 2초 안 되는 짧은 흐트러짐(문제 구간엔 안 올리지만 점수엔 조금 반영)
    briefBad = clamp(sum(rs.filter((r) => r.t1 - r.t0 < 2).map((r) => r.t1 - r.t0)) / Math.max(1, poseTime), 0, 1);
    const reasonTotals: Record<string, number> = {};
    longBad.filter((r) => r.t1 - r.t0 >= 3).forEach((r) => {
      const counts: Record<string, number> = {};
      idx.forEach((i) => { if (V[i].t >= r.t0 && V[i].t < r.t1) cls[i].reasons.forEach((k) => { counts[k] = (counts[k] || 0) + 1; }); });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'slouch';
      reasonTotals[top] = (reasonTotals[top] || 0) + (r.t1 - r.t0);
      const d = r.t1 - r.t0;
      pushIssue({ t0: r.t0, t1: r.t1, cat: 'posture', sev: d >= 8 ? 3 : d >= 5 ? 2 : 1, title: `${REASON_TEXT[top]} 자세`, detail: `${d.toFixed(1)}초 동안 이어졌어요.`, reason: top });
    });
    const topReason = Object.entries(reasonTotals).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topReason) { mainIssue = `${REASON_TEXT[topReason]} 자세가 보인`; mainReason = topReason; }

    // 좌우 흔들림
    const P = V.filter((f): f is PoseFrame => f.pose);
    const xs = P.map((f) => (posture === 'standing' ? (f.hipVis && f.hipX != null ? f.hipX : f.smx) : f.nosePx) / f.sw);
    const hp = xs.map((x, i) => {
      const a = lowerBound(P, P[i].t - 1), b = lowerBound(P, P[i].t + 1);
      return x - mean(xs.slice(a, Math.max(a + 1, b)));
    });
    const swayThr = posture === 'standing' ? 0.07 : 0.05;
    const swaySec = new Array(nSec).fill(false);
    for (let s = 0; s < nSec; s++) {
      const a = lowerBound(P, s - 1.5), b = lowerBound(P, s + 1.5);
      if (b - a >= 8) swaySec[s] = std(hp.slice(a, b)) > swayThr;
    }
    const countable = swaySec.length || 1;
    swayFrac = swaySec.filter(Boolean).length / countable;
    secRuns((s) => swaySec[s], 4).forEach((r) => pushIssue({ t0: r.t0, t1: r.t1, cat: 'posture', sev: r.t1 - r.t0 >= 8 ? 2 : 1, title: '몸이 좌우로 흔들림', detail: '같은 자리에서 반복적으로 흔들리면 불안해 보일 수 있어요.' }));

    // 화면 구도
    if (posture === 'seated') {
      const swf = median(P.map((f) => f.swFrame));
      const ny = median(P.map((f) => f.noseY));
      if (swf < 0.2) { limits.push('카메라와 거리가 멀어요. 어깨가 화면 너비의 1/3쯤 차지하도록 가까이 앉으세요.'); framingPenalty += 8; }
      if (swf > 0.68) { limits.push('카메라와 너무 가까워요. 조금 뒤로 앉아 어깨가 다 보이게 하세요.'); framingPenalty += 8; }
      if (ny > 0.55) { limits.push('얼굴이 화면 아래쪽에 있어요. 카메라를 눈높이로 올리세요.'); framingPenalty += 7; }
    } else {
      const fb = P.filter((f) => f.fullBody).length / P.length;
      if (fb < 0.6) limits.push('전신이 다 보이지 않아 하체 움직임은 분석하지 못했어요.');
    }
  }

  // 제스처
  let gestureRatio = null;
  const gRange = T.gesture[posture];
  let scriptHeld = 0;
  if (poseOK) {
    gestureRatio = active.filter((a, i) => V[i].pose && a).length / Math.max(1, poseFrames);
    scriptHeld = heldScript.filter(Boolean).length / Math.max(1, poseFrames);
    if (scriptHeld >= 0.5) {
      const heldN = new Array(nSec).fill(0);
      V.forEach((f, i) => { const s = Math.floor(f.t); if (heldScript[i] && s >= 0 && s < nSec) heldN[s]++; });
      secRuns((s) => heldN[s] >= 2, 4).slice(0, 1).forEach((r) => pushIssue({
        t0: r.t0, t1: r.t1, cat: 'gesture', sev: 2, title: '원고를 두 손으로 든 채 말함', detail: `${r.t1 - r.t0}초 동안 두 손이 원고에 묶여 손짓을 쓰지 못했어요.`,
      }));
    }
    if (gRange[0] >= 0.1) {
      secRuns((s) => gestSec[s] != null && gestSec[s] === 0 && voicedSec[s] > 0.4, 20).slice(0, 2).forEach((r) => pushIssue({
        t0: r.t0, t1: r.t1, cat: 'gesture', sev: 1, title: '손이 오래 멈춰 있음', detail: `${r.t1 - r.t0}초 동안 손짓 없이 말했어요.`,
      }));
    }
  }
  const smileRatio = faceOK ? mean(smileSec.filter((v) => v != null)) : null;

  // ---------- 내용 ----------
  const checks = contentAnalysis(finals, purpose, setup, dur);
  const judged = checks.filter((c) => c.pass != null);

  // ---------- 항목 점수 ----------
  const mk = (id: CatId, score: number | null, dir: Dir, value: CatResult['value'], raw: number | null, target: string, extra: CatResult['extra'] = {}) => {
    cats[id] = { id, label: CAT_LABEL[id], score: score == null ? null : Math.round(score), status: statusOf(score), dir, value, raw, target, extra };
  };
  // 속도
  if (spm != null) {
    const s = rangeScore(spm, T.spm, 80) - 40 * (fastFrac + slowFrac * 0.5);
    mk('pace', clamp(s, 0, 100), dirOf(spm, T.spm), Math.round(spm), spm, `${lo}–${hi}음절/분`, { fastFrac, source: rateSource });
  } else mk('pace', null, null, null, null, `${lo}–${hi}음절/분`);
  // 쉼
  if (pauseRatio != null) {
    const longSilN = silences.filter((r) => r.t1 - r.t0 >= 3).length;
    const s = 0.6 * rangeScore(pauseRatio, T.pause, 0.15) + 0.4 * clamp(100 - 25 * longRuns.length - 8 * longSilN, 0, 100);
    mk('pause', s, dirOf(pauseRatio, T.pause), `${Math.round(pauseRatio * 100)}%`, pauseRatio, `${Math.round(T.pause[0] * 100)}–${Math.round(T.pause[1] * 100)}%`, { longRuns: longRuns.length, longSil: longSilN });
  } else mk('pause', null, null, null, null, '');
  // 톤
  if (pitchVar != null) {
    const pS = rangeScore(pitchVar, T.pitch, 2);
    const fS = fadeRatio == null ? 100 : fadeRatio <= T.fade ? 100 : clamp(100 - ((fadeRatio - T.fade) / 0.4) * 100, 0, 100);
    mk('tone', 0.6 * pS + 0.4 * fS, dirOf(pitchVar, T.pitch), round(pitchVar, 1), pitchVar, `${T.pitch[0]}–${T.pitch[1]}반음`, { fadeRatio, fadeHigh: fadeRatio != null && fadeRatio > T.fade && pS >= 70 });
  } else mk('tone', null, null, null, null, `${T.pitch[0]}–${T.pitch[1]}반음`);
  // 시선
  if (gazeRatio != null) {
    // 목표를 넘으면 85→100(늘 렌즈를 보면 100), 못 미치면 85 에서 깎여요
    const ideal = 1;
    const s = gazeRatio >= T.gaze
      ? IN_RANGE_MIN + (100 - IN_RANGE_MIN) * Math.min(1, (gazeRatio - T.gaze) / (ideal - T.gaze))
      : clamp(IN_RANGE_MIN - ((T.gaze - gazeRatio) / T.gaze) * 102, 0, 100);
    // 청중이 여럿인데 한 사람(또는 한쪽)만 봤으면 감점
    const spreadPen = spread?.issue === 'center' ? 10 : spread?.issue === 'oneSide' ? 8 : 0;
    mk('gaze', clamp(s - spreadPen, 0, 100), gazeRatio >= T.gaze ? 'ok' : 'low', `${Math.round(gazeRatio * 100)}%`, gazeRatio, `${Math.round(T.gaze * 100)}% 이상`, { downRatio, smileRatio, audience, spread });
  } else mk('gaze', null, null, null, null, `${Math.round(T.gaze * 100)}% 이상`);
  // 자세
  if (goodFrac != null) {
    // 목표(85%) 이상이면 85→100 사이로, 못 미치면 비율 그대로. 짧은 흐트러짐·흔들림·구도는 감점.
    const base = goodFrac >= 0.85 ? IN_RANGE_MIN + (100 - IN_RANGE_MIN) * (goodFrac - 0.85) / 0.15 : 100 * goodFrac;
    const s = base - Math.min(10, briefBad * 80) - Math.min(25, swayFrac * 60) - framingPenalty;
    mk('posture', clamp(s, 0, 100), null, `${Math.round(goodFrac * 100)}%`, goodFrac, '바른 자세 85% 이상', { swayFrac, mainIssue, mainReason });
  } else mk('posture', null, null, null, null, '');
  // 제스처
  if (gestureRatio != null) {
    // 원고를 들고 있던 시간만큼 손짓을 쓸 수 없었던 거라 깎아요(대부분 들고 있었으면 크게)
    const held = scriptHeld >= 0.5 ? 45 * Math.min(1, (scriptHeld - 0.3) / 0.6) : 0;
    mk('gesture', clamp(rangeScore(gestureRatio, gRange, 0.2) - held, 0, 100), scriptHeld >= 0.5 ? 'low' : dirOf(gestureRatio, gRange),
      scriptHeld >= 0.5 ? `원고 든 시간 ${Math.round(scriptHeld * 100)}%` : `${Math.round(gestureRatio * 100)}%`, gestureRatio,
      scriptHeld >= 0.5 ? `손이 자유로운 상태로 손짓 ${Math.round(gRange[0] * 100)}–${Math.round(gRange[1] * 100)}%` : `${Math.round(gRange[0] * 100)}–${Math.round(gRange[1] * 100)}%`, { scriptHeld });
  } else mk('gesture', null, null, null, null, '');
  // 보여 주기
  // 30초 안 되는 녹화에서 한 번도 안 가리켰다고 "적다"고 하긴 일러요
  if (showing && (showing.events.length || dur >= 30)) {
    const r = deliveryOf(purpose.id).show;
    mk('showing', showing.score, showing.perMin < r[0] ? 'low' : showing.perMin > r[1] ? 'high' : 'ok', `${showing.events.length}회`, showing.perMin, `분당 ${r[0]}–${r[1]}회`,
      { aid, main: showing.main, perMin: showing.perMin, returnRate: showing.returnRate, keyCover: showing.keyCover, keys: showing.keys, cross: showing.cross, face: showing.face, brief: showing.brief });
  } else mk('showing', null, null, null, null, '', { aid });
  // 군더더기
  if (fillerPerMin != null) {
    const s = fillerPerMin <= T.filler
      ? 100 - (100 - IN_RANGE_MIN) * (T.filler > 0 ? fillerPerMin / T.filler : 0)
      : clamp(IN_RANGE_MIN - (fillerPerMin - T.filler) * 13, 0, 100);
    const top = Object.entries(fillerCount).sort((a, b) => b[1] - a[1]);
    mk('filler', s, fillerPerMin > T.filler ? 'high' : 'ok', round(fillerPerMin, 1), fillerPerMin, `분당 ${T.filler}번 이하`, { top, count: fillerN });
  } else mk('filler', null, null, null, null, `분당 ${T.filler}번 이하`);
  // 내용
  if (judged.length) {
    const s = (judged.filter((c) => c.pass).length / judged.length) * 100;
    mk('content', s, null, `${judged.filter((c) => c.pass).length}/${judged.length}`, s, '점검 항목 모두 통과', { checks });
  } else mk('content', null, null, null, null, '', { checks });
  // 시간
  {
    const tgt = setup.targetSec;
    const dev = (dur - tgt) / tgt;
    const s = Math.abs(dev) <= 0.1 ? 100 - (100 - IN_RANGE_MIN) * (Math.abs(dev) / 0.1) : clamp(IN_RANGE_MIN * (1 - (Math.abs(dev) - 0.1) / 0.4), 0, 100);
    mk('time', s, dev > 0.1 ? 'high' : dev < -0.1 ? 'low' : 'ok', Math.round(dur), dur, `${Math.round(tgt)}초 ±10%`, { overSec: Math.round(dur - tgt), underSec: Math.round(tgt - dur) });
  }

  // ---------- 종합 점수 ----------
  const outs = pickOutcomes(purpose, setup);
  const weightOf = (id: CatId) => (purpose.weights[id] || 1) * outcomeWeight(outs, id);
  // 리허설이 성립했는지: 너무 짧거나 목소리가 거의 없으면 카메라 항목만으로 점수를 내지 않아요
  // (가만히 렌즈만 보고 있어도 시선·자세가 높게 나와서 50점대가 나오던 문제).
  const voiceSec = pitched.length * dtA;
  const invalid = dur < MIN_REHEARSAL_SEC
    ? `녹화가 ${Math.round(dur)}초로 너무 짧아요. ${MIN_REHEARSAL_SEC}초 이상 말해 주세요.`
    : voiceSec < Math.max(MIN_VOICE_SEC, dur * MIN_VOICE_FRAC)
      ? '말소리가 거의 들리지 않았어요. 마이크가 켜져 있는지 확인하고, 실제로 발표하듯 말해 주세요.'
      : null;
  const avail = invalid ? [] : Object.values(cats).filter((c) => c.score != null);
  const avg = avail.length ? Math.round(sum(avail.map((c) => (c.score ?? 0) * weightOf(c.id))) / sum(avail.map((c) => weightOf(c.id)))) : null;
  // 말이 거의 알아들을 수 없었으면 카메라 항목이 좋아도 종합 점수를 낮게 묶어요.
  const overall = avg != null && clarity === 'low' ? Math.min(avg, UNCLEAR_CAP) : avg;

  // 문제 구간 정리: 같은 종류는 심각한 순으로 최대 6개
  const byKey: Record<string, Issue[]> = {};
  for (const is of issues) (byKey[is.cat + is.title] ||= []).push(is);
  const finalIssues = Object.values(byKey).flatMap((list) => list.sort((a, b) => b.sev * (b.t1 - b.t0) - a.sev * (a.t1 - a.t0)).slice(0, 6)).sort((a, b) => a.t0 - b.t0);

  const series = { nSec, speech, rateSec, gazeSec, badSec, gestSec, voicedSec, fillerTimes };
  const highlights = pickHighlights({ dur, nSec, series, purpose, posture, finalIssues, weightOf, windowPitchStd });

  if (dur < 20) limits.push('녹화가 20초보다 짧아 지표가 불안정할 수 있어요. 1분 이상 녹화하면 더 정확합니다.');
  if (transcript?.error) limits.push(transcript.error);
  if (rateSource === 'transcript') limits.push('음성 인식은 “어”, “음” 같은 소리를 받아쓰지 않을 때가 많아서, 군더더기 말 횟수가 실제보다 적게 나올 수 있어요.');

  return { invalid, voiceSec, dur, overall, clarity, clarityRatio, cats, issues: finalIssues, highlights, series, finals, rateSource, limits, smileRatio, calib, thr };
}

// ---------------- 하이라이트 ----------------
type Series = { nSec: number; speech: BoolRun[]; rateSec: (number | null)[]; gazeSec: (number | null)[]; badSec: (number | null)[]; gestSec: (number | null)[]; voicedSec: number[]; fillerTimes: { t: number; w: string }[] };
type HighlightInput = { dur: number; nSec: number; series: Series; purpose: Purpose; posture: PostureId; finalIssues: Issue[]; weightOf: (id: CatId) => number; windowPitchStd: (a: number, b: number) => number | null };
type Sig = Partial<Record<'pace' | 'gaze' | 'posture' | 'gesture' | 'tone', number | null>>;
function pickHighlights({ dur, nSec, series, purpose, posture, finalIssues, weightOf, windowPitchStd }: HighlightInput) {
  const { rateSec, gazeSec, badSec, gestSec, voicedSec } = series;
  const [lo, hi] = purpose.targets.spm;
  const gRange = purpose.targets.gesture[posture];
  const W = 8;
  const cands: { t0: number; t1: number; score: number; reasons: (keyof Sig)[]; sig: Sig }[] = [];
  for (let s = 0; s + W <= nSec; s++) {
    const secs = [...Array(W)].map((_, k) => s + k);
    const vfrac = sum(secs.map((k) => voicedSec[k])) / W;
    if (vfrac < 0.5) continue;
    const sig: Sig = {};
    const avg = (f: (k: number) => number | null) => { const v = secs.map(f).filter((x): x is number => x != null); return v.length >= W / 2 ? mean(v) : null; };
    sig.pace = avg((k) => (rateSec[k] == null ? null : rateSec[k] >= lo - 15 && rateSec[k] <= hi + 15 ? 1 : 0));
    sig.gaze = avg((k) => gazeSec[k]);
    sig.posture = avg((k) => (badSec[k] == null ? null : 1 - badSec[k]));
    if (gRange[0] >= 0.08) sig.gesture = avg((k) => (gestSec[k] == null ? null : Math.min(1, gestSec[k] * 3)));
    const sd = windowPitchStd(s, s + W);
    if (sd != null) sig.tone = Math.min(1, sd / purpose.targets.pitch[0]);
    const vals = Object.values(sig).filter((v): v is number => v != null);
    if (vals.length < 2) continue;
    let score = mean(vals);
    if (finalIssues.some((i) => i.sev >= 2 && i.t0 < s + W && i.t1 > s)) score -= 0.2;
    const reasons = (Object.entries(sig) as [keyof Sig, number | null][]).filter(([, v]) => v != null && v >= 0.85).map(([k]) => k);
    cands.push({ t0: s, t1: s + W, score, reasons, sig });
  }
  const STR_TITLE: Record<keyof Sig, string> = { gaze: '시선이 흔들림 없던 구간', tone: '억양이 살아 있던 구간', gesture: '손짓이 말을 받쳐 준 구간', pace: '속도가 가장 알맞았던 구간', posture: '자세가 가장 안정적이던 구간' };
  const STR_REASON: Record<keyof Sig, string> = { gaze: '카메라 응시', tone: '억양 변화', gesture: '손짓 활용', pace: '알맞은 속도', posture: '안정된 자세' };
  const strengths: Highlight[] = [];
  for (const c of cands.sort((a, b) => b.score - a.score)) {
    if (strengths.length >= 3) break;
    if (c.score < 0.72 || c.reasons.length < 2) continue;
    if (strengths.some((x) => c.t0 < x.t1 + 2 && c.t1 > x.t0 - 2)) continue;
    const lead = [...c.reasons].sort((a, b) => (c.sig[b] ?? 0) - (c.sig[a] ?? 0))[0];
    strengths.push({ kind: 'strength', t0: c.t0, t1: Math.min(dur, c.t1), title: STR_TITLE[lead], reasons: c.reasons.map((r) => STR_REASON[r]), score: c.score, cat: lead });
  }
  const weaknesses: Highlight[] = [];
  const ranked = [...finalIssues].sort((a, b) => b.sev * Math.min(b.t1 - b.t0, 10) * weightOf(b.cat) - a.sev * Math.min(a.t1 - a.t0, 10) * weightOf(a.cat));
  for (const is of ranked) {
    if (weaknesses.length >= 3) break;
    const t0 = Math.max(0, is.t0 - 1.5);
    const t1 = Math.min(dur, Math.max(is.t1 + 1.5, t0 + 5), t0 + 15);
    if (weaknesses.some((x) => t0 < x.t1 && t1 > x.t0)) continue;
    if (weaknesses.some((x) => x.title === is.title) && ranked.length > 3) continue;
    weaknesses.push({ kind: 'weakness', t0, t1, title: is.title, reasons: [is.detail], cat: is.cat, issueId: is.id, sev: is.sev });
  }
  return { strengths: strengths.sort((a, b) => a.t0 - b.t0), weaknesses: weaknesses.sort((a, b) => a.t0 - b.t0) };
}
