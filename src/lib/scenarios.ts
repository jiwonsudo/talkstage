// 발표 상황, 자가진단 문항, 평가 항목 정의
// 모든 기준값은 프로토타입용 추정치이며 한국어 발화 데이터로 보정이 필요합니다.

export type PostureId = 'seated' | 'standing';
export type CatId = 'pace' | 'pause' | 'tone' | 'gaze' | 'posture' | 'gesture' | 'showing' | 'filler' | 'content' | 'time';
export type Range = [number, number];
export type Outcome = { label: string; cta: boolean; focus: CatId; sec?: number };
export type Purpose = {
  id: string;
  label: string;
  summary: string;
  targetSec: number;
  targets: { spm: Range; pause: Range; pitch: Range; gaze: number; gesture: Record<PostureId, Range>; filler: number; fade: number };
  weights: Record<CatId, number>;
  contentChecks: string[];
  outcomes: Outcome[];
  tips: string[];
};

export const POSTURES: Record<PostureId, { id: PostureId; label: string; desc: string; framing: string }> = {
  seated: {
    id: 'seated',
    label: '앉아서',
    desc: '상반신 · 화상 면접, 온라인 발표',
    framing: '카메라를 눈높이에 두고, 가슴 위까지 화면에 들어오게 앉으세요.',
  },
  standing: {
    id: 'standing',
    label: '서서',
    desc: '전신 · 무대, 회의실 발표',
    framing: '카메라에서 2–3m 떨어져 머리부터 발끝까지 들어오게 서세요.',
  },
};

export const CATS: { id: CatId; label: string }[] = [
  { id: 'pace', label: '말 빠르기' },
  { id: 'pause', label: '호흡·쉼' },
  { id: 'tone', label: '톤·억양' },
  { id: 'gaze', label: '시선' },
  { id: 'posture', label: '자세' },
  { id: 'gesture', label: '제스처' },
  { id: 'showing', label: '보여 주기' },
  { id: 'filler', label: '군더더기 말' },
  { id: 'content', label: '내용 구조' },
  { id: 'time', label: '시간 관리' },
];
export const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.id, c.label])) as Record<CatId, string>;

// spm: 분당 음절(쉼 포함, 2초 이상 침묵 제외) · pause: 발화 구간 중 쉼 비율
// pitch: 음높이 변화(반음 표준편차) · gaze: 카메라 응시 최소 비율
// gesture: 손짓이 움직이는 시간 비율 · filler: 분당 허용 횟수 · fade: 말끝 흐림 허용 비율
export const PURPOSES: Purpose[] = [
  {
    id: 'interview',
    label: '면접',
    summary: '결론부터 차분하고 또렷하게. 신뢰감이 핵심이에요.',
    targetSec: 60,
    targets: {
      spm: [260, 320], pause: [0.15, 0.28], pitch: [2.0, 4.5], gaze: 0.75,
      gesture: { seated: [0.03, 0.2], standing: [0.05, 0.25] }, filler: 2, fade: 0.25,
    },
    weights: { pace: 1, pause: 1, tone: 0.8, gaze: 1.3, posture: 1.3, gesture: 0.5, filler: 1.2, content: 1.2, time: 0.8, showing: 0.5 },
    contentChecks: ['keyMessage', 'conclusionFirst', 'star'],
    outcomes: [
      { label: '합격 · 다음 전형 진출', cta: false, focus: 'content' },
      { label: '직무 역량을 믿게 하기', cta: false, focus: 'content', sec: 300 },
      { label: '태도·인성에서 신뢰 얻기', cta: false, focus: 'gaze' },
      { label: '첫인상을 또렷하게 남기기', cta: false, focus: 'posture', sec: 60 },
      { label: '경험을 짧고 구조 있게 말하기', cta: false, focus: 'time', sec: 120 },
      { label: '압박 질문에도 차분하게 답하기', cta: false, focus: 'pause', sec: 120 },
      { label: '긴장해도 자신감 있어 보이기', cta: false, focus: 'tone' },
      { label: '지원 동기에 진심 담기', cta: false, focus: 'tone', sec: 120 },
      { label: '말버릇 없이 깔끔하게 답하기', cta: false, focus: 'filler' },
    ],
    tips: [
      '카메라 렌즈를 면접관의 눈이라고 생각하고 바라보세요.',
      '첫 문장에 결론을 말하고, 그다음 한 박자 쉬세요.',
      '말끝을 흐리지 말고 “~습니다”까지 또렷하게 마무리하세요.',
    ],
  },
  {
    id: 'ir',
    label: 'IR 피칭',
    summary: '짧은 시간에 확신을 전달. 에너지와 숫자의 임팩트.',
    targetSec: 600,
    targets: {
      spm: [290, 350], pause: [0.12, 0.24], pitch: [2.8, 6.0], gaze: 0.65,
      gesture: { seated: [0.08, 0.35], standing: [0.15, 0.5] }, filler: 2, fade: 0.2,
    },
    weights: { pace: 1.1, pause: 1, tone: 1.3, gaze: 1, posture: 0.9, gesture: 1, filler: 1, content: 1.3, time: 1.2, showing: 1.3 },
    contentChecks: ['keyMessage', 'numbers', 'contrast', 'cta'],
    outcomes: [
      { label: '후속 미팅 잡기', cta: true, focus: 'content', sec: 600 },
      { label: '투자 의향 받기', cta: true, focus: 'tone', sec: 1200 },
      { label: '피드백·네트워크 얻기', cta: true, focus: 'content', sec: 180 },
      { label: '시장과 숫자로 설득하기', cta: false, focus: 'content', sec: 600 },
      { label: '팀 역량을 믿게 하기', cta: false, focus: 'gaze' },
      { label: '시간 안에 핵심만 전달하기', cta: false, focus: 'time', sec: 180 },
      { label: '데모로 제품 가치 보여주기', cta: false, focus: 'gesture', sec: 300 },
      { label: '날카로운 질문에 침착하게 답하기', cta: false, focus: 'pause' },
    ],
    tips: [
      '핵심 숫자는 말하기 직전과 직후에 1초씩 쉬세요.',
      '문제 → 해결 → 시장 → 성과로 넘어갈 때 톤을 바꾸세요.',
      '손을 가슴 높이에서 펼치면 자신감 있어 보입니다.',
    ],
  },
  {
    id: 'report',
    label: '사내 보고',
    summary: '결론 먼저, 간결하게. 감정보다 정확성.',
    targetSec: 300,
    targets: {
      spm: [270, 330], pause: [0.14, 0.26], pitch: [1.8, 4.0], gaze: 0.6,
      gesture: { seated: [0.03, 0.2], standing: [0.05, 0.3] }, filler: 2.5, fade: 0.3,
    },
    weights: { pace: 1, pause: 1, tone: 0.7, gaze: 1, posture: 1, gesture: 0.6, filler: 1.2, content: 1.4, time: 1.2, showing: 0.9 },
    contentChecks: ['keyMessage', 'conclusionFirst', 'numbers', 'cta'],
    outcomes: [
      { label: '의사결정 · 승인 받기', cta: true, focus: 'content', sec: 600 },
      { label: '현황을 정확히 공유', cta: false, focus: 'pace', sec: 300 },
      { label: '지원 · 리소스 요청', cta: true, focus: 'content', sec: 600 },
      { label: '결론부터 짧게 전달하기', cta: false, focus: 'time', sec: 180 },
      { label: '성과를 숫자로 인정받기', cta: false, focus: 'content', sec: 1200 },
      { label: '문제와 리스크 미리 알리기', cta: false, focus: 'tone', sec: 300 },
      { label: '반대 의견 설득하기', cta: true, focus: 'gaze', sec: 600 },
      { label: '다음 할 일에 합의하기', cta: true, focus: 'pause' },
    ],
    tips: [
      '첫 30초 안에 결론과 요청 사항을 말하세요.',
      '슬라이드를 읽지 말고 핵심만 짚으세요.',
      '큰 제스처보다 안정된 자세가 신뢰를 줍니다.',
    ],
  },
  {
    id: 'lecture',
    label: '강의 · 교육',
    summary: '이해할 시간을 주는 속도. 질문과 반복.',
    targetSec: 600,
    targets: {
      spm: [230, 290], pause: [0.2, 0.34], pitch: [2.5, 5.5], gaze: 0.5,
      gesture: { seated: [0.08, 0.35], standing: [0.15, 0.5] }, filler: 3, fade: 0.3,
    },
    weights: { pace: 1.2, pause: 1.3, tone: 1.1, gaze: 0.8, posture: 0.8, gesture: 1, filler: 1, content: 1.1, time: 0.8, showing: 1.0 },
    contentChecks: ['keyMessage', 'questions', 'recap'],
    outcomes: [
      { label: '핵심 개념 이해', cta: false, focus: 'pause', sec: 600 },
      { label: '실습 · 행동으로 연결', cta: true, focus: 'content', sec: 900 },
      { label: '흥미와 참여 유도', cta: false, focus: 'tone' },
      { label: '끝까지 집중 유지', cta: false, focus: 'gesture', sec: 1200 },
      { label: '어려운 내용을 쉽게 풀기', cta: false, focus: 'pace' },
      { label: '질문이 나오게 하기', cta: true, focus: 'pause', sec: 900 },
      { label: '강사로서 신뢰 얻기', cta: false, focus: 'posture' },
      { label: '정해진 시간 안에 마치기', cta: false, focus: 'time' },
    ],
    tips: [
      '새 개념을 설명한 뒤 2초쯤 쉬어 생각할 시간을 주세요.',
      '질문을 던졌다면 바로 답하지 말고 3초 이상 기다리세요.',
      '화면을 가리킬 때도 몸은 청중을 향하게 하세요.',
    ],
  },
  {
    id: 'conference',
    label: '학회 · 세미나',
    summary: '논리적인 흐름과 명료한 전달.',
    targetSec: 600,
    targets: {
      spm: [260, 320], pause: [0.15, 0.28], pitch: [2.0, 4.5], gaze: 0.5,
      gesture: { seated: [0.05, 0.25], standing: [0.1, 0.4] }, filler: 2.5, fade: 0.3,
    },
    weights: { pace: 1.1, pause: 1.1, tone: 0.9, gaze: 0.8, posture: 0.8, gesture: 0.7, filler: 1, content: 1.3, time: 1.1, showing: 1.0 },
    contentChecks: ['keyMessage', 'numbers', 'recap'],
    outcomes: [
      { label: '연구 결과 설득', cta: false, focus: 'content', sec: 600 },
      { label: '질문 · 토론 이끌기', cta: true, focus: 'pause', sec: 900 },
      { label: '협업 제안 받기', cta: true, focus: 'content', sec: 600 },
      { label: '연구의 의의를 각인시키기', cta: false, focus: 'tone', sec: 180 },
      { label: '복잡한 데이터를 명확히 보여주기', cta: false, focus: 'pace', sec: 900 },
      { label: '전문가로 인정받기', cta: false, focus: 'posture', sec: 1200 },
      { label: '발표 시간 정확히 지키기', cta: false, focus: 'time' },
      { label: '어려운 질문에 침착하게 답하기', cta: false, focus: 'gaze' },
    ],
    tips: [
      '결과를 보여줄 때는 속도를 늦추고 핵심 수치를 강조하세요.',
      '슬라이드는 짧게 확인하고 다시 청중을 보세요.',
      '전문 용어가 이어지면 문장을 짧게 끊으세요.',
    ],
  },
  {
    id: 'capstone',
    label: '졸업 · 과제 발표',
    summary: '문제에서 결과까지 한 줄로. 심사위원의 질문까지 대비.',
    targetSec: 600,
    targets: {
      spm: [260, 320], pause: [0.15, 0.28], pitch: [2.0, 4.8], gaze: 0.55,
      gesture: { seated: [0.05, 0.25], standing: [0.1, 0.4] }, filler: 2.5, fade: 0.3,
    },
    weights: { pace: 1, pause: 1, tone: 1, gaze: 1, posture: 0.9, gesture: 0.8, filler: 1.1, content: 1.3, time: 1.2, showing: 1.3 },
    contentChecks: ['keyMessage', 'numbers', 'recap'],
    outcomes: [
      { label: '좋은 평가 받기', cta: false, focus: 'content' },
      { label: '심사 질문에 잘 답하기', cta: false, focus: 'pause', sec: 900 },
      { label: '포트폴리오·면접에 쓰기', cta: false, focus: 'content', sec: 180 },
      { label: '문제 정의를 설득력 있게', cta: false, focus: 'content', sec: 600 },
      { label: '데모를 매끄럽게 보여주기', cta: false, focus: 'gesture', sec: 900 },
      { label: '팀 기여를 분명히 전달하기', cta: false, focus: 'tone' },
      { label: '시간 안에 핵심만 담기', cta: false, focus: 'time', sec: 300 },
      { label: '긴장해도 또렷하게 말하기', cta: false, focus: 'filler' },
    ],
    tips: [
      '첫 30초 안에 “어떤 문제를, 어떻게 풀었는지”를 한 문장으로 말하세요.',
      '팀 발표라면 내 파트의 시작과 끝 문장을 정확히 외워 두세요.',
      '데모나 결과 화면에서는 말을 멈추고 청중이 볼 시간을 주세요.',
    ],
  },
  {
    id: 'speech',
    label: '축사 · 스토리텔링',
    summary: '감정의 흐름. 완급 조절과 극적인 쉼.',
    targetSec: 180,
    targets: {
      spm: [220, 290], pause: [0.22, 0.36], pitch: [3.0, 7.0], gaze: 0.65,
      gesture: { seated: [0.05, 0.3], standing: [0.1, 0.45] }, filler: 2, fade: 0.2,
    },
    weights: { pace: 1, pause: 1.3, tone: 1.4, gaze: 1, posture: 0.8, gesture: 0.8, filler: 1, content: 1, time: 1, showing: 0.6 },
    contentChecks: ['keyMessage', 'story', 'contrast'],
    outcomes: [
      { label: '감동과 공감', cta: false, focus: 'tone', sec: 180 },
      { label: '분위기 띄우기', cta: false, focus: 'tone', sec: 60 },
      { label: '메시지를 기억에 남기기', cta: false, focus: 'content', sec: 300 },
      { label: '주인공을 빛나게 하기', cta: false, focus: 'gaze' },
      { label: '자연스러운 웃음 끌어내기', cta: false, focus: 'pause' },
      { label: '진심이 느껴지게 말하기', cta: false, focus: 'pace' },
      { label: '짧고 깔끔하게 마치기', cta: false, focus: 'time', sec: 120 },
      { label: '떨지 않고 당당하게 서기', cta: false, focus: 'posture' },
    ],
    tips: [
      '이야기의 전환점 앞에서 2초쯤 멈추세요.',
      '감정이 담긴 문장은 속도를 늦추고 목소리를 낮춰 보세요.',
      '미소는 듣는 사람의 긴장을 풀어 줍니다.',
    ],
  },
];
export const PURPOSE_BY_ID: Record<string, Purpose> = Object.fromEntries(PURPOSES.map((p) => [p.id, p]));

// 녹화 전 자가진단. 리포트에서 실제 측정값과 비교합니다.
export const SURVEY: { id: string; cat: CatId | null; text: string }[] = [
  { id: 'selfFast', cat: 'pace', text: '사람들 앞에 서면 긴장해서 말이 빨라지는 편이다.' },
  { id: 'selfMono', cat: 'tone', text: '목소리가 단조롭다는 말을 들은 적이 있다.' },
  { id: 'selfFiller', cat: 'filler', text: '“어”, “음”, “이제”, “약간” 같은 말을 자주 쓰는 것 같다.' },
  { id: 'selfGaze', cat: 'gaze', text: '상대의 눈이나 카메라를 계속 바라보기가 어렵다.' },
  { id: 'selfGesture', cat: 'gesture', text: '발표할 때 손을 어디에 둬야 할지 모르겠다.' },
  { id: 'selfStructure', cat: 'content', text: '결론보다 배경 설명을 먼저 길게 하는 편이다.' },
  { id: 'anxiety', cat: null, text: '발표 직전에 긴장을 많이 하는 편이다.' },
];
export const LIKERT = ['전혀 아니다', '아니다', '보통', '그렇다', '매우 그렇다'];

export function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function parseTime(str: string | null | undefined, fallback: number) {
  const m = String(str || '').trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return fallback;
  return m[2] !== undefined ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]) * 60;
}

/** 60초 단위면 "N분", 아니면 "m:ss" */
export const fmtMin = (s: number) => (s % 60 ? fmtTime(s) : `${s / 60}분`);
