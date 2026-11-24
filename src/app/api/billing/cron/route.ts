import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { billingSecret, payPlan } from '@/lib/billing/server';

type Due = { userId: string; status: 'active' | 'past_due' | 'canceled'; plan: string; customerKey: string | null; billingKey: string | null };

export const maxDuration = 300;

/**
 * 매일 한 번 도는 정기결제 예약 작업(vercel.json crons). 토스는 알아서 매달 결제하지 않아서 여기서 해요.
 * - 결제일이 지난 구독: 등록된 카드로 다음 달 결제(낮은 요금제로 바꾸기로 했으면 그 요금제로)
 * - 결제 실패 구독: 하루에 한 번씩 세 번까지 다시 시도, 그래도 안 되면 Opening(DB 가 처리)
 * - 기간이 끝난 해지 예약: Opening 으로
 * Vercel 은 환경 변수 CRON_SECRET 이 있으면 Authorization: Bearer <CRON_SECRET> 를 붙여 불러요.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = getAdminSupabase();
  if (!admin || !billingSecret()) return NextResponse.json({ error: 'not configured' }, { status: 501 });

  const { data, error } = await admin.rpc('sub_due');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const out = { renewed: 0, failed: 0, ended: 0 };
  for (const d of (data ?? []) as Due[]) {
    if (d.status === 'canceled' || !d.billingKey || !d.customerKey) {
      await admin.rpc('sub_expire', { p_uid: d.userId });
      out.ended++;
      continue;
    }
    try {
      await payPlan(admin, { uid: d.userId, plan: d.plan, kind: 'renew', billingKey: d.billingKey, customerKey: d.customerKey });
      out.renewed++;
    } catch (e) {
      console.error('renew failed', d.userId, (e as Error).message);
      out.failed++;
    }
  }
  return NextResponse.json(out);
}
