import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { PURPOSE_BY_ID } from '@/lib/scenarios';
import { AI_COACH_MAX_CHARS, aiCoachChars, type CoachReq, type CoachResult } from '@/lib/coach/scriptCoach';
import { coachStatus, currentUser } from '@/lib/coach/coachAccess';
import { HarnessError, runHarness } from '@/lib/coach/scriptHarness';

// AI 대본 코칭. GET = 지금 쓸 수 있는지(1회권·크레딧), POST = 코칭 실행.
// 키는 서버 전용 ANTHROPIC_API_KEY(NEXT_PUBLIC_ 금지).
export const maxDuration = 180;

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function GET() {
  const me = await currentUser();
  if (!me) return fail('로그인이 필요해요.', 401);
  return NextResponse.json(await coachStatus(me.user.id, me.supabase));
}

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail('로그인이 필요해요.', 401);
  const status = await coachStatus(me.user.id, me.supabase);
  if (status.mode === 'off') return fail(status.reason, 503);

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const script = str(b.script, AI_COACH_MAX_CHARS + 1);
  if (script.length < 40) return fail('대본이 너무 짧아요(40자 이상).');
  if (script.length > AI_COACH_MAX_CHARS) return fail(`대본이 너무 길어요(${AI_COACH_MAX_CHARS.toLocaleString()}자까지).`);
  const purpose = PURPOSE_BY_ID[str(b.purposeId, 40)];
  if (!purpose) return fail('발표 상황을 알 수 없어요.');
  const body: CoachReq = {
    script, purposeId: purpose.id,
    targetSec: typeof b.targetSec === 'number' && b.targetSec > 0 ? Math.min(3600, Math.round(b.targetSec)) : purpose.targetSec,
    topic: str(b.topic, 120), keyMessage: str(b.keyMessage, 200), outcome: str(b.outcome, 200),
    aid: str(b.aid, 20), posture: str(b.posture, 20),
  };

  const admin = getAdminSupabase()!;
  const uid = me.user.id;
  // 먼저 1회권을 잡거나 크레딧을 빼고(동시 요청 방지), 코칭이 실패하면 되돌려요.
  let charged: CoachResult['charged'];
  let undo: () => Promise<unknown>;
  if (status.mode === 'promo') {
    if (status.trial === 'none') return fail('프로모션 코드를 먼저 넣어 주세요.', 402);
    if (status.trial === 'used') return fail('테스트 코칭 1회를 이미 썼어요.', 402);
    const { data: ok, error } = await admin.rpc('ai_trial_claim', { p_uid: uid });
    if (error) return fail('코칭을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 500);
    if (!ok) return fail('이미 코칭을 받는 중이에요. 잠시 기다려 주세요.', 409);
    charged = { kind: 'trial' };
    undo = async () => admin.rpc('ai_trial_finish', { p_uid: uid, p_ok: false });
  } else {
    if (!status.paid) return fail('AI 대본 코칭은 Spotlight 요금제부터 쓸 수 있어요.', 402);
    const { data, error } = await admin.rpc('charge_ai_coach', { p_uid: uid, p_chars: aiCoachChars(script) });
    if (error) return fail(error.message.includes('NO_CREDITS') ? '크레딧이 모자라요.' : '크레딧을 확인하지 못했어요.', error.message.includes('NO_CREDITS') ? 402 : 500);
    const c = data as { ledgerId: string; cost: number };
    charged = { kind: 'credits', cost: c.cost };
    undo = async () => admin.rpc('refund_ai_coach', { p_uid: uid, p_ledger_id: c.ledgerId });
  }

  try {
    const { brief, coach } = await runHarness(body);
    if (charged.kind === 'trial') await admin.rpc('ai_trial_finish', { p_uid: uid, p_ok: true });
    return NextResponse.json({ brief, coach, charged } satisfies CoachResult);
  } catch (e) {
    await undo().catch(() => {});
    const again = charged.kind === 'trial' ? ' 테스트 1회는 그대로 남아 있어요.' : ' 크레딧은 빠지지 않았어요.';
    if (e instanceof HarnessError) return fail(e.message + again, e.status);
    if (e instanceof Anthropic.RateLimitError) return fail('요청이 많아요. 잠시 뒤 다시 시도해 주세요.' + again, 429);
    if (e instanceof Anthropic.APIError) { console.error('script coach', e.status, e.message); return fail('AI 코칭을 받지 못했어요.' + again, 502); }
    console.error('script coach', e);
    return fail('AI 코칭 결과를 읽지 못했어요.' + again, 502);
  }
}
