import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabaseReady } from './config';

/** 서버 컴포넌트 · 라우트 핸들러용 Supabase 클라이언트. */
export async function getServerSupabase() {
  if (!supabaseReady) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없어요. 세션 갱신은 proxy.ts 가 맡아요.
        }
      },
    },
  });
}
