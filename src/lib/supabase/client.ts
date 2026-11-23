'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseReady } from './config';

let client: SupabaseClient | null = null;

/** 브라우저용 Supabase 클라이언트. 환경변수가 없으면 null 이에요. */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseReady) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
