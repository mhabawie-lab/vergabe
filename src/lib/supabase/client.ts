'use client';

/**
 * Browser Supabase client.
 *
 * Uses the anon key only — all access is constrained by RLS. Never import
 * anything from lib/supabase/server.ts here.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let client: SupabaseClient | null = null;

/** Returns null when Supabase is not configured (local demo mode). */
export function getBrowserSupabaseClient(): SupabaseClient | null {
  if (env.supabaseUrl === undefined || env.supabaseAnonKey === undefined) {
    return null;
  }

  client ??= createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  return client;
}
