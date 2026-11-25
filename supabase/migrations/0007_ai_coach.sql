-- AI 대본 코칭: 테스트 1회권(프로모션 코드)과 크레딧 차감.
-- · 지금(테스트)은 서버 환경 변수 AI_COACH_MODE=promo(기본): 프로모션 코드를 넣은 사용자만 1회 무료.
--   코드는 DB 가 아니라 서버 환경 변수 AI_PROMO_CODES(쉼표로 여러 개)에 둬요. 여기는 "누가 언제 썼나"만 남겨요.
-- · 정식(AI_COACH_MODE=credits): 유료 요금제만, 대본 길이에 따라 크레딧 차감(ai_coach_cost).
--   이번 달 크레딧을 먼저, 모자라면 산 크레딧. 코칭이 실패하면 서버가 refund_ai_coach 로 되돌려요.
-- 모든 함수는 서버(secret key = service_role) 전용이에요. 앱(authenticated)은 자기 1회권 상태만 읽어요.
-- 여러 번 실행해도 안전해요. 차감 구간을 바꾸면 src/lib/coach/scriptCoach.ts 의 AI_COACH_TIERS 도 같이 바꿔 주세요.

grant usage on schema public to service_role;

create table if not exists public.ai_trials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null,
  redeemed_at timestamptz not null default now(),
  claimed_at timestamptz, -- 코칭 요청 중(동시에 두 번 못 쓰게)
  used_at timestamptz     -- 다 썼음
);
alter table public.ai_trials enable row level security;
drop policy if exists "own trial read" on public.ai_trials;
create policy "own trial read" on public.ai_trials for select using (auth.uid() = user_id);
grant select on public.ai_trials to authenticated;
revoke all on public.ai_trials from anon;

-- 사용 내역 사유에 AI 대본 코칭 추가(reason 은 자유 텍스트라 그대로 'ai_script' 를 써요)

-- 대본 길이(공백 포함 글자 수)별 크레딧: 2,000자까지 3 · 6,000자까지 6 · 15,000자까지 9
create or replace function public.ai_coach_cost(p_chars int)
returns int language sql immutable set search_path = '' as $$
  select case when p_chars <= 2000 then 3 when p_chars <= 6000 then 6 else 9 end;
$$;

-- 프로모션 코드 적용(코드가 맞는지는 서버가 환경 변수로 먼저 확인해요). 사람마다 한 번만.
create or replace function public.ai_trial_redeem(p_uid uuid, p_code text)
returns text language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.ai_trials (user_id, code) values (p_uid, upper(left(p_code, 40)))
  on conflict (user_id) do nothing;
  if found then return 'ok'; end if;
  return 'already';
end;
$$;

-- 1회권 상태: none(코드 안 넣음) · ready · busy(요청 중) · used
create or replace function public.ai_trial_state(p_uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when used_at is not null then 'used'
                when claimed_at is not null and claimed_at > now() - interval '5 minutes' then 'busy'
                else 'ready' end
    from public.ai_trials where user_id = p_uid), 'none');
$$;

-- 코칭 시작 전에 1회권을 잡아요(동시에 두 요청이 같은 1회권을 쓰지 못하게). 잡으면 true.
create or replace function public.ai_trial_claim(p_uid uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.ai_trials set claimed_at = now()
  where user_id = p_uid and used_at is null
    and (claimed_at is null or claimed_at <= now() - interval '5 minutes');
  return found;
end;
$$;

-- 코칭이 끝나면: 성공이면 다 쓴 걸로, 실패면 다시 쓸 수 있게 풀어요.
create or replace function public.ai_trial_finish(p_uid uuid, p_ok boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_ok then update public.ai_trials set used_at = now() where user_id = p_uid;
  else update public.ai_trials set claimed_at = null where user_id = p_uid and used_at is null;
  end if;
end;
$$;

-- 크레딧 차감(정식). 요금제 확인은 서버가 해요. 모자라면 NO_CREDITS. 사용 내역 id 를 돌려줘요(실패 시 환불용).
create or replace function public.charge_ai_coach(p_uid uuid, p_chars int)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  v_plan text;
  v_used int;
  v_cost int := public.ai_coach_cost(p_chars);
  v_source text;
  v_id uuid;
begin
  select plan into v_plan from public.profiles where id = p_uid for update;
  if not found then raise exception 'NO_PROFILE' using errcode = 'P0002'; end if;
  select coalesce(sum(amount), 0) into v_used from public.credit_ledger
    where user_id = p_uid and source = 'monthly' and created_at >= public.credit_month_start();
  if public.plan_credits(v_plan) - v_used >= v_cost then v_source := 'monthly';
  elsif public.bonus_left(p_uid) >= v_cost then v_source := 'bonus';
  else raise exception 'NO_CREDITS' using errcode = 'P0001', hint = 'credits';
  end if;
  insert into public.credit_ledger (user_id, amount, reason, source) values (p_uid, v_cost, 'ai_script', v_source)
  returning id into v_id;
  return json_build_object('ledgerId', v_id, 'cost', v_cost);
end;
$$;

-- 코칭이 실패하면 방금 뺀 크레딧을 되돌려요(그 사용자의 AI 차감만).
create or replace function public.refund_ai_coach(p_uid uuid, p_ledger_id uuid)
returns void language sql volatile security definer set search_path = '' as $$
  delete from public.credit_ledger where id = p_ledger_id and user_id = p_uid and reason = 'ai_script';
$$;

-- 권한: 전부 서버 전용
revoke all on function public.ai_coach_cost(int) from public, anon;
grant execute on function public.ai_coach_cost(int) to authenticated, service_role;
revoke all on function public.ai_trial_redeem(uuid, text) from public, anon, authenticated;
revoke all on function public.ai_trial_state(uuid) from public, anon, authenticated;
revoke all on function public.ai_trial_claim(uuid) from public, anon, authenticated;
revoke all on function public.ai_trial_finish(uuid, boolean) from public, anon, authenticated;
revoke all on function public.charge_ai_coach(uuid, int) from public, anon, authenticated;
revoke all on function public.refund_ai_coach(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_trial_redeem(uuid, text) to service_role;
grant execute on function public.ai_trial_state(uuid) to service_role;
grant execute on function public.ai_trial_claim(uuid) to service_role;
grant execute on function public.ai_trial_finish(uuid, boolean) to service_role;
grant execute on function public.charge_ai_coach(uuid, int) to service_role;
grant execute on function public.refund_ai_coach(uuid, uuid) to service_role;
