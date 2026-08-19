/**
 * Write-store selection for the ingestion pipeline.
 *
 * Separate from lib/db/index.ts so the CLI script can import it without
 * pulling in `server-only` and `next/headers`, which only exist inside a
 * Next.js request context.
 */

import { hasSupabaseClientConfig, hasSupabaseServiceConfig } from '@/lib/env';
import { ConfigurationError } from '@/lib/errors';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { getMemoryIngestionStore } from './memory';
import { SupabaseIngestionStore } from './supabase/ingestion-store';
import type { IngestionStore } from './ports';

/**
 * Returns the store the pipeline writes to.
 *
 * With Supabase configured this uses the service role key and bypasses RLS —
 * call only from scripts and internal, already-authenticated route handlers.
 */
export function getIngestionStore(): IngestionStore {
  if (hasSupabaseServiceConfig()) {
    return new SupabaseIngestionStore(createServiceSupabaseClient());
  }

  if (hasSupabaseClientConfig()) {
    // Public config without a service role key: ingestion writes would be
    // rejected by RLS, so fail loudly rather than silently writing nothing.
    throw new ConfigurationError(
      'SUPABASE_SERVICE_ROLE_KEY fehlt. Der Import benötigt Service-Zugriff.',
    );
  }

  return getMemoryIngestionStore();
}
