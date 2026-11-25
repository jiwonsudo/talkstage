-- 0009: 음성만 리허설(카메라 없이) 기록 구분 · 다운그레이드 사유 여러 개(우선순위) · 크레딧 단위 48(발표 하나)로 요금제·묶음 조정.
-- 여러 번 실행해도 안전해요. 한 덩어리(트랜잭션)로 돌아서 중간에 오류가 나면 전부 되돌아가요.

-- ── 리허설 방식: full(영상+음성) · voice(음성만). 회차 비교에서 방식이 다른 회차를 구분해요 ──
alter table public.rehearsals add column if not exists mode text not null default 'full';
alter table public.rehearsals drop constraint if exists rehearsals_mode_check;
alter table public.rehearsals add constraint rehearsals_mode_check check (mode in ('full', 'voice'));

-- 저장 함수에 방식(p_mode)을 더해요. 인자 수가 달라 예전 함수는 지워요(같은 이름이 둘이면 호출이 모호해져요).
drop function if exists public.record_rehearsal(text, text, text, int, jsonb, text, int);
create or replace function public.record_rehearsal(
  p_purpose_id text, p_posture text, p_topic text, p_overall int,
  p_scores jsonb, p_focus text, p_duration_sec int, p_mode text default 'full'
)
returns public.rehearsals language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cost constant int := 12;
  v_plan text;
  v_used int;
  v_source text;
  v_row public.rehearsals;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN' using errcode = '28000'; end if;
  if coalesce(p_mode, 'full') not in ('full', 'voice') then raise exception 'BAD_MODE' using errcode = '22023'; end if;
  -- 같은 사용자의 동시 요청이 둘 다 통과하지 않도록 프로필 행을 잠가요.
  select plan into v_plan from public.profiles where id = uid for update;
  if not found then raise exception 'NO_PROFILE' using errcode = 'P0002'; end if;
  -- 20초 미만이거나 점수가 없으면 리허설로 치지 않아요(앱도 같은 조건으로 막아요).
  if coalesce(p_duration_sec, 0) < 20 or p_overall is null then
    raise exception 'NOT_A_REHEARSAL' using errcode = '22023';
  end if;
  select coalesce(sum(amount), 0) into v_used from public.credit_ledger
    where user_id = uid and source = 'monthly' and created_at >= public.credit_month_start();
  if public.plan_credits(v_plan) - v_used >= cost then v_source := 'monthly';
  elsif public.bonus_left(uid) >= cost then v_source := 'bonus';
  else raise exception 'NO_CREDITS' using errcode = 'P0001', hint = 'credits';
  end if;

  insert into public.rehearsals (user_id, purpose_id, posture, topic, overall, scores, focus, duration_sec, mode)
  values (uid, p_purpose_id, p_posture, nullif(left(p_topic, 200), ''), p_overall, coalesce(p_scores, '{}'::jsonb), p_focus, p_duration_sec, coalesce(p_mode, 'full'))
  returning * into v_row;
  insert into public.credit_ledger (user_id, amount, reason, rehearsal_id, source) values (uid, cost, 'rehearsal', v_row.id, v_source);
  return v_row;
end;
$$;
revoke all on function public.record_rehearsal(text, text, text, int, jsonb, text, int, text) from public, anon;
grant execute on function public.record_rehearsal(text, text, text, int, jsonb, text, int, text) to authenticated;

-- ── 다운그레이드 사유: 최대 3개, 순서가 우선순위(reason 은 1순위로 계속 채워요) ──
alter table public.plan_changes add column if not exists reasons text[];
alter table public.plan_changes drop constraint if exists plan_changes_reasons_check;
alter table public.plan_changes add constraint plan_changes_reasons_check check (
  reasons is null or (
    cardinality(reasons) between 1 and 3
    and reasons <@ array['price', 'done', 'accuracy', 'feature', 'rarely', 'other']::text[]
    and reasons[1] = reason
  )
) not valid;
alter table public.plan_changes drop constraint if exists plan_changes_reasons_other_detail;
alter table public.plan_changes add constraint plan_changes_reasons_other_detail check (
  reasons is null or not ('other' = any (reasons)) or char_length(trim(coalesce(detail, ''))) >= 10
) not valid;

-- ── 크레딧 기준 단위 = 발표 하나 준비 ≈ 48크레딧(AI 대본 코칭 1번 + 같은 발표 리허설 3~4번) ──
-- 요금제: Opening 36(리허설 3번, 그대로) · Spotlight 120 → 144(발표 약 3개) · Headliner 360 → 384(발표 약 8개). 가격은 그대로.
-- src/lib/plans.ts 의 PLANS 와 같아야 해요.
create or replace function public.plan_credits(p_plan text)
returns int language sql immutable set search_path = '' as $$
  select case p_plan when 'Opening' then 36 when 'Spotlight' then 144 when 'Headliner' then 384 else 0 end;
$$;

-- ── 크레딧 구매 묶음: 48의 배수, 많이 살수록 할인. 어떤 묶음도 구독보다는 1크레딧이 비싸요 ──
-- 1크레딧: 48=50원 · 96=약 47원 · 192=약 45원 · 288=약 43원 · 480=40원 (Spotlight 약 34원, Headliner 약 25.8원)
-- 예전 묶음(pack3·pack6)은 더 팔지 않아요(이미 산 주문·크레딧은 그대로). 바꾸면 src/lib/plans.ts 의 PACKS 도 같이.
create or replace function public.pack_info(p_product text)
returns table (credits int, amount int, order_name text) language sql immutable set search_path = '' as $$
  select t.credits, t.amount, t.order_name from (values
    ('pack48', 48, 2400, 'Talkstage 크레딧 48'),
    ('pack96', 96, 4500, 'Talkstage 크레딧 96'),
    ('pack192', 192, 8600, 'Talkstage 크레딧 192'),
    ('pack288', 288, 12400, 'Talkstage 크레딧 288'),
    ('pack480', 480, 19200, 'Talkstage 크레딧 480')
  ) as t(product, credits, amount, order_name) where t.product = p_product;
$$;

-- API 가 새 칸·함수를 바로 알도록
notify pgrst, 'reload schema';
