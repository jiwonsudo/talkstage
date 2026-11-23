-- 요금제 조정(2026-11): Spotlight 240 → 120, Headliner 600 → 360 크레딧. Opening 36 은 그대로.
-- src/lib/plans.ts 의 PLANS 와 같아야 해요. 여러 번 실행해도 안전해요.
create or replace function public.plan_credits(p_plan text)
returns int language sql immutable set search_path = '' as $$
  select case p_plan when 'Opening' then 36 when 'Spotlight' then 120 when 'Headliner' then 360 else 0 end;
$$;
