import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/supabase/server';
import { filled, SUPABASE_URL } from '@/lib/supabase/config';

/** 로그인한 본인 계정을 지워요. 리허설 기록은 외래 키(on delete cascade)로 함께 지워져요. */
export async function DELETE() {
  // 서버 전용 비밀 키(sb_secret_...). 예전 service_role 이름도 받아요.
  const service = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!filled(service) || !SUPABASE_URL) return NextResponse.json({ error: '서버에 비밀 키(SUPABASE_SECRET_KEY)가 없어서 지금은 삭제할 수 없어요.' }, { status: 501 });
  const supabase = await getServerSupabase();
  const { data: { user } } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  const admin = createClient(SUPABASE_URL, service, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: '계정을 삭제하지 못했어요.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
