import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { billingSecret, issueBillingKey, payPlan } from '@/lib/billing/server';

type Body = { authKey?: unknown; customerKey?: unknown; plan?: unknown };
type Card = { customerKey: string; billingKey: string | null };
type Sub = { status: string | null; plan: string | null; periodEnd: string | null };

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const PAID = ['Spotlight', 'Headliner'] as const;
const rank = (p: string | null) => (p === 'Headliner' ? 2 : p === 'Spotlight' ? 1 : 0);

/**
 * 월 요금제 시작·업그레이드(로그인한 본인만).
 * - authKey 가 있으면(카드 등록창에서 돌아온 경우) 먼저 빌링키를 발급해 카드를 바꿔 둬요. plan 이 없으면 카드만 바꾸고 끝.
 * - plan 이 있으면 등록된 카드로 바로 결제해요. 금액은 DB 가 정해요(업그레이드는 남은 날만큼 빼요).
 */
export async function POST(req: Request) {
  const admin = getAdminSupabase();
  if (!billingSecret() || !admin) return fail('서버에 정기결제 설정이 없어요.', 501);
  const supabase = await getServerSupabase();
  const { data: { user } } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!user || !supabase) return fail('로그인이 필요해요.', 401);

  const b = (await req.json().catch(() => ({}))) as Body;
  const authKey = typeof b.authKey === 'string' && b.authKey.length <= 300 ? b.authKey : '';
  const plan = typeof b.plan === 'string' ? b.plan : '';
  if (plan && !(PAID as readonly string[]).includes(plan)) return fail('고를 수 없는 요금제예요.');
  if (!authKey && !plan) return fail('요청이 올바르지 않아요.');

  const { data: c } = await admin.rpc('billing_for', { p_uid: user.id });
  const card = c as Card | null;
  if (!card) return fail('카드 등록 정보를 찾지 못했어요. 다시 시도해 주세요.', 404);

  if (authKey) {
    // 돌아온 customerKey 가 이 사용자 것인지 확인(남의 카드 등록 결과를 끼워 넣지 못하게)
    if (b.customerKey !== card.customerKey) return fail('카드 등록 정보가 맞지 않아요.', 403);
    try {
      const k = await issueBillingKey(authKey, card.customerKey);
      const { error } = await admin.rpc('billing_save', { p_uid: user.id, p_billing_key: k.billingKey, p_card_label: k.label });
      if (error) throw new Error('카드를 저장하지 못했어요.');
      card.billingKey = k.billingKey;
    } catch (e) { return fail((e as Error).message); }
    if (!plan) return NextResponse.json({ card: true });
  }
  if (!card.billingKey) return fail('먼저 카드를 등록해 주세요.');

  const { data: s } = await supabase.rpc('my_subscription');
  const sub = s as Sub | null;
  const live = !!sub && (sub.status === 'active' || sub.status === 'canceled') && !!sub.periodEnd && new Date(sub.periodEnd) > new Date();
  if (live && rank(plan) <= rank(sub!.plan)) return fail('지금 요금제보다 높은 요금제만 바로 결제해요. 낮은 요금제는 다음 결제일부터 바뀌어요.');

  try {
    const r = await payPlan(admin, {
      uid: user.id, plan, kind: live ? 'upgrade' : 'start',
      billingKey: card.billingKey, customerKey: card.customerKey, email: user.email ?? undefined,
    });
    return NextResponse.json(r);
  } catch (e) { return fail((e as Error).message); }
}
