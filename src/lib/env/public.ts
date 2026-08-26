/**
 * Environment values that are safe in a browser bundle.
 *
 * Deliberately separate from `./server`. The two used to live in one module
 * that a client component imported; the secret never actually reached the
 * bundle — Next.js only inlines `NEXT_PUBLIC_*` — but the arrangement invited
 * the mistake. Splitting them makes "could this leak?" answerable by looking
 * at the import instead of at the bundler's behaviour.
 *
 * Nothing here may be secret. Everything in this file ships to the browser.
 */

import { z } from 'zod';

/**
 * Which store the application reads and writes.
 *
 * `memory` is a development convenience: the full pipeline runs, it just
 * persists into the process instead of Postgres. It is never a fallback —
 * see `resolveBackend` in `./server` for why a silent one is unacceptable.
 */
export const DATA_BACKENDS = ['supabase', 'memory'] as const;
export type DataBackend = (typeof DATA_BACKENDS)[number];

const optionalNonEmpty = z.string().trim().min(1).optional().catch(undefined);

const publicSchema = z.object({
  supabaseUrl: z.url().optional().catch(undefined),
  /**
   * The key intended for browsers. Supabase now calls it the *publishable*
   * key; older projects issue an *anon* key. Both are RLS-scoped and safe to
   * ship, so the legacy name is still read — with a warning, see `./server`.
   */
  supabasePublishableKey: optionalNonEmpty,
  supabaseLegacyAnonKey: optionalNonEmpty,
  declaredBackend: z.enum(DATA_BACKENDS).optional().catch(undefined),
});

/**
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only for
 * statically written property accesses, so these must not be dynamic.
 */
const parsed = publicSchema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  supabaseLegacyAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  declaredBackend: process.env.NEXT_PUBLIC_DATA_BACKEND,
});

/** The browser key, preferring the current name over the legacy one. */
export const supabasePublishableKey =
  parsed.supabasePublishableKey ?? parsed.supabaseLegacyAnonKey;

export const publicEnv = {
  supabaseUrl: parsed.supabaseUrl,
  supabasePublishableKey,
  /** True when the legacy variable is what is actually in use. */
  usesLegacyPublishableName:
    parsed.supabasePublishableKey === undefined &&
    parsed.supabaseLegacyAnonKey !== undefined,
  declaredBackend: parsed.declaredBackend,
  isProduction: process.env.NODE_ENV === 'production',
} as const;

/** True when a browser client can be built at all. */
export function hasSupabaseClientConfig(): boolean {
  return publicEnv.supabaseUrl !== undefined && supabasePublishableKey !== undefined;
}
