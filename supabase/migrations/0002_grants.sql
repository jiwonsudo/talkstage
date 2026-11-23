-- 새 Supabase 프로젝트는 테이블 권한을 자동으로 주지 않아요.
-- 로그인한 사용자(authenticated)에게 앱이 쓰는 만큼만 열고, 실제로 어떤 행을 볼 수 있는지는 RLS 정책이 정해요.
-- 로그인 안 한 방문자(anon)에게는 아무 권한도 주지 않아요. 여러 번 실행해도 안전해요.
grant usage on schema public to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.rehearsals to authenticated;
grant select, insert on public.support_requests to authenticated;

revoke all on public.profiles, public.rehearsals, public.support_requests from anon;
