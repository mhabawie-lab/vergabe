/**
 * Privileged Supabase client for the ingestion pipeline.
 *
 * Uses the service role key and therefore BYPASSES Row Level Security. Only
 * the ingestion pipeline, the CLI script and the internal trigger routes may
 * use it — never a browser-facing request path.
 *
 * Kept free of `next/headers` and `server-only` so the CLI script can import
 * it outside a Next.js request context.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ConfigurationError } from '@/lib/errors';
import { env } from '@/lib/env';

export function createServiceSupabaseClient(): SupabaseClient {
  if (env.supabaseUrl === undefined || env.supabaseServiceRoleKey === undefined) {
    throw new ConfigurationError(
      'Service-Zugriff ist nicht konfiguriert. NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen.',
    );
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
