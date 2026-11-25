'use client';
import { forgetLast } from '@/lib/auth/lastLogin';
import { getSupabase } from '@/lib/supabase/client';
import type { PlanId } from '@/lib/plans';

const db = () => {
  const s = getSupabase();
  if (!s) throw new Error('Supabase 설정이 필요해요.');
  return s;
};

export async function fetchProfile(id: string) {
  const { data, error } = await db().from('profiles').select('id, name, plan').eq('id', id).single();
  if (error) throw error;
  return data as { id: string; name: string; plan: PlanId };
}

export async function updateName(id: string, name: string) {
  const n = name.trim();
  if (!n) throw new Error('이름을 입력해 주세요.');
  const { error } = await db().from('profiles').update({ name: n }).eq('id', id);
  if (error) throw error;
}

/** 지금 비밀번호로 한 번 더 확인한 뒤 바꿔요. 세션만 있으면 바뀌는 걸 막아요. */
export async function changePassword(email: string, current: string, next: string) {
  if (next.length < 8) throw new Error('새 비밀번호는 8자 이상으로 정해 주세요.');
  const { error: e1 } = await db().auth.signInWithPassword({ email, password: current });
  if (e1) throw new Error('지금 비밀번호가 맞지 않아요.');
  const { error } = await db().auth.updateUser({ password: next });
  if (error) throw error;
}

/** 계정 삭제는 관리자 키가 필요해서 서버 라우트(/api/account)에서 해요. */
// 비밀번호가 있는 계정은 비밀번호로 한 번 더 확인하고, 소셜로만 가입한 계정은 화면에서 확인 문구를 직접 입력받아요.
export async function deleteAccount(email: string, password: string | null) {
  if (password !== null) {
    const { error: e1 } = await db().auth.signInWithPassword({ email, password });
    if (e1) throw new Error('비밀번호가 맞지 않아요.');
  }
  const res = await fetch('/api/account', { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? '계정을 삭제하지 못했어요.');
  forgetLast(); // 지운 계정이 "최근 로그인한 계정"으로 남지 않게
  await db().auth.signOut({ scope: 'local' });
}

export type SupportCategory = 'record' | 'report' | 'credit' | 'payment' | 'account' | 'etc';
/** 문의 저장(support_requests). 분류·동의 칸은 0008 에서 생겨요 — 아직 없으면 내용만 저장해요. */
export async function sendSupport(p: { message: string; category: SupportCategory; consentAt: string }) {
  const message = p.message.trim();
  const { error } = await db().from('support_requests').insert({ message, category: p.category, consent_at: p.consentAt });
  if (!error) return;
  if (error.code === 'PGRST204' || /column/i.test(error.message)) {
    const { error: e2 } = await db().from('support_requests').insert({ message: `[${p.category}] ${message}`.slice(0, 1000) });
    if (e2) throw e2;
    return;
  }
  throw error;
}
