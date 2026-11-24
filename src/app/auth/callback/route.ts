import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

/** 소셜 로그인 · 이메일 인증 링크가 돌아오는 곳. 코드를 세션으로 바꾸고 원래 화면으로 보내요. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  if (code) {
    const supabase = await getServerSupabase();
    const { error } = (await supabase?.auth.exchangeCodeForSession(code)) ?? { error: new Error('no supabase') };
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }
  const detail = searchParams.get('error_description') ?? '';
  if (detail) console.error('social login failed', searchParams.get('error_code'), detail);
  // 취소했거나(카카오·구글 동의 화면에서 취소) 교환에 실패하면 로그인 창을 다시 열고, 원래 가려던 화면은 그대로 기억해요.
  const cancelled = searchParams.get('error') === 'access_denied';
  const why = cancelled ? 'cancelled' : /email/i.test(detail) ? 'email' : 'social';
  return NextResponse.redirect(`${origin}/?login=1&error=${why}&next=${encodeURIComponent(safeNext)}`);
}
