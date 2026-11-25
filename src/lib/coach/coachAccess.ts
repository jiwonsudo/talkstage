// 서버 전용: AI 대본 코칭을 누가 쓸 수 있는지. 라우트 핸들러에서만 import 하세요.
// AI_COACH_MODE: promo(기본, 테스트: 프로모션 코드로 1회) | credits(정식: 유료 요금제 + 대본 길이별 크레딧) | off
// AI_PROMO_CODES: 테스트 코드(쉼표로 여러 개, 대소문자 무시). 둘 다 서버 전용(NEXT_PUBLIC_ 금지).
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { CoachStatus } from './scriptCoach';

export const coachMode = (): 'promo' | 'credits' | 'off' => {
  const m = (process.env.AI_COACH_MODE ?? 'promo').trim();
  return m === 'credits' || m === 'off' ? m : 'promo';
};
export const promoCodes = () => (process.env.AI_PROMO_CODES ?? '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);

export async function currentUser() {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { user, supabase } : null;
}

export async function coachStatus(uid: string, supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>): Promise<CoachStatus> {
  if (!process.env.ANTHROPIC_API_KEY) return { mode: 'off', reason: '서버에 AI 코칭 설정이 없어요.' };
  const mode = coachMode();
  if (mode === 'off') return { mode: 'off', reason: 'AI 대본 코칭을 잠시 쉬고 있어요.' };
  const admin = getAdminSupabase();
  if (!admin) return { mode: 'off', reason: '서버 설정이 끝나지 않았어요.' };
  // AI 코칭은 유료 요금제만(테스트 기간엔 거기에 프로모션 코드 1회가 더 필요해요)
  const { data: prof } = await supabase.from('profiles').select('plan').eq('id', uid).single();
  const plan = (prof as { plan?: string } | null)?.plan;
  const paid = plan === 'Spotlight' || plan === 'Headliner';
  if (mode === 'promo') {
    const { data, error } = await admin.rpc('ai_trial_state', { p_uid: uid });
    if (error) { console.error('ai_trial_state', error.message); return { mode: 'off', reason: 'AI 코칭 준비가 아직 끝나지 않았어요(DB).' }; }
    return { mode: 'promo', paid, trial: data as 'none' | 'ready' | 'busy' | 'used' };
  }
  const { data: cr } = await supabase.rpc('credits_left');
  const left = cr && typeof (cr as { left?: number }).left === 'number' ? (cr as { left: number }).left : null;
  return { mode: 'credits', paid, left };
}
