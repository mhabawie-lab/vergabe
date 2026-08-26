/**
 * Supabase clients for server-side code.
 *
 * Two clients with very different reach:
 *  - `createServerSupabaseClient` acts as the signed-in user. RLS applies.
 *  - `createServiceSupabaseClient` (re-exported from ./service) uses the
 *    service role key and BYPASSES RLS. Ingestion only.
 */

import 'server-only';

import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ConfigurationError } from '@/lib/errors';
import { env } from '@/lib/env';

function requireClientConfig(): { url: string; publishableKey: string } {
  if (env.supabaseUrl === undefined || env.supabasePublishableKey === undefined) {
    throw new ConfigurationError(
      'Supabase ist nicht konfiguriert. NEXT_PUBLIC_SUPABASE_URL und ' +
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY setzen.',
    );
  }
  return { url: env.supabaseUrl, publishableKey: env.supabasePublishableKey };
}

/** User-scoped client. Every query runs under the caller's RLS policies. */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const { url, publishableKey } = requireClientConfig();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. src/proxy.ts refreshes
          // the session instead, so this is safe to ignore here.
        }
      },
    },
  });
}

export { createServiceSupabaseClient } from './service';
