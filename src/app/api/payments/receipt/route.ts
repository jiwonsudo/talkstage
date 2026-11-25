import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * 결제 영수증 주소. 로그인한 사용자의 결제(RLS 로 본인 것만 보여요)에서 paymentKey 를 찾아 토스에 결제 조회를 하고,
 * 토스가 주는 영수증(매출전표) 주소를 돌려줘요. 크레딧 구매는 결제위젯 키, 월 요금제는 API 개별 연동(빌링) 키로 조회해요.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get('id') ?? '', src = u.searchParams.get('src');
  if (!/^[A-Za-z0-9_=-]{6,64}$/.test(id) || (src !== 'order' && src !== 'sub')) return fail('요청이 올바르지 않아요.');
  const sb = await getServerSupabase();
  if (!sb) return fail('서버 설정이 없어요.', 501);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fail('로그인이 필요해요.', 401);

  const table = src === 'order' ? 'orders' : 'subscription_payments';
  const { data, error } = await sb.from(table).select('payment_key, status').eq('id', id).maybeSingle();
  const row = data as { payment_key: string | null; status: string } | null;
  if (error || !row) return fail('결제를 찾지 못했어요.', 404);
  if (row.status !== 'paid' || !row.payment_key) return fail('완료된 결제만 영수증이 있어요.', 404);

  const secret = src === 'order' ? process.env.TOSS_SECRET_KEY : process.env.TOSS_BILLING_SECRET_KEY;
  if (!secret) return fail('서버에 결제 설정이 없어요.', 501);
  const res = await fetch(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(row.payment_key)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}` },
    cache: 'no-store',
  });
  const pay = (await res.json().catch(() => ({}))) as { receipt?: { url?: string } | null; message?: string };
  const url = pay.receipt?.url;
  if (!res.ok || !url || !/^https:\/\/[^/]*tosspayments\.com\//.test(url)) return fail(pay.message ?? '영수증을 불러오지 못했어요.', 502);
  return NextResponse.json({ url });
}
