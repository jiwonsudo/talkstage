// 근거 자료와 코칭 문장
// 각 근거는 원문을 인용하지 않고 핵심 주장만 요약합니다.
// type: research(동료평가 연구) · book(서적) · practitioner(전문가 공개 입장 · 실무 가이드)
import type { CatId, Purpose } from '@/lib/scenarios';
import type { CatResult, Check, Setup } from './types';

export type Evidence = { type: 'research' | 'book' | 'practitioner'; cite: string; title: string; claim: string };
export type Coaching = { headline: string; advice: string; drill: string; evidence: string[] };

export const EVIDENCE: Record<string, Evidence> = {
  ambady1993: {
    type: 'research',
    cite: 'Ambady & Rosenthal (1993), Journal of Personality and Social Psychology',
    title: 'Half a minute: Predicting teacher evaluations from thin slices of nonverbal behavior',
    claim: '소리 없는 30초 남짓의 영상만 보고 내린 인상 평가가 한 학기 뒤 강의 평가와 상당히 일치했습니다. 자세와 표정 같은 비언어 신호가 첫인상을 빠르게 결정한다는 근거입니다.',
  },
  kleinke1986: {
    type: 'research',
    cite: 'Kleinke (1986), Psychological Bulletin',
    title: 'Gaze and eye contact: A research review',
    claim: '시선 접촉은 상대가 느끼는 주의, 호감, 신뢰 판단에 영향을 줍니다. 시선을 자주 피하면 자신감이 없거나 숨기는 것이 있다고 해석되기 쉽습니다.',
  },
  goldinmeadow2003: {
    type: 'book',
    cite: 'Susan Goldin-Meadow (2003), 『Hearing Gesture』',
    title: 'Hearing Gesture: How Our Hands Help Us Think',
    claim: '손짓은 말하는 사람의 생각 정리를 돕고, 듣는 사람이 내용을 이해하는 데도 도움을 줍니다. 손을 묶어 두면 말이 오히려 막히기 쉽습니다.',
  },
  vanedwards: {
    type: 'practitioner',
    cite: 'Vanessa Van Edwards · Science of People (2015 공개 분석)',
    title: 'TED 강연 수백 편의 비언어 행동 분석',
    claim: '조회 수가 높은 TED 강연일수록 손짓을 훨씬 많이 쓰는 경향이 있었다는 공개 분석입니다. 동료평가 논문이 아니라 실무자의 관찰 자료라는 점을 감안하세요.',
  },
  niebuhr2016: {
    type: 'research',
    cite: 'Niebuhr, Voße & Brem (2016), Computers in Human Behavior',
    title: "What makes a charismatic speaker? A computer-based acoustic-prosodic analysis of Steve Jobs' tone of voice",
    claim: '음높이의 폭이 넓고 변화가 큰 말투가 카리스마 있게 지각된다는 음향 분석입니다. 같은 내용이라도 억양이 평평하면 확신이 약하게 들립니다.',
  },
  rosenberg2009: {
    type: 'research',
    cite: 'Rosenberg & Hirschberg (2009), Speech Communication',
    title: 'Charisma perception from text and speech',
    claim: '청자가 카리스마를 판단할 때 음높이 변화, 말 속도 같은 운율 특징이 내용만큼 크게 작용했습니다.',
  },
  goldmaneisler1968: {
    type: 'book',
    cite: 'Frieda Goldman-Eisler (1968), 『Psycholinguistics』',
    title: 'Psycholinguistics: Experiments in Spontaneous Speech',
    claim: '즉흥 발화에서 나타나는 쉼은 다음 말을 계획하는 인지 처리 시간과 관련됩니다. 쉼은 실수가 아니라 말을 정리하는 과정입니다.',
  },
  clark2002: {
    type: 'research',
    cite: 'Clark & Fox Tree (2002), Cognition',
    title: 'Using uh and um in spontaneous speaking',
    claim: '“어/음”은 곧 말이 지연된다는 신호로 기능합니다. 완전히 없앨 필요는 없지만, 잦으면 준비가 부족하다는 인상을 줄 수 있습니다. 이 마지막 해석은 앱의 판단입니다.',
  },
  toastmasters: {
    type: 'practitioner',
    cite: 'Toastmasters International · Ah-Counter 역할, 「Your Speaking Voice」 교재',
    title: '스피치 클럽의 공식 피드백 관행',
    claim: '모임마다 군더더기 말을 세어 알려주는 역할을 두고, 교재에서는 속도·쉼·음량·억양의 변화를 의도적으로 연습하라고 권합니다. 문장 끝까지 힘을 유지하는 것도 강조합니다.',
  },
  minto: {
    type: 'book',
    cite: 'Barbara Minto, 『The Pyramid Principle』',
    title: 'The Pyramid Principle: Logic in Writing and Thinking',
    claim: '결론을 먼저 제시하고 근거를 묶어서 뒤에 배치하라는 컨설팅 업계의 표준 구조입니다. 듣는 사람이 처음부터 무엇을 판단해야 하는지 알 수 있습니다.',
  },
  anderson2016: {
    type: 'book',
    cite: 'Chris Anderson (2016), 『TED Talks: The Official TED Guide to Public Speaking』',
    title: 'TED 공식 스피치 가이드',
    claim: '발표 전체를 꿰는 하나의 메시지(throughline)를 정하고, 청중 몇 사람과 실제로 눈을 맞추며 말하라고 권합니다.',
  },
  gallo2014: {
    type: 'book',
    cite: 'Carmine Gallo (2014), 『Talk Like TED』',
    title: 'Talk Like TED',
    claim: '인기 TED 연사들은 대화하듯 자연스러운 속도로 말하며, 정해진 시간(18분) 안에 끝내는 제약이 메시지를 선명하게 만든다고 주장합니다.',
  },
  duarte2010: {
    type: 'book',
    cite: 'Nancy Duarte (2010), 『Resonate』',
    title: 'Resonate: Present Visual Stories that Transform Audiences',
    claim: '“지금의 현실”과 “가능한 미래”를 오가는 대비로 긴장을 만들고, 마지막에는 청중이 할 행동을 분명히 요청하라고 제안합니다.',
  },
  kawasaki: {
    type: 'practitioner',
    cite: 'Guy Kawasaki, 10/20/30 규칙 (공개 블로그 글)',
    title: 'The 10/20/30 Rule of PowerPoint',
    claim: '투자 피칭은 슬라이드 10장, 20분, 30포인트 글꼴로 제한하라는 벤처캐피털리스트의 공개 권고입니다. 시간을 넘기면 핵심이 흐려집니다.',
  },
  rowe1986: {
    type: 'research',
    cite: 'Mary Budd Rowe (1986), Journal of Teacher Education',
    title: 'Wait time: Slowing down may be a way of speeding up!',
    claim: '교사가 질문한 뒤 3초 이상 기다리면 학생들의 답변이 길어지고 질도 높아졌습니다.',
  },
  ruben2015: {
    type: 'research',
    cite: 'Ruben, Hall & Schmid Mast (2015), The Journal of Social Psychology',
    title: 'Smiling in a job interview: When less is more',
    claim: '면접에서 미소는 많을수록 좋은 것이 아니며, 직무 성격에 따라 절제된 미소가 더 적합하게 평가될 수 있습니다.',
  },
  mayer: {
    type: 'book',
    cite: 'Richard E. Mayer, 『Multimedia Learning』',
    title: '멀티미디어 학습 원리',
    claim: '학습자가 한 번에 처리할 수 있는 정보에는 한계가 있으므로, 내용을 작은 단위로 나눠 처리할 시간을 주라고 제안합니다(분할 원칙).',
  },
  star: {
    type: 'practitioner',
    cite: 'STAR 기법 · 행동 기반 면접 가이드',
    title: '상황(S) · 과제(T) · 행동(A) · 결과(R)',
    claim: '여러 기업의 채용 가이드가 경험 질문에 상황, 과제, 행동, 결과 순서로 답하라고 안내합니다. 결과에 숫자가 들어가면 설득력이 커집니다.',
  },
};

// 앱이 일부러 쓰지 않는 근거
export const NOT_USED = [
  {
    name: '메라비언의 7-38-55 법칙',
    why: '감정·태도를 전달하는 단어 하나 수준의 실험에서 나온 결과라 발표 전체에 일반화할 수 없습니다.',
  },
  {
    name: '파워 포즈(자세가 호르몬을 바꾼다는 주장)',
    why: '후속 재현 연구에서 호르몬 효과가 확인되지 않아 근거로 쓰지 않습니다. 열린 자세가 청중에게 주는 인상만 다룹니다.',
  },
];

const purposeLine: Partial<Record<CatId, Record<string, Record<string, string>>>> = {
  pace: {
    fast: {
      interview: '면접관이 답변 내용을 메모할 틈을 주세요. 문장이 끝날 때마다 한 박자 쉬면 차분하게 들립니다.',
      ir: '빠른 속도는 에너지로 보일 수 있지만, 숫자를 말할 때만큼은 늦추세요.',
      report: '보고에서는 정확성이 우선입니다. 결론과 숫자 부분을 천천히 말하세요.',
      lecture: '청중이 처음 듣는 내용입니다. 새 개념마다 속도를 낮추세요.',
      conference: '결과 슬라이드에서는 속도를 늦추고 수치를 또박또박 말하세요.',
      capstone: '결과와 데모 부분에서는 속도를 늦추세요. 심사위원이 화면과 말을 함께 따라올 시간이 필요해요.',
      speech: '감정이 담긴 문장일수록 천천히 말해야 전달됩니다.',
    },
    slow: {
      ir: '피칭에서 느린 속도는 확신이 부족해 보일 수 있어요. 문장을 짧게 끊고 리듬을 올려 보세요.',
      default: '문장을 미리 정리해 두고, 쉼은 문장과 문장 사이에만 두세요.',
    },
  },
};

/** 0–1 비율을 반올림한 퍼센트 숫자로 */
const pct = (v: number | null) => Math.round((v ?? 0) * 100);

const pl = (cat: CatId, dir: string, purposeId: string) => {
  const t = purposeLine[cat]?.[dir];
  return t ? t[purposeId] || t.default || '' : '';
};

// 항목 결과(c)를 받아 코칭 문장과 근거를 반환합니다.
export function coachFor(c: CatResult, purpose: Purpose, setup: Setup): Coaching {
  const id = c.id;
  const P = purpose.id;
  const out: Coaching = { headline: '', advice: '', drill: '', evidence: [] };
  // 85점 이상이면 기준에서 살짝 벗어나도 칭찬 문장을 씁니다.
  const d = c.score != null && c.score >= 85 && id !== 'time' ? 'ok' : c.dir;
  switch (id) {
    case 'pace':
      out.evidence = P === 'lecture' ? ['mayer', 'gallo2014'] : ['gallo2014', 'goldmaneisler1968'];
      if (d === 'high') {
        out.headline = `말이 빠른 편이에요 (분당 ${c.value}음절)`;
        out.advice = pl('pace', 'fast', P) || '문장이 끝날 때마다 한 박자 쉬세요.';
        out.drill = '대본의 문장 끝마다 “/” 표시를 하고, 표시에서 속으로 “하나”를 세고 다음 문장으로 넘어가세요.';
      } else if (d === 'low') {
        out.headline = `말이 느린 편이에요 (분당 ${c.value}음절)`;
        out.advice = pl('pace', 'slow', P);
        out.drill = '핵심 문장 3개를 정하고, 그 문장만 외워서 막힘 없이 말하는 연습을 하세요.';
      } else {
        out.headline = `속도가 ${purpose.label}에 알맞아요 (분당 ${c.value}음절)`;
        out.advice = '중요한 문장에서만 조금 늦추면 강조 효과가 더 커집니다.';
      }
      break;
    case 'pause':
      out.evidence = P === 'lecture' ? ['rowe1986', 'goldmaneisler1968'] : ['goldmaneisler1968', 'toastmasters'];
      if (c.extra?.longRuns > 0 && d !== 'high') {
        out.headline = `쉼 없이 18초 넘게 이어 말한 구간이 ${c.extra.longRuns}번 있어요`;
        out.advice = '숨이 차기 전에 쉬세요. 쉼은 듣는 사람이 방금 들은 내용을 정리하는 시간이기도 합니다.';
        out.drill = '한 문장을 한 호흡에 말하고, 문장 사이에 코로 짧게 숨을 들이쉬는 연습을 하세요.';
      } else if (d === 'low') {
        out.headline = `쉼이 부족해요 (쉼 비율 ${pct(c.raw)}%)`;
        out.advice = '중요한 말 앞과 뒤에 의도적으로 1초씩 멈추세요. 멈춤은 자신감 있게 보입니다.';
        out.drill = '강조할 단어 앞에 “▲” 표시를 하고, 그 앞에서 1초 멈추는 연습을 하세요.';
      } else if (d === 'high') {
        out.headline = `말이 자주 끊겨요 (쉼 비율 ${pct(c.raw)}%)`;
        out.advice = '쉼이 생각을 찾느라 생긴 공백처럼 보일 수 있어요. 문단의 첫 문장을 외워 두면 막힘이 줄어듭니다.';
        out.drill = '각 문단의 첫 문장만 적은 카드를 만들어 보고 연습하세요.';
      } else {
        out.headline = '쉼을 적절하게 쓰고 있어요';
        out.advice = P === 'lecture' ? '질문 뒤에는 3초 이상 기다려 보세요.' : '핵심 메시지 직후의 쉼을 조금 더 길게 가져가 보세요.';
      }
      break;
    case 'tone':
      out.evidence = c.extra?.fadeHigh ? ['toastmasters', 'niebuhr2016'] : ['niebuhr2016', 'rosenberg2009'];
      if (c.extra?.fadeHigh) {
        out.headline = `말끝이 자주 흐려져요 (문장의 ${Math.round(c.extra.fadeRatio * 100)}%)`;
        out.advice = '한국어는 서술어가 문장 끝에 오기 때문에 말끝이 흐리면 결론이 안 들립니다. “~습니다”까지 같은 크기로 말하세요.';
        out.drill = '문장의 마지막 두 음절을 일부러 조금 더 크게 말하는 연습을 하세요.';
      } else if (d === 'low') {
        out.headline = `억양이 평평해요 (음높이 변화 ${c.value}반음)`;
        out.advice = P === 'ir' ? '확신이 약하게 들릴 수 있어요. 문제를 말할 때는 낮게, 해결책은 높고 밝게 말해 대비를 만드세요.' : '강조할 단어에서 음을 살짝 올리고, 문장을 마칠 때는 내려서 마무리하세요.';
        out.drill = '같은 문장을 “놀라서”, “확신에 차서”, “조용히” 세 가지 감정으로 읽어 보세요.';
      } else if (d === 'high') {
        out.headline = `억양 변화가 큰 편이에요 (${c.value}반음)`;
        out.advice = P === 'report' || P === 'interview' ? '보고나 면접에서는 다소 들떠 보일 수 있어요. 문장 끝을 차분히 내려 주세요.' : '에너지가 좋아요. 강조가 너무 많으면 진짜 강조가 묻히니 핵심 문장에 집중하세요.';
      } else {
        out.headline = '억양에 적당한 변화가 있어요';
        out.advice = '핵심 문장에서 음을 바꿔 강조하는 습관을 유지하세요.';
      }
      break;
    case 'gaze':
      out.evidence = ['kleinke1986', setup.posture === 'seated' ? 'ambady1993' : 'anderson2016'];
      if (d === 'low') {
        out.headline = `카메라를 보는 시간이 ${pct(c.raw)}%예요 (목표 ${Math.round(purpose.targets.gaze * 100)}%)`;
        out.advice = c.extra?.downRatio > 0.4
          ? '시선이 주로 아래를 향했어요. 원고를 볼 때는 키워드만 확인하고 문장은 카메라를 보며 말하세요.'
          : setup.posture === 'seated'
            ? '화면 속 상대의 얼굴이 아니라 카메라 렌즈를 봐야 상대에게는 눈을 맞추는 것처럼 보입니다.'
            : '청중석의 왼쪽, 가운데, 오른쪽에 한 사람씩 정하고 문장 단위로 시선을 옮기세요.';
        out.drill = '카메라 옆에 작은 스티커를 붙이고, 한 문장을 말하는 동안은 스티커에서 눈을 떼지 않는 연습을 하세요.';
      } else {
        out.headline = `시선 처리가 안정적이에요 (${pct(c.raw)}%)`;
        out.advice = '문장이 끝날 때까지 시선을 유지하는 지금 습관을 이어가세요.';
      }
      break;
    case 'posture':
      out.evidence = ['ambady1993'];
      if (c.score != null && c.score < 80) {
        out.headline = c.extra?.mainIssue ? `${c.extra.mainIssue} 순간이 있어요` : '자세가 흐트러지는 구간이 있어요';
        out.advice = setup.posture === 'seated'
          ? '의자 깊숙이 앉아 등받이에 허리를 붙이고, 정수리를 위에서 실로 당긴다는 느낌으로 앉으세요.'
          : '발을 어깨너비로 벌려 체중을 양발에 고르게 싣고, 이동할 때는 의도적으로 몇 걸음 옮긴 뒤 멈추세요.';
        out.drill = setup.posture === 'seated'
          ? '녹화 전에 어깨를 귀까지 올렸다 툭 떨어뜨리는 동작을 3번 하고 시작하세요.'
          : '바닥에 테이프로 서 있을 자리를 표시하고, 문단이 바뀔 때만 위치를 옮기세요.';
      } else {
        out.headline = '자세가 안정적이에요';
        out.advice = '지금의 열린 자세를 유지하세요.';
      }
      break;
    case 'gesture':
      out.evidence = ['goldinmeadow2003', 'vanedwards'];
      if (d === 'low') {
        out.headline = `손짓이 적어요 (움직임 ${pct(c.raw)}%)`;
        out.advice = setup.posture === 'seated'
          ? '손을 화면 아래로 숨기지 말고 책상 위에 올려 두세요. 숫자나 순서를 말할 때 손가락으로 함께 보여주면 자연스럽습니다.'
          : '팔을 몸 옆에 붙여 두기보다 배꼽 높이에서 손을 가볍게 모으고 시작하세요. 크기·비교·순서를 말할 때 손으로 보여주세요.';
        out.drill = '“첫째, 둘째, 셋째”를 말할 때 손가락으로 세는 동작부터 넣어 보세요.';
      } else if (d === 'high') {
        out.headline = `손 움직임이 많은 편이에요 (${pct(c.raw)}%)`;
        out.advice = '의미 없이 반복되는 손짓은 산만해 보입니다. 강조할 때만 손을 쓰고, 나머지는 손을 모아 두세요.';
        out.drill = '핵심 메시지 3곳에만 제스처를 넣기로 정하고 연습하세요.';
      } else {
        out.headline = '손짓을 적절하게 쓰고 있어요';
        out.advice = '말의 내용과 손짓이 맞아떨어지는지 하이라이트 영상으로 확인해 보세요.';
      }
      break;
    case 'filler':
      out.evidence = ['clark2002', 'toastmasters'];
      if (d === 'high') {
        const top = ((c.extra?.top || []) as [string, number][]).slice(0, 3).map(([w, n]) => `“${w}” ${n}번`).join(', ');
        out.headline = `군더더기 말이 분당 ${c.value}번 나와요`;
        out.advice = `${top ? top + '. ' : ''}“이제”, “약간”, “막”은 한국어 발표에서 특히 습관이 되기 쉬운 말입니다. 생각이 필요할 때는 군더더기 말 대신 입을 다물고 쉬세요.`;
        out.drill = '1분 동안 자유 주제로 말하면서 군더더기 말이 나올 때마다 처음부터 다시 시작하는 연습을 하세요.';
      } else {
        out.headline = '군더더기 말이 적어요';
        out.advice = '음성 인식은 “어”, “음”을 놓치기도 하니, 하이라이트 영상으로 한 번 더 확인해 보세요.';
      }
      break;
    case 'content': {
      const failed = ((c.extra?.checks || []) as Check[]).filter((k) => k.pass === false);
      out.evidence = [...new Set(failed.flatMap((k) => k.evidence))].slice(0, 3);
      if (!out.evidence.length) out.evidence = ['anderson2016', 'minto'];
      if (failed.length) {
        out.headline = `내용 구조에서 ${failed.length}가지를 보완하면 좋아요`;
        out.advice = failed.map((k) => k.fix).join(' ');
        out.drill = '발표를 “핵심 메시지 → 근거 3개 → 핵심 메시지 반복 → 요청” 순서로 한 장에 요약해 보세요.';
      } else {
        out.headline = '내용 구조가 탄탄해요';
        out.advice = '핵심 메시지가 처음과 끝에 모두 등장했어요.';
      }
      break;
    }
    case 'time':
      out.evidence = purpose.id === 'ir' ? ['kawasaki', 'gallo2014'] : ['gallo2014'];
      if (d === 'high') {
        out.headline = `목표 시간을 ${c.extra.overSec}초 넘겼어요`;
        out.advice = '시간을 넘기면 마지막 요청과 결론이 잘립니다. 근거 중 가장 약한 하나를 빼세요.';
      } else if (d === 'low') {
        out.headline = `목표 시간보다 ${c.extra.underSec}초 일찍 끝났어요`;
        out.advice = '서두르지 않았는지 확인하세요. 핵심 근거에 사례 하나를 더하면 좋습니다.';
      } else {
        out.headline = '시간을 잘 맞췄어요';
        out.advice = '실전에서는 긴장으로 빨라질 수 있으니 지금 속도를 기억해 두세요.';
      }
      break;
  }
  return out;
}

// 자가진단과 실제 측정 비교
export type SelfRow = { qid: string; label: string; self: number; cat: CatId; kind: 'match' | 'better' | 'blind' | 'ok'; msg: string; score: number };
export function selfCompare(profile: Record<string, number> | null | undefined, cats: Partial<Record<CatId, CatResult>>): SelfRow[] {
  if (!profile) return [];
  const map: Record<string, { cat: CatId; weakIf: (c: CatResult) => boolean; label: string }> = {
    selfFast: { cat: 'pace', weakIf: (c) => c.dir === 'high' || (c.extra?.fastFrac || 0) > 0.2, label: '긴장하면 말이 빨라진다' },
    selfMono: { cat: 'tone', weakIf: (c) => c.dir === 'low', label: '목소리가 단조롭다' },
    selfFiller: { cat: 'filler', weakIf: (c) => c.dir === 'high', label: '군더더기 말이 잦다' },
    selfGaze: { cat: 'gaze', weakIf: (c) => c.dir === 'low', label: '시선을 유지하기 어렵다' },
    selfGesture: { cat: 'gesture', weakIf: (c) => c.dir !== 'ok', label: '손을 어떻게 할지 모른다' },
    selfStructure: { cat: 'content', weakIf: (c) => (c.extra?.checks || []).some((k: { id: string; pass: boolean | null }) => k.id === 'conclusionFirst' && k.pass === false) || (c.score != null && c.score < 60), label: '결론보다 배경부터 말한다' },
  };
  const rows: SelfRow[] = [];
  for (const [qid, m] of Object.entries(map)) {
    const v = profile[qid];
    const c = cats[m.cat];
    if (!v || !c || c.score == null) continue;
    const selfWeak = v >= 4;
    const selfStrong = v <= 2;
    const measuredWeak = m.weakIf(c) && c.score < 80;
    let kind: SelfRow['kind'], msg: string;
    if (selfWeak && measuredWeak) { kind = 'match'; msg = '걱정했던 약점이 측정에서도 확인됐어요. 집중 연습 항목으로 추천해요.'; }
    else if (selfWeak && !measuredWeak) { kind = 'better'; msg = '걱정했던 것보다 잘하고 있어요. 이 부분은 자신감을 가져도 됩니다.'; }
    else if (!selfWeak && measuredWeak) { kind = 'blind'; msg = '걱정하지 않았던 부분인데 측정에서 드러났어요. 하이라이트 영상으로 확인해 보세요.'; }
    else if (selfStrong) { kind = 'ok'; msg = '스스로 생각한 대로 강점이에요.'; }
    else { kind = 'ok'; msg = '측정에서도 큰 문제는 없었어요.'; }
    rows.push({ qid, label: m.label, self: v, cat: m.cat, kind, msg, score: c.score });
  }
  return rows;
}
