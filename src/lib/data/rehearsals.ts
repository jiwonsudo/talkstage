'use client';
import { getSupabase } from '@/lib/supabase/client';
import type { Rehearsal } from './types';

const db = () => {
  const s = getSupabase();
  if (!s) throw new Error('Supabase 설정이 필요해요.');
  return s;
};

export async function listRehearsals(): Promise<Rehearsal[]> {
  const { data, error } = await db().from('rehearsals').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return data as Rehearsal[];
}

export async function countRehearsalsSince(since: Date): Promise<number> {
  const { count, error } = await db().from('rehearsals').select('id', { count: 'exact', head: true }).gte('created_at', since.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function saveRehearsal(r: Omit<Rehearsal, 'id' | 'created_at'>): Promise<Rehearsal> {
  const { data, error } = await db().from('rehearsals').insert(r).select().single();
  if (error) throw error;
  return data as Rehearsal;
}

export async function deleteRehearsal(id: string) {
  const { error } = await db().from('rehearsals').delete().eq('id', id);
  if (error) throw error;
}
