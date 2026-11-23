import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabaseReady } from '@/lib/supabase/config';

/** 요청마다 Supabase 세션 쿠키를 갱신하고, /me 는 로그인한 사람만 들어오게 해요. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!supabaseReady) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && (request.nextUrl.pathname.startsWith('/me') || request.nextUrl.pathname.startsWith('/rehearsal'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = `?login=1&next=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|media/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)'],
};
