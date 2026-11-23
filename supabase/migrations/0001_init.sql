-- Talkstage 초기 스키마. Supabase 대시보드 > SQL Editor 에서 실행하거나 `supabase db push` 로 적용해요.
-- 여러 번 실행해도 안전해요(이미 있으면 다시 만들어요).

-- 프로필: 가입하면 자동으로 한 줄 생겨요.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  plan text not null default 'Opening' check (plan in ('Opening', 'Spotlight', 'Headliner')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 리허설 기록
create table if not exists public.rehearsals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  purpose_id text not null,
  posture text not null check (posture in ('seated', 'standing')),
  topic text,
  overall int,
  scores jsonb not null default '{}'::jsonb,
  focus text,
  duration_sec int
);
create index if not exists rehearsals_user_created on public.rehearsals (user_id, created_at desc);

-- 지원 문의
create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- 행 수준 보안: 자기 데이터만 읽고 써요.
alter table public.profiles enable row level security;
alter table public.rehearsals enable row level security;
alter table public.support_requests enable row level security;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
-- 주의: 결제 연동 전 프로토타입이라 plan 도 본인이 바꿀 수 있어요.
-- 결제를 붙이면 plan 은 결제 웹훅(service role)만 바꾸도록 이 정책을 name 전용으로 좁혀 주세요.
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own rehearsals read" on public.rehearsals;
create policy "own rehearsals read" on public.rehearsals for select using (auth.uid() = user_id);
drop policy if exists "own rehearsals insert" on public.rehearsals;
create policy "own rehearsals insert" on public.rehearsals for insert with check (auth.uid() = user_id);
drop policy if exists "own rehearsals delete" on public.rehearsals;
create policy "own rehearsals delete" on public.rehearsals for delete using (auth.uid() = user_id);

drop policy if exists "own support insert" on public.support_requests;
create policy "own support insert" on public.support_requests for insert with check (auth.uid() = user_id);
drop policy if exists "own support read" on public.support_requests;
create policy "own support read" on public.support_requests for select using (auth.uid() = user_id);
