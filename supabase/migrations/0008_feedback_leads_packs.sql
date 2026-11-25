-- 0008: 크레딧 구매 가격 조정 · 요금제 변경 사유 · 문의(분류·개인정보 동의) · 도입 문의 서버 저장.
-- 여러 번 실행해도 안전해요.

-- ── 크레딧 구매(회차 → 크레딧). 구독보다 크레딧당 값이 비싸게(구독을 권해요) ──
-- 1크레딧당: Spotlight 약 41원 · Headliner 약 28원 / 36크레딧 1,900원(약 53원) · 72크레딧 3,500원(약 49원)
-- 바꾸면 src/lib/plans.ts 의 PACKS 도 같이 바꿔 주세요. 이미 결제된 주문 금액은 그대로예요.
create or replace function public.pack_info(p_product text)
returns table (credits int, amount int, order_name text) language sql immutable set search_path = '' as $$
  select t.credits, t.amount, t.order_name from (values
    ('pack3', 36, 1900, 'Talkstage 크레딧 36'),
    ('pack6', 72, 3500, 'Talkstage 크레딧 72')
  ) as t(product, credits, amount, order_name) where t.product = p_product;
$$;

-- ── 요금제 내릴 때 사유(필수 선택, '직접 작성'은 10자 이상) ──
create table if not exists public.plan_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  from_plan text not null,
  to_plan text not null,
  reason text not null check (reason in ('price', 'done', 'accuracy', 'feature', 'rarely', 'other')),
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default now(),
  constraint plan_changes_other_detail check (reason <> 'other' or char_length(trim(coalesce(detail, ''))) >= 10)
);
alter table public.plan_changes enable row level security;
drop policy if exists "own plan change insert" on public.plan_changes;
create policy "own plan change insert" on public.plan_changes for insert with check (auth.uid() = user_id);
drop policy if exists "own plan change read" on public.plan_changes;
create policy "own plan change read" on public.plan_changes for select using (auth.uid() = user_id);
grant select, insert on public.plan_changes to authenticated;
revoke all on public.plan_changes from anon;

-- ── 지원 문의: 분류와 개인정보 수집·이용 동의 시각 ──
alter table public.support_requests add column if not exists category text not null default 'etc';
alter table public.support_requests add column if not exists consent_at timestamptz;
alter table public.support_requests drop constraint if exists support_requests_category_check;
alter table public.support_requests add constraint support_requests_category_check
  check (category in ('record', 'report', 'credit', 'payment', 'account', 'etc'));
alter table public.support_requests drop constraint if exists support_requests_message_check;
alter table public.support_requests add constraint support_requests_message_check check (char_length(message) between 10 and 2000) not valid; -- 예전 짧은 문의가 있어도 막히지 않게(새 문의부터 적용)

-- ── 도입 문의(랜딩, 로그인 없이). 예전엔 브라우저(localStorage)에만 남았어요. 넣기만 되고 읽기는 대시보드에서. ──
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('biz', 'edu')),
  org text not null check (char_length(org) between 1 and 100),
  person text not null check (char_length(person) between 1 and 50),
  size text check (size is null or char_length(size) <= 20),
  mail text not null check (char_length(mail) between 5 and 200 and mail ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  note text check (note is null or char_length(note) <= 1000),
  consent_at timestamptz not null,
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
drop policy if exists "anyone insert lead" on public.leads;
create policy "anyone insert lead" on public.leads for insert to anon, authenticated with check (consent_at is not null);
grant insert on public.leads to anon, authenticated;
