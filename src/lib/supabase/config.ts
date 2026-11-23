// 대시보드에서 .../rest/v1/ 까지 복사해 와도 프로젝트 주소만 남겨요.
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');
/** 브라우저에서 써도 되는 공개 키(sb_publishable_...). 예전 anon key 이름도 받아요. */
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// .env.example 의 자리표시자(YOUR-...)가 그대로면 아직 연결 안 된 걸로 봐요.
export const filled = (v: string | undefined): v is string => Boolean(v) && !v!.includes('YOUR-');
/** .env.local 에 Supabase 값이 있어야 로그인이 동작해요. */
export const supabaseReady = filled(SUPABASE_URL) && filled(SUPABASE_PUBLISHABLE_KEY);
