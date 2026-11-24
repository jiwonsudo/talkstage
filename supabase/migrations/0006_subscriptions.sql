-- 월 요금제 정기결제(토스페이먼츠 자동결제 · 빌링).
-- · 카드를 한 번 등록하면 빌링키를 받아 서버만 볼 수 있는 표(billing_cards)에 보관해요.
-- · 토스는 알아서 매달 결제하지 않아요. 매일 도는 예약 작업(/api/billing/cron)이 결제일이 된 구독을 결제해요.
-- · 요금제(profiles.plan)는 이제 서버(service_role)만 바꿔요. 사용자는 이름만 바꿀 수 있어요.
-- · 해지는 예약만 돼요: 결제한 기간이 끝날 때까지 쓰고 그 뒤 Opening 으로 내려가요.
-- · 업그레이드는 바로 결제(지난 요금제의 남은 날만큼 빼고)하고 오늘부터 한 달, 낮은 유료 요금제로는 다음 결제일부터 바뀌어요.
-- 여러 번 실행해도 안전해요. 가격을 바꾸면 src/lib/plans.ts 의 PLAN_PRICE 도 같이 바꿔 주세요.

-- 요금제 변경은 서버만: 본인은 이름만 수정
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

create or replace function public.plan_price(p_plan text)
returns int language sql immutable set search_path = '' as $$
  select case p_plan when 'Spotlight' then 4900 when 'Headliner' then 9900 else null end;
$$;

-- 카드(빌링키). 앱(authenticated)에는 아무 권한도 없어요.
create table if not exists public.billing_cards (
  user_id uuid primary key references auth.users (id) on delete cascade,
  customer_key text not null unique check (customer_key ~ '^[A-Za-z0-9_=.@-]{22,50}$'),
  billing_key text,
  card_label text,
  updated_at timestamptz not null default now()
);
alter table public.billing_cards enable row level security;
revoke all on public.billing_cards from anon, authenticated;

-- 구독 상태. active: 사용 중 · canceled: 해지 예약(period_end 까지 사용) · past_due: 결제 실패(다시 시도 중) · ended: 끝남
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null check (plan in ('Spotlight', 'Headliner')),
  next_plan text check (next_plan in ('Spotlight', 'Headliner')),
  status text not null check (status in ('active', 'canceled', 'past_due', 'ended')),
  period_end timestamptz not null,
  fail_count int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;

-- 정기결제 내역. kind: start(처음·다시 시작) · upgrade · renew(매달)
create table if not exists public.subscription_payments (
  id text primary key check (id ~ '^[A-Za-z0-9_=-]{6,64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null,
  kind text not null check (kind in ('start', 'upgrade', 'renew')),
  amount int not null check (amount > 0),
  status text not null default 'ready' check (status in ('ready', 'paid', 'failed')),
  payment_key text unique,
  error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists sub_payments_user on public.subscription_payments (user_id, created_at desc);
alter table public.subscription_payments enable row level security;
drop policy if exists "own sub payments read" on public.subscription_payments;
create policy "own sub payments read" on public.subscription_payments for select using (auth.uid() = user_id);
grant select on public.subscription_payments to authenticated;
revoke all on public.subscription_payments from anon;

-- ── 앱(로그인한 사용자)이 부르는 함수 ──────────────────────────────

-- 카드 등록창에 넘길 customerKey(처음이면 새로 만들어요) + 내 구독·카드 현황
create or replace function public.my_subscription()
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.billing_cards;
  s public.subscriptions;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN' using errcode = '28000'; end if;
  select * into c from public.billing_cards where user_id = uid;
  if not found then
    insert into public.billing_cards (user_id, customer_key)
      values (uid, 'cus_' || replace(gen_random_uuid()::text, '-', ''))
      returning * into c;
  end if;
  select * into s from public.subscriptions where user_id = uid;
  return json_build_object(
    'customerKey', c.customer_key,
    'card', case when c.billing_key is null then null else coalesce(c.card_label, '등록된 카드') end,
    'status', case when s.user_id is null then null else s.status end,
    'plan', s.plan, 'nextPlan', s.next_plan, 'periodEnd', s.period_end,
    'price', public.plan_price(coalesce(s.next_plan, s.plan)));
end;
$$;

-- 해지 예약. 결제한 기간이 끝날 때까지 지금 요금제를 써요. (구독 없이 유료인 예전 계정은 바로 Opening)
create or replace function public.sub_cancel()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  s public.subscriptions;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN' using errcode = '28000'; end if;
  select * into s from public.subscriptions where user_id = uid for update;
  if not found or s.status = 'ended' then
    update public.profiles set plan = 'Opening' where id = uid;
  elsif s.status = 'past_due' then
    update public.subscriptions set status = 'ended', updated_at = now() where user_id = uid;
    update public.profiles set plan = 'Opening' where id = uid;
  else
    update public.subscriptions set status = 'canceled', next_plan = null, updated_at = now() where user_id = uid;
  end if;
end;
$$;

-- 해지 예약 취소
create or replace function public.sub_resume()
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.subscriptions set status = 'active', updated_at = now()
    where user_id = auth.uid() and status = 'canceled' and period_end > now();
  if not found then raise exception 'NOTHING_TO_RESUME' using errcode = 'P0001'; end if;
end;
$$;

-- 다음 결제일부터 낮은 유료 요금제로(또는 같은 요금제로 되돌리기)
create or replace function public.sub_schedule(p_plan text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.subscriptions;
begin
  select * into s from public.subscriptions where user_id = auth.uid() for update;
  if not found or s.status not in ('active', 'canceled') then raise exception 'NO_SUBSCRIPTION' using errcode = 'P0001'; end if;
  if public.plan_price(p_plan) is null or public.plan_price(p_plan) > public.plan_price(s.plan) then
    raise exception 'USE_UPGRADE' using errcode = '22023';
  end if;
  update public.subscriptions set status = 'active', next_plan = nullif(p_plan, s.plan), updated_at = now() where user_id = s.user_id;
end;
$$;

-- ── 서버(service_role)만 부르는 함수 ───────────────────────────────

create or replace function public.billing_for(p_uid uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('customerKey', customer_key, 'billingKey', billing_key) from public.billing_cards where user_id = p_uid;
$$;

create or replace function public.billing_save(p_uid uuid, p_billing_key text, p_card_label text)
returns void language sql volatile security definer set search_path = '' as $$
  update public.billing_cards set billing_key = p_billing_key, card_label = left(p_card_label, 60), updated_at = now() where user_id = p_uid;
$$;

create or replace function public.billing_forget(p_uid uuid)
returns void language sql volatile security definer set search_path = '' as $$
  update public.billing_cards set billing_key = null, card_label = null, updated_at = now() where user_id = p_uid;
$$;

-- 결제할 주문 만들기. 금액은 여기서 정해요(업그레이드는 지난 요금제의 남은 날만큼 빼요, 최소 100원).
create or replace function public.sub_new_payment(p_uid uuid, p_plan text, p_kind text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.subscriptions;
  price int := public.plan_price(p_plan);
  amt int;
  oid text := 'tss_' || replace(gen_random_uuid()::text, '-', '');
  left_frac numeric;
begin
  if price is null then raise exception 'NO_SUCH_PLAN' using errcode = '22023'; end if;
  select * into s from public.subscriptions where user_id = p_uid for update;
  amt := price;
  if p_kind = 'upgrade' then
    if not found or s.status not in ('active', 'canceled') or s.period_end <= now() or public.plan_price(s.plan) >= price then
      raise exception 'NOT_AN_UPGRADE' using errcode = '22023';
    end if;
    left_frac := least(1, extract(epoch from (s.period_end - now())) / extract(epoch from (s.period_end - (s.period_end - interval '1 month'))));
    amt := greatest(100, price - floor(public.plan_price(s.plan) * left_frac)::int);
  elsif p_kind = 'start' then
    if found and s.status in ('active', 'canceled') and s.period_end > now() then raise exception 'ALREADY_SUBSCRIBED' using errcode = '22023'; end if;
  elsif p_kind <> 'renew' then
    raise exception 'BAD_KIND' using errcode = '22023';
  end if;
  insert into public.subscription_payments (id, user_id, plan, kind, amount) values (oid, p_uid, p_plan, p_kind, amt);
  return json_build_object('orderId', oid, 'amount', amt, 'orderName', 'Talkstage ' || p_plan || ' 월 요금제');
end;
$$;

-- 결제 성공: 구독을 켜거나 늘리고 요금제를 바꿔요.
create or replace function public.sub_payment_paid(p_order_id text, p_payment_key text, p_amount int)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.subscription_payments;
  s public.subscriptions;
  v_end timestamptz;
begin
  select * into p from public.subscription_payments where id = p_order_id for update;
  if not found then raise exception 'NO_SUCH_ORDER' using errcode = 'P0002'; end if;
  if p.status = 'paid' then
    select period_end into v_end from public.subscriptions where user_id = p.user_id;
    return json_build_object('plan', p.plan, 'periodEnd', v_end, 'already', true);
  end if;
  if p.amount <> p_amount then raise exception 'AMOUNT_MISMATCH' using errcode = 'P0001'; end if;
  update public.subscription_payments set status = 'paid', payment_key = p_payment_key, paid_at = now(), error = null where id = p_order_id;

  select * into s from public.subscriptions where user_id = p.user_id for update;
  -- 매달 결제는 지난 결제일에 한 달을 더해요(늦게 결제돼도 날짜가 밀리지 않게). 처음·업그레이드는 오늘부터 한 달.
  v_end := case when p.kind = 'renew' and s.user_id is not null then greatest(s.period_end + interval '1 month', now() + interval '1 day')
                else now() + interval '1 month' end;
  insert into public.subscriptions (user_id, plan, next_plan, status, period_end, fail_count, updated_at)
    values (p.user_id, p.plan, null, 'active', v_end, 0, now())
    on conflict (user_id) do update set plan = excluded.plan, next_plan = null, status = 'active',
      period_end = excluded.period_end, fail_count = 0, updated_at = now();
  update public.profiles set plan = p.plan where id = p.user_id;
  return json_build_object('plan', p.plan, 'periodEnd', v_end, 'already', false);
end;
$$;

-- 결제 실패. 매달 결제가 실패하면 하루에 한 번씩 세 번까지 다시 시도하고, 그래도 안 되면 Opening 으로.
create or replace function public.sub_payment_failed(p_order_id text, p_error text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.subscription_payments;
  n int;
begin
  update public.subscription_payments set status = 'failed', error = left(p_error, 300)
    where id = p_order_id and status = 'ready' returning * into p;
  if not found or p.kind <> 'renew' then return; end if;
  update public.subscriptions set status = 'past_due', fail_count = fail_count + 1, updated_at = now()
    where user_id = p.user_id returning fail_count into n;
  if n >= 3 then perform public.sub_expire(p.user_id); end if;
end;
$$;

create or replace function public.sub_expire(p_uid uuid)
returns void language sql volatile security definer set search_path = '' as $$
  update public.subscriptions set status = 'ended', next_plan = null, updated_at = now() where user_id = p_uid;
  update public.profiles set plan = 'Opening' where id = p_uid;
$$;

-- 오늘 처리할 구독: 결제일이 지난 사용 중·결제 실패 구독(→ 결제), 기간이 끝난 해지 예약(→ 종료)
create or replace function public.sub_due()
returns setof json language sql stable security definer set search_path = '' as $$
  select json_build_object('userId', s.user_id, 'status', s.status, 'plan', coalesce(s.next_plan, s.plan),
    'customerKey', c.customer_key, 'billingKey', c.billing_key)
  from public.subscriptions s left join public.billing_cards c on c.user_id = s.user_id
  where s.period_end <= now() and s.status in ('active', 'past_due', 'canceled')
    -- 결제 실패 뒤에는 하루에 한 번만 다시 시도
    and (s.status <> 'past_due' or s.updated_at <= now() - interval '20 hours')
  limit 200;
$$;

-- 권한
revoke all on function public.plan_price(text) from public, anon;
grant execute on function public.plan_price(text) to authenticated, service_role;
revoke all on function public.my_subscription() from public, anon;
revoke all on function public.sub_cancel() from public, anon;
revoke all on function public.sub_resume() from public, anon;
revoke all on function public.sub_schedule(text) from public, anon;
grant execute on function public.my_subscription() to authenticated;
grant execute on function public.sub_cancel() to authenticated;
grant execute on function public.sub_resume() to authenticated;
grant execute on function public.sub_schedule(text) to authenticated;
revoke all on function public.billing_for(uuid) from public, anon, authenticated;
revoke all on function public.billing_save(uuid, text, text) from public, anon, authenticated;
revoke all on function public.billing_forget(uuid) from public, anon, authenticated;
revoke all on function public.sub_new_payment(uuid, text, text) from public, anon, authenticated;
revoke all on function public.sub_payment_paid(text, text, int) from public, anon, authenticated;
revoke all on function public.sub_payment_failed(text, text) from public, anon, authenticated;
revoke all on function public.sub_expire(uuid) from public, anon, authenticated;
revoke all on function public.sub_due() from public, anon, authenticated;
grant execute on function public.billing_for(uuid) to service_role;
grant execute on function public.billing_save(uuid, text, text) to service_role;
grant execute on function public.billing_forget(uuid) to service_role;
grant execute on function public.sub_new_payment(uuid, text, text) to service_role;
grant execute on function public.sub_payment_paid(text, text, int) to service_role;
grant execute on function public.sub_payment_failed(text, text) to service_role;
grant execute on function public.sub_expire(uuid) to service_role;
grant execute on function public.sub_due() to service_role;
