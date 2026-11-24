// 목적별 "전달 방식" 기준. 좋은 발표 방법은 목적마다 정반대일 수 있어요.
// 면접: 앉아서, 손은 작게, 면접관 여러 명에게 시선을 나눔 / IR·시연: 화면·제품을 직접 가리키고 들어 보이며 강조.
// 숫자는 실무 가이드를 바탕으로 한 초기값이라 실제 녹화로 계속 보정해요(lib/eval).
import type { PostureId, Range } from './scenarios';

/** 무엇을 보여 주며 발표하나요(면접은 어떤 자리인가요) */
export type AidId = 'panel' | 'video' | 'slidesL' | 'slidesR' | 'product' | 'device' | 'none';
/** 시선을 받을 사람: room = 카메라 = 청중 가운데 자리(좌우로 나눠 보는 게 좋음), camera = 카메라 렌즈 하나 */
export type Audience = 'room' | 'camera';

export const AID_OPTS: Record<AidId, { label: string; sub: string }> = {
  panel: { label: '대면 면접', sub: '면접관 여러 명 앞 · 카메라를 가운데 면접관 자리에 두세요' },
  video: { label: '화상 면접', sub: '카메라 렌즈가 곧 면접관이에요' },
  slidesL: { label: '슬라이드 화면 · 내 왼쪽', sub: '청중을 볼 때 화면이 내 왼손 쪽에 있어요' },
  slidesR: { label: '슬라이드 화면 · 내 오른쪽', sub: '청중을 볼 때 화면이 내 오른손 쪽에 있어요' },
  product: { label: '실물 제품 · 시제품', sub: '손에 들고 보여 주며 설명해요' },
  device: { label: '폰 · 노트북으로 시연', sub: '화면을 켜고 직접 써 보이며 설명해요' },
  none: { label: '보여 줄 것 없이 말로만', sub: '손짓과 시선만으로 전달해요' },
};

export type Delivery = {
  aids: AidId[];
  defaultAid: AidId;
  /** 가리키기·들어 보이기 횟수(분당) 적정 범위 */
  show: Range;
  /** 이 목적에서 "보여 줘야 하는 순간"이 되는 말(숫자·결과 말고 목적에 따라 추가) */
  cues: string[];
  /** 청중이 여럿일 때 시선 나누는 법 */
  spread: string;
  /** 보여 주기 코칭 */
  tip: { few: string; many: string; keys: string };
};

const SHOW_AIDS: AidId[] = ['slidesR', 'slidesL', 'product', 'device', 'none'];

export const DELIVERY: Record<string, Delivery> = {
  interview: {
    aids: ['panel', 'video'], defaultAid: 'panel', show: [0, 2], cues: [],
    spread: '질문한 면접관에게 답을 시작하고, 근거를 말할 때는 옆 면접관에게, 마지막 문장은 다시 질문한 면접관에게 돌아오세요.',
    tip: { few: '', many: '', keys: '' },
  },
  ir: {
    aids: SHOW_AIDS, defaultAid: 'slidesR', show: [1.5, 5],
    cues: ['매출', '성장', '고객', '사용자', '시장', '트랙션', '투자', '데모', '보시면', '보시는', '여기', '이 화면', '이 그래프', '이 제품'],
    spread: '투자자 한 명 한 명에게 문장 하나씩 시선을 주고, 요청(투자 금액)을 말할 때는 가운데 의사결정권자를 보세요.',
    tip: {
      few: '피칭에서 화면·제품을 거의 가리키지 않았어요. 트랙션 숫자와 제품 화면은 손바닥으로 가리키며 “여기 보시면”으로 시선을 끌어 주세요.',
      many: '가리키는 동작이 너무 잦아 산만해요. 숫자·데모처럼 꼭 봐야 할 곳에만 가리키고, 나머지는 손을 모아 두세요.',
      keys: '숫자·성과를 말하는 순간에 화면이나 제품을 가리키지 않았어요. 투자자는 말보다 눈으로 본 숫자를 기억해요.',
    },
  },
  report: {
    aids: SHOW_AIDS, defaultAid: 'slidesR', show: [0.5, 3],
    cues: ['결론', '결과', '증가', '감소', '대비', '목표', '예산', '보시면', '여기', '이 표', '이 그래프'],
    spread: '의사결정권자를 중심으로, 근거를 말할 때는 관련 팀 사람에게도 시선을 주세요.',
    tip: {
      few: '보고 자료의 결론 숫자를 한 번도 가리키지 않았어요. 차트에서 결론이 되는 막대·숫자 하나만 가리키고 바로 의사결정권자를 보세요.',
      many: '화면을 자주 가리키며 읽어 주고 있어요. 보고는 화면 설명이 아니라 결론 전달이에요. 결론 숫자에만 가리키세요.',
      keys: '결론·숫자를 말할 때 해당 자료를 가리키지 않았어요. “이 숫자가 결론입니다”처럼 한 번만 짚어 주세요.',
    },
  },
  lecture: {
    aids: SHOW_AIDS, defaultAid: 'slidesR', show: [1, 6],
    cues: ['보시면', '여기', '이 그림', '이 부분', '예를 들어', '정리하면', '첫째', '둘째'],
    spread: '강의실 왼쪽 끝, 가운데, 오른쪽 끝 학생을 정해 번갈아 보세요. 한쪽만 보면 반대쪽은 수업에서 빠져요.',
    tip: {
      few: '개념 그림·예시를 가리키지 않고 말로만 설명했어요. 그림의 어느 부분 이야기인지 손으로 짚어 주면 따라오기 쉬워요.',
      many: '화면을 너무 자주 가리켜 학생보다 화면과 이야기하는 것처럼 보여요. 가리킨 뒤에는 학생 쪽으로 돌아서 설명하세요.',
      keys: '“여기 보시면”, “이 그림” 같은 말을 할 때 실제로 가리키지 않았어요. 말과 손이 같은 곳을 가리켜야 해요.',
    },
  },
  conference: {
    aids: SHOW_AIDS, defaultAid: 'slidesR', show: [0.8, 4],
    cues: ['결과', '그래프', '보시면', '여기', '유의', '비교', '퍼센트', '배'],
    spread: '좌장과 청중석 앞줄·뒷줄을 번갈아 보세요. 질문은 질문자에게 답을 시작해 전체로 넓히세요.',
    tip: {
      few: '그래프·결과를 가리키지 않았어요. 축이 무엇인지, 어디를 봐야 하는지 먼저 짚고 결과를 말하세요.',
      many: '슬라이드를 계속 가리키며 읽고 있어요. 핵심 결과 한두 곳만 짚고 청중을 보며 의미를 설명하세요.',
      keys: '결과 수치를 말할 때 그래프의 해당 위치를 가리키지 않았어요.',
    },
  },
  capstone: {
    aids: SHOW_AIDS, defaultAid: 'slidesR', show: [1.5, 5],
    cues: ['데모', '시연', '보시면', '여기', '이 화면', '이 버튼', '결과', '기능', '만들었'],
    spread: '심사위원석 가운데를 중심으로 좌우 심사위원에게도 문장 단위로 시선을 나눠 주세요.',
    tip: {
      few: '시연·결과물을 거의 가리키지 않았어요. 데모 단계마다 무엇을 누르는지 가리키며 말하고, 결과 화면에서 멈춰 심사위원을 보세요.',
      many: '가리키는 동작이 너무 잦아요. 데모의 핵심 장면 서너 곳에만 집중하세요.',
      keys: '기능·결과를 말할 때 화면이나 결과물을 가리키지 않았어요.',
    },
  },
  speech: {
    aids: ['none', 'product', 'slidesR', 'slidesL'], defaultAid: 'none', show: [0, 2],
    cues: [],
    spread: '하객석 전체를 천천히 둘러보고, 축하하는 사람 쪽은 마지막 인사에서 바라보세요.',
    tip: {
      few: '',
      many: '들고 있는 것을 자주 가리켜 시선이 분산돼요. 축사는 사람을 보는 시간이 길어야 해요.',
      keys: '',
    },
  },
};

export const deliveryOf = (purposeId: string) => DELIVERY[purposeId] ?? DELIVERY.report;
export const aidOf = (purposeId: string, aid?: AidId | null): AidId => {
  const d = deliveryOf(purposeId);
  return aid && d.aids.includes(aid) ? aid : d.defaultAid;
};
/** 화면·제품을 보여 주는 발표인지 */
export const isShowing = (aid: AidId) => aid === 'slidesL' || aid === 'slidesR' || aid === 'product' || aid === 'device';
/** 시선을 받을 사람: 대면 면접·서서 하는 발표는 청중이 여럿, 화상·앉아서 하는 발표는 렌즈 하나 */
export const audienceOf = (aid: AidId, posture: PostureId): Audience =>
  aid === 'panel' ? 'room' : aid === 'video' ? 'camera' : posture === 'standing' ? 'room' : 'camera';
