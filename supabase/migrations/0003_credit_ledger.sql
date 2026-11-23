-- 크레딧을 서버에서 제대로 세요.
-- · 사용 내역(credit_ledger)을 따로 남겨서, 리허설 기록을 지워도 이번 달 사용량은 그대로예요.
-- · 기록 저장은 record_rehearsal() 로만 해요. 남은 크레딧을 확인하고, 기록과 사용 내역을 한 번에 넣어요.
--   그래서 앱(authenticated)이 rehearsals 에 직접 insert 하는 권한은 거둬요.
-- · 한 달은 한국 시간 기준 1일 0시부터예요.
-- 여러 번 실행해도 안전해요. 요금제 크레딧·1회 비용을 바꾸면 src/lib/plans.ts 도 같이 바꿔 주세요.

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount int not null check (amount > 0),
  reason text not null default 'rehearsal',
  rehearsal_id uuid references public.rehearsals (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_user_created on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;
drop policy if exists "own ledger read" on public.credit_ledger;
create policy "own ledger read" on public.credit_ledger for select using (auth.uid() = user_id);

-- 이미 있는 이번 달·지난 기록도 사용 내역으로 옮겨 둬요(한 번만).
insert into public.credit_ledger (user_id, amount, reason, rehearsal_id, created_at)
select r.user_id, 12, 'rehearsal', r.id, r.created_at
from public.rehearsals r
where not exists (select 1 from public.credit_ledger l where l.rehearsal_id = r.id);

-- 요금제별 월 크레딧 (src/lib/plans.ts 의 PLANS 와 같아야 해요)
create or replace function public.plan_credits(p_plan text)
returns int language sql immutable set search_path = '' as $$
  select case p_plan when 'Opening' then 36 when 'Spotlight' then 240 when 'Headliner' then 600 else 0 end;
$$;

create or replace function public.credit_month_start()
returns timestamptz language sql stable set search_path = '' as $$
  select date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
$$;

-- 이번 달 크레딧 현황: { plan, total, used, left, cost }
create or replace function public.credits_left()
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_plan text;
  v_used int;
  v_total int;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN' using errcode = '28000'; end if;
  select plan into v_plan from public.profiles where id = uid;
  v_total := public.plan_credits(coalesce(v_plan, 'Opening'));
  select coalesce(sum(amount), 0) into v_used from public.credit_ledger
    where user_id = uid and created_at >= public.credit_month_start();
  return json_build_object('plan', coalesce(v_plan, 'Opening'), 'total', v_total, 'used', v_used,
    'left', greatest(0, v_total - v_used), 'cost', 12);
end;
$$;

-- 리허설 한 번을 기록하고 크레딧 12를 써요. 모자라면 NO_CREDITS 로 거절해요.
create or replace function public.record_rehearsal(
  p_purpose_id text, p_posture text, p_topic text, p_overall int,
  p_scores jsonb, p_focus text, p_duration_sec int
)
returns public.rehearsals language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cost constant int := 12;
  v_plan text;
  v_used int;
  v_row public.rehearsals;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN' using errcode = '28000'; end if;
  -- 같은 사용자의 동시 요청이 둘 다 통과하지 않도록 프로필 행을 잠가요.
  select plan into v_plan from public.profiles where id = uid for update;
  if not found then raise exception 'NO_PROFILE' using errcode = 'P0002'; end if;
  select coalesce(sum(amount), 0) into v_used from public.credit_ledger
    where user_id = uid and created_at >= public.credit_month_start();
  if public.plan_credits(v_plan) - v_used < cost then
    raise exception 'NO_CREDITS' using errcode = 'P0001', hint = 'credits';
  end if;

  insert into public.rehearsals (user_id, purpose_id, posture, topic, overall, scores, focus, duration_sec)
  values (uid, p_purpose_id, p_posture, nullif(left(p_topic, 200), ''), p_overall, coalesce(p_scores, '{}'::jsonb), p_focus, p_duration_sec)
  returning * into v_row;
  insert into public.credit_ledger (user_id, amount, reason, rehearsal_id) values (uid, cost, 'rehearsal', v_row.id);
  return v_row;
end;
$$;

-- 권한: 앱은 함수로만 저장하고, 사용 내역은 읽기만 해요.
revoke insert on public.rehearsals from authenticated;
drop policy if exists "own rehearsals insert" on public.rehearsals;
grant select on public.credit_ledger to authenticated;
revoke all on public.credit_ledger from anon;

revoke all on function public.plan_credits(text) from public, anon;
revoke all on function public.credit_month_start() from public, anon;
revoke all on function public.credits_left() from public, anon;
revoke all on function public.record_rehearsal(text, text, text, int, jsonb, text, int) from public, anon;
grant execute on function public.plan_credits(text) to authenticated;
grant execute on function public.credit_month_start() to authenticated;
grant execute on function public.credits_left() to authenticated;
grant execute on function public.record_rehearsal(text, text, text, int, jsonb, text, int) to authenticated;
