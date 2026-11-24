import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/supabase/server';
import { filled, SUPABASE_URL } from '@/lib/supabase/config';
import { billingSecret, deleteBillingKey } from '@/lib/billing/server';

/**
 * 카카오로 가입한 계정이면 카카오 쪽 연결도 끊어요(카카오 정책: 탈퇴하면 연결 끊기).
 * 사용자 토큰은 저장하지 않아서 서버 전용 어드민 키(KAKAO_ADMIN_KEY)로 회원번호를 지정해 끊어요. 키가 없으면 건너뛰어요.
 */
async function unlinkKakao(kakaoId: string) {
  const key = process.env.KAKAO_ADMIN_KEY;
  if (!filled(key)) return;
  const res = await fetch('https://kapi.kakao.com/v1/user/unlink', {
    method: 'POST',
    headers: { Authorization: `KakaoAK ${key}`, 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams({ target_id_type: 'user_id', target_id: kakaoId }),
  });
  if (!res.ok) throw new Error(`kakao unlink ${res.status}`);
}

/** 로그인한 본인 계정을 지워요. 리허설 기록은 외래 키(on delete cascade)로 함께 지워져요. */
export async function DELETE() {
  // 서버 전용 비밀 키(sb_secret_...). 예전 service_role 이름도 받아요.
  const service = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!filled(service) || !SUPABASE_URL) return NextResponse.json({ error: '서버에 비밀 키(SUPABASE_SECRET_KEY)가 없어서 지금은 삭제할 수 없어요.' }, { status: 501 });
  const supabase = await getServerSupabase();
  const { data: { user } } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  const admin = createClient(SUPABASE_URL, service, { auth: { persistSession: false } });
  // 정기결제 카드가 있으면 토스에서도 빌링키를 지워요(실패해도 계정 삭제는 계속)
  const { data: card } = await admin.rpc('billing_for', { p_uid: user.id });
  const bk = (card as { billingKey: string | null } | null)?.billingKey;
  if (bk && billingSecret()) await deleteBillingKey(bk).catch((e) => console.error('billing key delete failed', (e as Error).message));
  const kakao = user.identities?.find((i) => i.provider === 'kakao');
  const kakaoId = (kakao?.identity_data?.provider_id ?? kakao?.identity_data?.sub ?? kakao?.id) as string | undefined;
  if (kakaoId) await unlinkKakao(String(kakaoId)).catch((e) => console.error('kakao unlink failed', (e as Error).message));
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: '계정을 삭제하지 못했어요.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
