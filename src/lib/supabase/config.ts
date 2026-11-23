export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
/** .env.local 에 Supabase 값이 있어야 로그인이 동작해요. */
export const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
