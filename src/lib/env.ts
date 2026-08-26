/**
 * Server-side environment surface.
 *
 * Kept as a stable import path for existing server code; the values now come
 * from `./env/server`, which is `server-only`. Client components must import
 * `./env/public` instead — that split is what keeps the secret key out of a
 * browser bundle by construction rather than by convention.
 */

export {
  EnvironmentError,
  hasSupabaseClientConfig,
  hasSupabaseServiceConfig,
  legacyEnvironmentWarnings,
  resolveBackend,
  serverEnv,
  type BackendDecision,
} from './env/server';

export { DATA_BACKENDS, publicEnv, type DataBackend } from './env/public';

import { resolveBackend } from './env/server';
import { serverEnv } from './env/server';

/**
 * The values the application reads.
 *
 * `env.supabaseServiceRoleKey` is retained under its old name so the
 * ingestion writer keeps working; it resolves from `SUPABASE_SECRET_KEY`
 * first and from the legacy variable only as a documented transition.
 */
export const env = {
  supabaseUrl: serverEnv.supabaseUrl,
  supabaseAnonKey: serverEnv.supabasePublishableKey,
  supabasePublishableKey: serverEnv.supabasePublishableKey,
  supabaseServiceRoleKey: serverEnv.supabaseSecretKey,
  supabaseSecretKey: serverEnv.supabaseSecretKey,
  supabaseProjectRef: serverEnv.supabaseProjectRef,
  databaseUrl: serverEnv.databaseUrl,
  signedUrlTtlSeconds: serverEnv.signedUrlTtlSeconds,
  ingestionTriggerSecret: serverEnv.ingestionTriggerSecret,
  anthropicApiKey: serverEnv.anthropicApiKey,
  logLevel: serverEnv.logLevel,
  isProduction: serverEnv.isProduction,
} as const;

/**
 * Whether the app runs against the in-process store.
 *
 * Derived from the resolved backend, not from "is Supabase configured?" —
 * the two are no longer the same question now that `DATA_BACKEND` exists.
 */
export function isDemoMode(): boolean {
  return resolveBackend().backend === 'memory';
}
