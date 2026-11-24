'use client';
import { getSupabase } from '@/lib/supabase/client';
import type { Credits, Rehearsal } from './types';

/** 기록이 늘거나 줄면 크레딧 표시(useCredits)가 다시 세도록 알려요. */
export const REHEARSALS_CHANGED = 'rc-rehearsals-changed';
const changed = () => window.dispatchEvent(new Event(REHEARSALS_CHANGED));

/** 이번 달 크레딧이 모자라서 서버가 저장을 거절했어요. */
export class NoCreditsError extends Error {
  constructor() { super('이번 달 크레딧을 다 썼어요.'); this.name = 'NoCreditsError'; }
}

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

/** 이번 달 크레딧 현황(서버 계산, 사용 내역 기준이라 기록을 지워도 그대로예요). */
export async function fetchCredits(): Promise<Credits> {
  const { data, error } = await db().rpc('credits_left');
  if (error) throw error;
  return data as Credits;
}

/** 리허설 한 번을 저장하고 크레딧을 써요. 서버가 남은 크레딧을 확인해서 모자라면 NoCreditsError. */
export async function recordRehearsal(r: Omit<Rehearsal, 'id' | 'created_at'>): Promise<Rehearsal> {
  const { data, error } = await db().rpc('record_rehearsal', {
    p_purpose_id: r.purpose_id, p_posture: r.posture, p_topic: r.topic, p_overall: r.overall,
    p_scores: r.scores, p_focus: r.focus, p_duration_sec: r.duration_sec,
  });
  if (error) {
    if (error.message.includes('NO_CREDITS')) { changed(); throw new NoCreditsError(); }
    throw error;
  }
  changed();
  return data as Rehearsal;
}

/** 기록만 지워요. 이미 쓴 크레딧은 돌아오지 않아요. */
export async function deleteRehearsal(id: string) {
  const { error } = await db().from('rehearsals').delete().eq('id', id);
  if (error) throw error;
  changed();
}

/** 한 발표(같은 제목)의 회차를 한꺼번에 지워요. 이미 쓴 크레딧은 돌아오지 않아요. */
export async function deleteRehearsals(ids: string[]) {
  if (!ids.length) return;
  const { error } = await db().from('rehearsals').delete().in('id', ids);
  if (error) throw error;
  changed();
}
