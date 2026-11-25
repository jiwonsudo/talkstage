import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { PURPOSE_BY_ID } from '@/lib/scenarios';
import type { ScriptCoach } from '@/lib/coach/scriptCoach';

// 대본 AI 코칭(유료 요금제 전용). 키는 서버 전용 ANTHROPIC_API_KEY(NEXT_PUBLIC_ 금지).
export const maxDuration = 120;

const MAX_CHARS = 15000; // 30분 발표 대본도 넉넉히 들어가는 길이
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

type Body = { script?: unknown; purposeId?: unknown; targetSec?: unknown; topic?: unknown; keyMessage?: unknown; outcome?: unknown };
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// 목적별로 기준이 정반대라서, 목적마다 무엇을 보는지 따로 적어요(scenarios.ts 의 상황과 같은 id).
const LENS: Record<string, string> = {
  interview: '면접 답변. 첫 문장에 결론(지원 동기·강점), 경험은 상황-행동-결과로 짧게, 숫자로 된 성과, 직무·회사와의 연결. 장황한 배경 설명·겸손한 얼버무림은 감점.',
  ir: 'IR 피칭. 문제-해결-시장-성과 지표-팀-요청(투자 금액·다음 미팅) 순서, 숫자의 구체성, 한 문장으로 기억될 차별점. 시연·화면을 가리킬 자리("여기 보시면")가 자연스러운지도 봄.',
  report: '업무 보고. 결론부터, 근거 2~3개, 요청·결정 사항이 명확한지. 결정권자가 1분 안에 판단할 수 있어야 함.',
  lecture: '강의·교육. 학습 목표 제시, 개념→예시→확인 질문 흐름, 청중 참여 지점, 마지막 요약.',
  conference: '학회·컨퍼런스 발표. 연구 질문, 방법, 핵심 결과 하나, 의미와 한계. 전문 용어는 처음에 한 번 풀어 줌.',
  capstone: '졸업·캡스톤 발표. 문제 정의, 해결 방법·구현, 결과·데모, 배운 점. 심사위원이 평가 기준(독창성·완성도·기여도)을 바로 찾을 수 있어야 함.',
  speech: '축사·건배사. 자기소개 한 줄, 구체적인 일화 하나, 따뜻한 마무리와 건배 제의. 길고 추상적인 덕담은 감점.',
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'strengths', 'fixes', 'opening', 'closing', 'keyLine'],
  properties: {
    verdict: { type: 'string', description: '이 상황 기준으로 본 대본 총평 2문장' },
    strengths: { type: 'array', items: { type: 'string' }, description: '유지할 강점 1~3개, 각 한 문장' },
    fixes: {
      type: 'array',
      description: '효과가 큰 순서로 고칠 점 2~5개',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'why', 'quote', 'rewrite'],
        properties: {
          title: { type: 'string', description: '고칠 점 한 줄(20자 안팎)' },
          why: { type: 'string', description: '이 상황에서 왜 문제인지 1~2문장' },
          quote: { type: 'string', description: '대본에서 그대로 옮긴 해당 문장. 대본 전체 구조 문제라 특정 문장이 없으면 빈 문자열' },
          rewrite: { type: 'string', description: '그 문장을 고친 예시. 말로 하기 좋은 길이로. 없으면 빈 문자열' },
        },
      },
    },
    opening: { type: 'string', description: '첫 15초(도입)를 더 강하게 만드는 고쳐 쓴 도입 문장 1~2문장' },
    closing: { type: 'string', description: '마무리를 더 강하게 만드는 고쳐 쓴 마지막 문장 1~2문장' },
    keyLine: { type: 'string', description: '청중이 기억할 핵심 메시지 한 문장(적어 준 핵심 메시지가 있으면 그걸 다듬어서)' },
  },
} as const;

const SYSTEM = `당신은 한국어 발표 리허설 코치예요. 사용자는 곧 있을 한 번의 발표(면접·투자 피칭·보고 등)를 이기려고 대본을 준비하고 있어요.
규칙:
- 발표 상황마다 좋은 대본의 기준이 다릅니다. 주어진 상황의 기준으로만 판단하세요.
- 말로 하는 대본이라는 점을 잊지 마세요. 글로는 괜찮아도 소리 내어 읽기 어려운 긴 문장, 숫자 나열, 겹문장은 짚어 주세요.
- 고칠 점은 효과가 큰 순서로, 막연한 조언 말고 대본의 실제 문장을 인용해 구체적으로 고쳐 주세요. 인용은 대본 문장을 한 글자도 바꾸지 말고 그대로 옮기세요.
- 대본에 없는 사실(숫자·경력·성과)을 지어내지 마세요. 숫자가 필요하면 "[숫자]"처럼 비워 두세요.
- 말투는 부드러운 존댓말(~해요). 칭찬은 짧게, 고칠 점은 분명하게.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return fail('서버에 AI 코칭 설정이 없어요.', 501);
  const supabase = await getServerSupabase();
  const { data: { user } } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!user || !supabase) return fail('로그인이 필요해요.', 401);
  // 요금제는 서버에서 확인해요(앱이 보내는 값은 믿지 않아요)
  const { data: prof } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
  const plan = (prof as { plan?: string } | null)?.plan;
  if (plan !== 'Spotlight' && plan !== 'Headliner') return fail('AI 대본 코칭은 Spotlight 요금제부터 쓸 수 있어요.', 402);

  const b = (await req.json().catch(() => ({}))) as Body;
  const script = str(b.script, MAX_CHARS + 1);
  if (script.length < 40) return fail('대본이 너무 짧아요.');
  if (script.length > MAX_CHARS) return fail(`대본이 너무 길어요(${MAX_CHARS.toLocaleString()}자까지).`);
  const purpose = PURPOSE_BY_ID[str(b.purposeId, 40)];
  if (!purpose) return fail('발표 상황을 알 수 없어요.');
  const targetSec = typeof b.targetSec === 'number' && b.targetSec > 0 ? Math.round(b.targetSec) : purpose.targetSec;
  const topic = str(b.topic, 120), keyMessage = str(b.keyMessage, 200), outcome = str(b.outcome, 200);

  const brief = [
    `발표 상황: ${purpose.label}`,
    `이 상황에서 보는 기준: ${LENS[purpose.id] ?? LENS.report}`,
    `목표 시간: ${Math.floor(targetSec / 60)}분 ${targetSec % 60 ? `${targetSec % 60}초` : ''}`.trim(),
    topic && `주제: ${topic}`,
    keyMessage && `발표자가 적은 핵심 메시지: ${keyMessage}`,
    outcome && `발표로 얻고 싶은 것: ${outcome}`,
  ].filter(Boolean).join('\n');

  const client = new Anthropic();
  try {
    const res = await client.beta.messages.create({
      // 비용: Sonnet 5.5($2/$10 per MTok) + effort low → 대본 한 번에 약 3~6센트. Opus 5.5 는 2배, Haiku 5.5 는 고쳐 쓰기 품질이 떨어짐.
      model: 'claude-sonnet-5-5',
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `${brief}\n\n<대본>\n${script}\n</대본>` }],
    });
    if (res.stop_reason === 'refusal') return fail('이 대본은 AI 코칭을 할 수 없어요.', 422);
    if (res.stop_reason === 'max_tokens') return fail('코칭이 너무 길어져서 끊겼어요. 다시 시도해 주세요.', 502);
    const text = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
    const coach = JSON.parse(text) as ScriptCoach;
    // 인용이 대본에 실제로 있는 문장일 때만 남겨요(대본 문장 강조에 써요)
    coach.fixes = coach.fixes.map((f) => ({ ...f, quote: f.quote && script.includes(f.quote) ? f.quote : '' }));
    return NextResponse.json({ coach });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail('요청이 많아요. 잠시 뒤 다시 시도해 주세요.', 429);
    if (e instanceof Anthropic.APIError) { console.error('script coach', e.status, e.message); return fail('AI 코칭을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502); }
    console.error('script coach', e);
    return fail('AI 코칭 결과를 읽지 못했어요. 다시 시도해 주세요.', 502);
  }
}
