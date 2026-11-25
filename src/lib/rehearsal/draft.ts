// 리허설 설정 초안. 마법사에서 고른 값을 이 기기에 저장해 두고 다음 리허설에 이어 써요.
import type { CustomGoal, Setup } from '@/lib/coach/types';
import { aidOf, type AidId } from '@/lib/delivery';
import { PURPOSE_BY_ID, type Outcome, type PostureId, type Purpose } from '@/lib/scenarios';

export type CustomPurpose = { name: string; base: string };
export type Draft = {
  purposeId: string;
  posture: PostureId;
  customPurpose: CustomPurpose | null;
  customGoal: CustomGoal | null;
  outcomeIdxs: number[];
  targetSec: number | null;
  worry: string | null;
  prompt: string;
  hasScript: 'yes' | 'no';
  script: string;
  key: string;
  /** 리허설 제목. 같은 제목끼리 한 발표의 연습 회차로 묶어요. */
  title: string;
  /** 무엇을 보여 주나요(면접은 대면/화상). null 이면 목적 기본값 */
  aid: AidId | null;
};

const KEY = 'rc-setup-v2';
const DEFAULT: Draft = {
  purposeId: 'interview', posture: 'seated', customPurpose: null, customGoal: null, outcomeIdxs: [0],
  targetSec: null, worry: null, prompt: '', hasScript: 'yes', script: '', key: '', title: '', aid: null,
};

export function loadDraft(): Draft {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Draft> & { outcomeIdx?: number };
    const d = { ...DEFAULT, ...s };
    if (!Array.isArray(d.outcomeIdxs)) d.outcomeIdxs = [s.outcomeIdx ?? 0];
    if (!PURPOSE_BY_ID[d.purposeId]) d.purposeId = DEFAULT.purposeId;
    return d;
  } catch { return { ...DEFAULT }; }
}
export function saveDraft(d: Draft) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 저장 못 해도 이번 리허설은 계속돼요 */ }
}
/** 새 리허설은 지난 대본·메모를 비우고 시작해요. 예시는 placeholder 로만 보여 줘요. */
export const clearText = (d: Draft): Draft => ({ ...d, script: '', key: '', prompt: '', hasScript: 'yes', title: '' });
/** 제목을 비워 두면 쓰는 이름(같은 상황끼리 묶여요) */
export const defaultTitle = (d: Draft) => `${d.customPurpose?.name || purposeOf(d).label} 리허설`;
/** 발표 유형을 바꾸면 그 유형에 묶인 목표·시간을 처음 값으로 돌려요. */
export const withPurpose = (d: Draft, purposeId: string): Draft =>
  purposeId === d.purposeId ? d : { ...d, purposeId, outcomeIdxs: [0], customGoal: null, targetSec: null, aid: null };

export const purposeOf = (d: Draft): Purpose => PURPOSE_BY_ID[d.purposeId];
export const pickedOutcomes = (d: Draft): Outcome[] => d.outcomeIdxs.map((i) => purposeOf(d).outcomes[i]).filter(Boolean);
export const outcomeLabel = (d: Draft) => [...pickedOutcomes(d), ...(d.customGoal ? [d.customGoal] : [])].map((o) => o.label).join(' · ');

// 목적별 실제 발표 길이
export const TIME_OPTIONS: Record<string, [number, string][]> = {
  interview: [[60, '1분 자기소개'], [90, '1분 30초 자기소개'], [120, '경험·지원 동기 답변'], [300, 'PT 면접 (짧게)'], [600, 'PT 면접']],
  ir: [[60, '엘리베이터 피치'], [180, '데모데이 피치'], [300, '피칭 대회·오디션'], [600, '투자사 첫 미팅'], [1200, '풀 피치 (10/20/30 규칙의 20분)']],
  report: [[60, '복도에서 1분 보고'], [180, '짧은 구두 보고'], [300, '주간·현황 보고'], [600, '의사결정 회의'], [1200, '분기 리뷰']],
  lecture: [[300, '한 개념 리허설'], [600, '마이크로 강의'], [900, '워크숍 한 세션'], [1200, '세션 강의'], [1800, '정규 강의 한 파트']],
  conference: [[180, '3분 연구 발표'], [300, '라이트닝 토크'], [600, '구두 발표'], [900, '정규 세션 발표'], [1200, '초청 강연']],
  capstone: [[180, '아이디어 피치'], [300, '중간 발표'], [600, '졸업 프로젝트 발표'], [900, '최종 발표 · 데모 포함'], [1200, '학위 논문 발표']],
  speech: [[60, '짧은 건배사'], [120, '짧은 축사'], [180, '축사·인사말'], [300, '긴 기념사']],
};
export const timeOpts = (d: Draft) => TIME_OPTIONS[d.purposeId] ?? TIME_OPTIONS.report;

/** 고른 목표가 권하는 길이에 표를 던져 추천 시간을 정해요. 먼저 고른 목표일수록 표가 많아요. */
export function recommendTime(d: Draft): { sec: number; why: string } {
  const p = purposeOf(d);
  const opts = timeOpts(d).map(([s]) => s);
  const votes = new Map<number, number>();
  pickedOutcomes(d).forEach((o, k) => { if (o.sec && opts.includes(o.sec)) votes.set(o.sec, (votes.get(o.sec) ?? 0) + 3 - k); });
  if (!votes.size) return { sec: p.targetSec, why: `${p.label}에서 가장 흔한 길이예요` };
  const sec = [...votes].sort((a, b) => b[1] - a[1])[0][0];
  const by = pickedOutcomes(d).find((o) => o.sec === sec)!;
  return { sec, why: `‘${by.label}’에 맞춘 길이예요` };
}
export const targetSecOf = (d: Draft) => d.targetSec ?? recommendTime(d).sec;

// 가장 큰 고민 하나로 자기 인식 비교에 쓸 성향을 만들어요.
export const WORRIES: { id: string; label: string; sub?: string }[] = [
  { id: 'selfFast', label: '긴장하면 말이 빨라져요' },
  { id: 'selfMono', label: '목소리가 단조로워요' },
  { id: 'selfFiller', label: '“어, 음, 이제”를 자주 써요' },
  { id: 'selfGaze', label: '시선 처리가 어려워요' },
  { id: 'selfGesture', label: '손을 어떻게 할지 모르겠어요' },
  { id: 'selfStructure', label: '결론부터 말하기가 어려워요' },
  { id: 'anxiety', label: '너무 긴장돼요', sub: '잘한 점부터 보여드리고, 고칠 점은 두 가지만 골라 드려요' },
];
export const profileFrom = (worry: string | null) => {
  if (!worry) return null;
  const p: Record<string, number> = Object.fromEntries(WORRIES.map((w) => [w.id, 3]));
  p[worry] = 5;
  return p;
};

/** 분석에 넘길 설정. 주제는 리허설 제목, 핵심 메시지는 사용자가 직접 적은 값. */
export function toSetup(d: Draft): Setup {
  return {
    purposeId: d.purposeId,
    purposeName: d.customPurpose?.name,
    posture: d.posture,
    outcomeIdxs: d.outcomeIdxs,
    customGoal: d.customGoal,
    targetSec: targetSecOf(d),
    topic: d.title.trim() || defaultTitle(d),
    aid: aidOf(d.purposeId, d.aid),
    keyMessage: d.key.trim(),
    outcomeText: '',
    profile: profileFrom(d.worry),
  };
}

export const CUSTOM_WARN = '직접 입력한 내용에는 검증된 기준표가 따로 없어요. 그래서 고른 유형과 항목의 기준으로 코칭하고, 적은 내용은 리포트 문구와 내용 점검에만 반영해요. 적는 방식에 따라 코칭이 덜 정확할 수 있어요.';

export const SCRIPT_EXAMPLES: Record<string, string> = {
  interview: '안녕하세요, 마케팅 직무에 지원한 김하늘입니다.\n지난 캠페인에서 데이터를 다시 읽는 것만으로 전환율을 두 배로 올렸습니다.\n숫자로 증명하는 마케터가 되겠습니다.',
  ir: '안녕하세요. 저희는 발표 연습을 돕는 서비스를 만들었습니다.\n사용자는 지난 석 달 동안 두 배로 늘었습니다.\n이제 다음 단계로 투자를 요청드립니다.',
  report: '결론부터 말씀드리겠습니다. 3분기 광고비를 20% 줄이고도 전환은 유지했습니다.\n근거는 세 가지입니다.\n4분기 예산은 같은 방식으로 승인 부탁드립니다.',
  lecture: '오늘은 피싱 메일을 구별하는 방법 세 가지를 알아보겠습니다.\n먼저 보낸 사람 주소부터 보겠습니다.\n의심되면 클릭하기 전에 꼭 물어보세요.',
  conference: '긴장하면 말이 얼마나 빨라질까요?\n저희는 대학생 120명의 발표를 분석했습니다.\n그 결과 평균 15% 빨라졌습니다.',
  capstone: '저희 팀은 시각장애인을 위한 음성 길안내 앱을 만들었습니다.\n문제는 기존 앱이 화면을 봐야만 쓸 수 있다는 점이었습니다.\n세 번의 탭으로 목적지까지 안내합니다.',
  speech: '안녕하세요, 신랑의 대학 동기 김하늘입니다.\n신입생 때 처음 만난 날을 아직도 기억합니다.\n두 사람이 서로의 가장 든든한 편이 되길 바랍니다.',
};
export const PROMPT_COPY = {
  yes: { title: '발표 대본을 넣어 주세요', sub: '녹화 전에 시간·흐름·긴 문장을 점검하고, AI 코칭으로 고칠 문장과 말하는 방법까지 받아요.' },
  no: { title: '제목과 핵심 메시지만 적어 주세요', sub: '대본 코칭은 건너뛰어요. 말한 내용은 녹화한 뒤 받아쓰기로 확인해요.' },
};
