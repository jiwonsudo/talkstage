'use client';
import { getSupabase } from '@/lib/supabase/client';
import type { PackId } from '@/lib/plans';

export type Order = { orderId: string; amount: number; orderName: string; credits: number };

/** 회차 구매 주문을 만들어요. 금액·주문 이름은 서버(DB)가 정해요. */
export async function createOrder(product: PackId): Promise<Order> {
  const s = getSupabase();
  if (!s) throw new Error('Supabase 설정이 필요해요.');
  const { data, error } = await s.rpc('create_order', { p_product: product });
  if (error) throw new Error('주문을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  return data as Order;
}

/** 결제 승인 요청(서버 /api/payments/confirm). 성공하면 추가된 크레딧을 돌려줘요. */
export async function confirmPayment(p: { paymentKey: string; orderId: string; amount: number }): Promise<{ credits: number }> {
  const r = await fetch('/api/payments/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
  const body = (await r.json().catch(() => ({}))) as { credits?: number; error?: string };
  if (!r.ok || body.credits == null) throw new Error(body.error ?? '결제를 확인하지 못했어요.');
  return { credits: body.credits };
}
