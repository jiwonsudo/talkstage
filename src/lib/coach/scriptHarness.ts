// 서버 전용: AI 대본 코칭 하네스. 라우트 핸들러(/api/script/coach)에서만 import 하세요.
//
// 1단계 이해(Haiku 5.5): 대본만 읽고 발표 상황·주제·청중·요청·핵심 메시지·구성을 먼저 파악하고,
//   사용자가 고른 상황·적은 핵심 메시지와 맞는지 판단해요. (싸고 빠른 모델로 충분한 추출 작업)
// 2단계 판단·코칭(Sonnet 5.5): 1단계 결과 + 목적별 기준(scenarios·delivery)을 바탕으로
//   어디를 고쳐 쓸지, 이 대본을 이 상황에서 어떻게 말할지(쉼·강조·가리키기·시선)를 정해요.
// 인용(quote)은 대본에 실제로 있는 문장만 남겨요 — 모델이 지어낸 인용은 지워요.

import Anthropic from '@anthropic-ai/sdk';
import { PURPOSE_BY_ID, POSTURES, type PostureId } from '@/lib/scenarios';
import { AID_OPTS, aidOf, audienceOf, deliveryOf, isShowing, type AidId } from '@/lib/delivery';
import type { CoachReq, ScriptBrief, ScriptCoach } from './scriptCoach';

// 목적마다 좋은 대본의 기준이 정반대라서 따로 적어요(scenarios.ts 의 상황과 같은 id).
const LENS: Record<string, string> = {
  interview: '면접 답변. 첫 문장에 결론(지원 동기·강점), 경험은 상황-행동-결과로 짧게, 숫자로 된 성과, 직무·회사와의 연결. 장황한 배경 설명·겸손한 얼버무림은 감점. 앉아서 말하고 손짓은 작게, 면접관 여러 명에게 시선을 나눠요.',
  ir: 'IR 피칭. 문제-해결-시장-성과 지표-팀-요청(투자 금액·다음 미팅) 순서, 숫자의 구체성, 한 문장으로 기억될 차별점. 트랙션 숫자·제품 화면은 직접 가리키거나 들어 보이며 강조해야 하고, 그 순간 화면을 보는 건 감점이 아니에요.',
  report: '업무 보고. 결론부터, 근거 2~3개, 요청·결정 사항이 명확한지. 결정권자가 1분 안에 판단할 수 있어야 함. 자료는 결론 숫자 하나만 짚고 바로 결정권자를 봐요.',
  lecture: '강의·교육. 학습 목표 제시, 개념→예시→확인 질문 흐름, 청중 참여 지점, 마지막 요약.',
  conference: '학회·컨퍼런스 발표. 연구 질문, 방법, 핵심 결과 하나, 의미와 한계. 전문 용어는 처음에 한 번 풀어 줌. 핵심 그래프는 가리키며 설명.',
  capstone: '졸업·캡스톤 발표. 문제 정의, 해결 방법·구현, 결과·데모, 배운 점. 심사위원이 평가 기준(독창성·완성도·기여도)을 바로 찾을 수 있어야 함. 데모 순간은 화면·제품을 보여 주며.',
  speech: '축사·건배사. 자기소개 한 줄, 구체적인 일화 하나, 따뜻한 마무리와 건배 제의. 길고 추상적인 덕담은 감점.',
};
const PURPOSE_IDS = Object.keys(LENS);

const BRIEF_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['detectedPurpose', 'purposeFit', 'purposeNote', 'topic', 'audience', 'ask', 'keyMessage', 'keyFit', 'keyNote', 'structure'],
  properties: {
    detectedPurpose: { type: 'string', enum: PURPOSE_IDS, description: '대본만 보고 판단한 발표 상황' },
    purposeFit: { type: 'string', enum: ['match', 'partial', 'mismatch'], description: '사용자가 고른 상황과 대본이 맞는지' },
    purposeNote: { type: 'string', description: 'match 가 아니면 왜 그런지 한 문장, match 면 빈 문자열' },
    topic: { type: 'string', description: '발표 주제 한 줄(30자 안팎)' },
    audience: { type: 'string', description: '대본이 겨냥한 청중(예: 시드 투자자, 1차 면접관)' },
    ask: { type: 'string', description: '발표자가 청중에게서 얻고 싶은 행동·결정. 대본에 없으면 빈 문자열' },
    keyMessage: { type: 'string', description: '대본에서 청중이 기억해야 할 한 문장(대본 표현을 살려 다듬기)' },
    keyFit: { type: 'string', enum: ['same', 'partial', 'missing', 'none'], description: '발표자가 적은 핵심 메시지가 대본에 드러나는지. same=분명히 있음, partial=흐릿함, missing=대본에 없음, none=적은 게 없음' },
    keyNote: { type: 'string', description: 'same·none 이 아니면 어디가 어긋나는지 한 문장' },
    structure: {
      type: 'array', description: '대본 구성을 순서대로 2~7부분',
      items: { type: 'object', additionalProperties: false, required: ['part', 'quote'], properties: {
        part: { type: 'string', description: '이 부분의 역할(예: 결론, 문제, 근거, 요청)' },
        quote: { type: 'string', description: '그 부분이 시작되는 대본 문장을 한 글자도 바꾸지 않고 그대로' },
      } },
    },
  },
} as const;

const COACH_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'strengths', 'fixes', 'opening', 'closing', 'keyLine', 'deliveryPlan', 'cues'],
  properties: {
    verdict: { type: 'string', description: '이 상황 기준 대본 총평 2문장' },
    strengths: { type: 'array', items: { type: 'string' }, description: '유지할 강점 1~3개, 각 한 문장' },
    fixes: {
      type: 'array', description: '효과가 큰 순서로 고칠 점 2~5개',
      items: { type: 'object', additionalProperties: false, required: ['title', 'why', 'quote', 'rewrite'], properties: {
        title: { type: 'string', description: '고칠 점 한 줄(20자 안팎)' },
        why: { type: 'string', description: '이 상황에서 왜 문제인지 1~2문장' },
        quote: { type: 'string', description: '대본에서 그대로 옮긴 해당 문장. 구조 문제라 특정 문장이 없으면 빈 문자열' },
        rewrite: { type: 'string', description: '고친 문장. 말로 하기 좋은 길이로. 없으면 빈 문자열' },
      } },
    },
    opening: { type: 'string', description: '도입을 더 강하게 고쳐 쓴 첫 문장 1~2문장' },
    closing: { type: 'string', description: '마무리를 더 강하게 고쳐 쓴 마지막 문장 1~2문장' },
    keyLine: { type: 'string', description: '청중이 기억할 핵심 메시지 한 문장' },
    deliveryPlan: { type: 'string', description: '이 대본을 이 상황·자세·보여 줄 것으로 어떻게 말할지 2~3문장(속도, 시선, 손·보여 주기)' },
    cues: {
      type: 'array', description: '대본의 특정 문장에서 해야 할 전달 동작 3~8개, 대본 순서대로',
      items: { type: 'object', additionalProperties: false, required: ['quote', 'kind', 'tip'], properties: {
        quote: { type: 'string', description: '대본 문장을 한 글자도 바꾸지 않고 그대로' },
        kind: { type: 'string', enum: ['pause', 'slow', 'stress', 'point', 'show', 'eyes', 'gesture'], description: 'pause=앞뒤 쉼, slow=천천히, stress=힘줘 강조, point=화면 가리키기, show=제품·폰 들어 보이기, eyes=시선 옮기기, gesture=손짓' },
        tip: { type: 'string', description: '그 문장에서 할 일 한 문장(예: "숫자 앞에서 반 박자 쉬고 그래프를 손바닥으로 가리켜요")' },
      } },
    },
  },
} as const;

const SYSTEM_BASE = `당신은 한국어 발표 리허설 코치예요. 사용자는 곧 있을 한 번의 발표(면접·투자 피칭·보고 등)를 이기려고 대본을 준비하고 있어요.
- 발표 상황마다 좋은 대본과 좋은 전달 방식의 기준이 정반대일 수 있어요. 주어진 상황의 기준으로만 판단하세요.
- 말로 하는 대본이에요. 소리 내어 읽기 어려운 긴 문장, 숫자 나열, 겹문장은 짚어 주세요.
- 인용(quote)은 대본 문장을 한 글자도 바꾸지 말고 그대로 옮기세요.
- 대본에 없는 사실(숫자·경력·성과)을 지어내지 마세요. 숫자가 필요하면 "[숫자]"처럼 비워 두세요.
- 말투는 부드러운 존댓말(~해요).`;

export class HarnessError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function textOf(res: { content: { type: string; text?: string }[] }) {
  return res.content.map((c) => (c.type === 'text' ? c.text ?? '' : '')).join('');
}
function check(res: { stop_reason: string | null }) {
  if (res.stop_reason === 'refusal') throw new HarnessError('이 대본은 AI 코칭을 할 수 없어요.', 422);
  if (res.stop_reason === 'max_tokens') throw new HarnessError('코칭이 너무 길어져서 끊겼어요. 다시 시도해 주세요.', 502);
}

export async function runHarness(req: CoachReq): Promise<{ brief: ScriptBrief; coach: ScriptCoach }> {
  const purpose = PURPOSE_BY_ID[req.purposeId];
  if (!purpose) throw new HarnessError('발표 상황을 알 수 없어요.', 400);
  const script = req.script;
  const posture: PostureId = req.posture === 'seated' ? 'seated' : 'standing';
  const aid: AidId = aidOf(purpose.id, req.aid as AidId);
  const audience = audienceOf(aid, posture);
  const dlv = deliveryOf(purpose.id);
  const spm = (purpose.targets.spm[0] + purpose.targets.spm[1]) / 2;
  const estSec = Math.round((script.replace(/\s/g, '').length / spm) * 60 * 1.12);
  const mmss = (s: number) => `${Math.floor(s / 60)}분${s % 60 ? ` ${s % 60}초` : ''}`;
  const client = new Anthropic();

  // ── 1단계: 대본 이해 ──
  const given = [
    `사용자가 고른 상황: ${purpose.label} (${purpose.id})`,
    req.topic && `사용자가 적은 제목: ${req.topic}`,
    `사용자가 적은 핵심 메시지: ${req.keyMessage || '(없음)'}`,
    req.outcome && `사용자가 원하는 결과: ${req.outcome}`,
  ].filter(Boolean).join('\n');
  const r1 = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 6000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: BRIEF_SCHEMA } },
    system: `${SYSTEM_BASE}\n지금은 코칭하지 말고, 대본을 읽고 이 발표가 무엇인지만 정확히 파악하세요. 상황 id: ${PURPOSE_IDS.map((id) => `${id}=${PURPOSE_BY_ID[id]?.label ?? id}`).join(', ')}`,
    messages: [{ role: 'user', content: `${given}\n\n<대본>\n${script}\n</대본>` }],
  });
  check(r1);
  const brief = JSON.parse(textOf(r1)) as ScriptBrief;
  brief.structure = brief.structure.filter((s) => s.quote && script.includes(s.quote));
  if (!req.keyMessage) brief.keyFit = 'none';

  // ── 2단계: 발표 방식 판단 + 코칭 ──
  const context = [
    `발표 상황: ${purpose.label}`,
    `이 상황의 기준: ${LENS[purpose.id] ?? LENS.report}`,
    `자세: ${POSTURES[posture].label}`,
    `보여 주는 것: ${AID_OPTS[aid].label} — ${AID_OPTS[aid].sub}`,
    audience === 'room' ? `청중이 여럿이에요. 시선 나누기: ${dlv.spread}` : '청중은 카메라 렌즈 하나예요(렌즈를 보며 말해야 해요).',
    isShowing(aid)
      ? `가리키기·들어 보이기는 분당 ${dlv.show[0]}~${dlv.show[1]}회가 적당해요. 숫자·결과·데모를 말하는 문장에서 가리키는 게 좋아요.${dlv.cues.length ? ` 신호가 되는 말: ${dlv.cues.join(', ')}` : ''}`
      : '보여 줄 화면·제품이 없어요. point·show 단서는 쓰지 마세요.',
    `목표 시간: ${mmss(req.targetSec)} · 대본 분량: ${script.length.toLocaleString()}자(이 상황의 보통 속도로 약 ${mmss(estSec)})`,
  ].join('\n');
  const r2 = await client.beta.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 10000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: COACH_SCHEMA } },
    system: `${SYSTEM_BASE}\n먼저 파악해 둔 발표 정보(1단계)를 바탕으로, 이 대본을 이 상황에서 이기게 고쳐 쓰고 어떻게 말할지 정하세요.
- 1단계에서 상황이 안 맞거나(purposeFit) 핵심 메시지가 대본에 없으면(keyFit=missing·partial) 그걸 가장 먼저 고칠 점으로 다뤄요.
- 목표 시간과 분량 차이가 크면 무엇을 빼거나 더할지 구체적으로 말해요.
- 전달 단서(cues)는 상황 기준을 지켜요. 면접은 손짓 작게·시선 나누기, 보여 줄 게 있는 발표는 숫자·데모 문장에서 가리키기·들어 보이기.`,
    messages: [{ role: 'user', content: `${context}\n\n<1단계 파악>\n${JSON.stringify(brief)}\n</1단계 파악>\n\n<대본>\n${script}\n</대본>` }],
  });
  check(r2);
  const coach = JSON.parse(textOf(r2)) as ScriptCoach;
  coach.fixes = coach.fixes.map((f) => ({ ...f, quote: f.quote && script.includes(f.quote) ? f.quote : '' }));
  coach.cues = coach.cues.filter((c) => c.quote && script.includes(c.quote) && (isShowing(aid) || (c.kind !== 'point' && c.kind !== 'show')));
  return { brief, coach };
}
