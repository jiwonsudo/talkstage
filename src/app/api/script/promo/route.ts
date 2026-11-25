import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { coachMode, coachStatus, currentUser, promoCodes } from '@/lib/coach/coachAccess';

// 테스트용 프로모션 코드 적용: 맞으면 AI 대본 코칭 1회권을 줘요(사람마다 한 번).
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return fail('로그인이 필요해요.', 401);
  if (coachMode() !== 'promo') return fail('지금은 프로모션 코드를 받지 않아요.');
  const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
  const c = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!c) return fail('코드를 입력해 주세요.');
  if (!promoCodes().includes(c)) return fail('맞지 않는 코드예요. 다시 확인해 주세요.');
  const admin = getAdminSupabase();
  if (!admin) return fail('서버 설정이 끝나지 않았어요.', 500);
  const { data, error } = await admin.rpc('ai_trial_redeem', { p_uid: me.user.id, p_code: c });
  if (error) { console.error('ai_trial_redeem', error.message); return fail('코드를 적용하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 500); }
  if (data === 'already') return fail('이미 코드를 적용했어요. 테스트 코칭은 한 사람당 1회예요.', 409);
  return NextResponse.json(await coachStatus(me.user.id, me.supabase));
}
