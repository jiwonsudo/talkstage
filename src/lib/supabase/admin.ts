import { createClient } from '@supabase/supabase-js';
import { filled, SUPABASE_URL } from './config';

/**
 * 서버 전용 관리자 클라이언트(secret key = service_role). 라우트 핸들러에서만 import 하세요.
 * 테이블 권한은 없고, service_role 에 열어 둔 함수(complete_order 등)와 auth admin API 만 써요.
 */
export function getAdminSupabase() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!filled(key) || !SUPABASE_URL) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}
