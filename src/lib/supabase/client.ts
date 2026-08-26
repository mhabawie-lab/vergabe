'use client';

/**
 * Browser Supabase client.
 *
 * Uses the publishable key only — every access is constrained by Row Level
 * Security. It imports `@/lib/env/public`, never `@/lib/env` or
 * `@/lib/env/server`: those are `server-only`, and pulling one in here would
 * be a build error rather than a quiet leak.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env/public';

let client: SupabaseClient | null = null;

/** Returns null when Supabase is not configured (local development mode). */
export function getBrowserSupabaseClient(): SupabaseClient | null {
  const { supabaseUrl, supabasePublishableKey } = publicEnv;

  if (supabaseUrl === undefined || supabasePublishableKey === undefined) {
    return null;
  }

  client ??= createBrowserClient(supabaseUrl, supabasePublishableKey);
  return client;
}
