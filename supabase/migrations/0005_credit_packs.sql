-- 리허설 회차 추가 구매(토스페이먼츠 결제위젯).
-- · 금액은 DB 가 정해요(pack_info). 브라우저가 보낸 금액은 믿지 않아요.
-- · 주문은 로그인한 사용자가 create_order() 로 만들고, 결제 완료 처리는 서버(secret key = service_role)만
--   complete_order() 로 해요. 그래서 사용자가 결제 없이 '결제됨'으로 바꿀 수 없어요.
-- · 산 크레딧은 매달 초기화되지 않고 남아요. 리허설은 이번 달 크레딧을 먼저 쓰고, 모자라면 산 크레딧을 써요.
-- 여러 번 실행해도 안전해요. 상품·가격을 바꾸면 src/lib/plans.ts 의 PACKS 도 같이 바꿔 주세요.

grant usage on schema public to service_role;

-- 사용 내역이 어느 크레딧에서 나갔는지(이번 달 / 산 크레딧)
alter table public.credit_ledger add column if not exists source text not null default 'monthly';
alter table public.credit_ledger drop constraint if exists credit_ledger_source_check;
alter table public.credit_ledger add constraint credit_ledger_source_check check (source in ('monthly', 'bonus'));

-- 상품: 리허설 3회(36크레딧) · 6회(72크레딧)
create or replace function public.pack_info(p_product text)
returns table (credits int, amount int, order_name text) language sql immutable set search_path = '' as $$
  select t.credits, t.amount, t.order_name from (values
    ('pack3', 36, 1500, 'Talkstage 리허설 3회'),
    ('pack6', 72, 2500, 'Talkstage 리허설 6회')
  ) as t(product, credits, amount, order_name) where t.product = p_product;
$$;

create table if not exists public.orders (
  id text primary key check (id ~ '^[A-Za-z0-9_=-]{6,64}$'), -- 토스 orderId 규칙
  user_id uuid not null references auth.users (id) on delete cascade,
  product text not null,
  credits int not null check (credits > 0),
  amount int not null check (amount > 0),
  status text not null default 'ready' check (status in ('ready', 'paid')),
  payment_key text unique,
  method text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists orders_user_created on public.orders (user_id, created_at desc);
alter table public.orders enable row level security;
drop policy if exists "own orders read" on public.orders;
create policy "own orders read" on public.orders for select using (auth.uid() = user_id);
grant select on public.orders to authenticated;
revoke all on public.orders from anon;

-- 산 크레딧 남은 양 = 결제된 주문 합 - 산 크레딧에서 쓴 양
create or replace function public.bonus_left(p_uid uuid)
returns int language sql stable security definer set search_path = '' as $$
  select greatest(0,
    coalesce((select sum(credits) from public.orders where user_id = p_uid and status = 'paid'), 0)
    - coalesce((select sum(amount) from public.credit_ledger where user_id = p_uid and source = 'bonus'), 0))::int;
$$;

-- 주문 만들기(로그인한 사용자). 결제창에 넘길 orderId·금액·주문 이름을 돌려줘요.
create or replace function public.create_order(p_product text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  p record;
  oid text := 'ts_' || replace(gen_random_uuid()::text, '-', '');
begin
  if uid is null then raise exception 'NOT_SIGNED_IN' using errcode = '28000'; end if;
  select * into p from public.pack_info(p_product);
  if not found then raise exception 'NO_SUCH_PRODUCT' using errcode = '22023'; end if;
  insert into public.orders (id, user_id, product, credits, amount) values (oid, uid, p_product, p.credits, p.amount);
  return json_build_object('orderId', oid, 'amount', p.amount, 'orderName', p.order_name, 'credits', p.credits);
end;
$$;

-- 결제 승인 전에 서버가 주문을 확인할 때(서버 전용)
create or replace function public.order_for_confirm(p_order_id text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('orderId', id, 'userId', user_id, 'amount', amount, 'credits', credits, 'status', status, 'paymentKey', payment_key)
  from public.orders where id = p_order_id;
$$;

-- 토스 승인이 끝난 주문을 '결제됨'으로(서버 전용). 같은 주문을 두 번 불러도 한 번만 반영돼요.
create or replace function public.complete_order(p_order_id text, p_payment_key text, p_amount int, p_method text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'NO_SUCH_ORDER' using errcode = 'P0002'; end if;
  if o.status = 'paid' then
    if o.payment_key = p_payment_key then return json_build_object('credits', o.credits, 'already', true); end if;
    raise exception 'ORDER_ALREADY_PAID' using errcode = 'P0001';
  end if;
  if o.amount <> p_amount then raise exception 'AMOUNT_MISMATCH' using errcode = 'P0001'; end if;
  update public.orders set status = 'paid', payment_key = p_payment_key, method = left(p_method, 40), paid_at = now()
    where id = p_order_id;
  return json_build_object('credits', o.credits, 'already', false);
end;
$$;

-- 크레딧 현황: 이번 달(total/used) + 산 크레딧(bonus). left 는 둘을 합친 값이에요.
create or replace function public.credits_left()
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_plan text;
  v_used int;
  v_total int;
  v_bonus int;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN' using errcode = '28000'; end if;
  select plan into v_plan from public.profiles where id = uid;
  v_total := public.plan_credits(coalesce(v_plan, 'Opening'));
  select coalesce(sum(amount), 0) into v_used from public.credit_ledger
    where user_id = uid and source = 'monthly' and created_at >= public.credit_month_start();
  v_bonus := public.bonus_left(uid);
  return json_build_object('plan', coalesce(v_plan, 'Opening'), 'total', v_total, 'used', v_used,
    'bonus', v_bonus, 'left', greatest(0, v_total - v_used) + v_bonus, 'cost', 12);
end;
$$;

-- 리허설 저장: 이번 달 크레딧 먼저, 모자라면 산 크레딧. 둘 다 모자라면 NO_CREDITS.
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
  v_source text;
  v_row public.rehearsals;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN' using errcode = '28000'; end if;
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

  insert into public.rehearsals (user_id, purpose_id, posture, topic, overall, scores, focus, duration_sec)
  values (uid, p_purpose_id, p_posture, nullif(left(p_topic, 200), ''), p_overall, coalesce(p_scores, '{}'::jsonb), p_focus, p_duration_sec)
  returning * into v_row;
  insert into public.credit_ledger (user_id, amount, reason, rehearsal_id, source) values (uid, cost, 'rehearsal', v_row.id, v_source);
  return v_row;
end;
$$;

-- 권한
revoke all on function public.pack_info(text) from public, anon;
revoke all on function public.bonus_left(uuid) from public, anon, authenticated;
revoke all on function public.create_order(text) from public, anon;
revoke all on function public.order_for_confirm(text) from public, anon, authenticated;
revoke all on function public.complete_order(text, text, int, text) from public, anon, authenticated;
grant execute on function public.pack_info(text) to authenticated;
grant execute on function public.create_order(text) to authenticated;
grant execute on function public.order_for_confirm(text) to service_role;
grant execute on function public.complete_order(text, text, int, text) to service_role;
