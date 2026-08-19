/**
 * Typed, validated access to environment variables.
 *
 * Secrets live exclusively in the environment — never in source
 * (CLAUDE.md § Sicherheit & Secrets). Reading them through this module keeps
 * the "is Supabase configured?" decision in one place, so the app boots and
 * builds cleanly before any credentials exist.
 */

import { z } from 'zod';

const optionalNonEmpty = z
  .string()
  .trim()
  .min(1)
  .optional()
  .catch(undefined);

const publicEnvSchema = z.object({
  supabaseUrl: z.url().optional().catch(undefined),
  supabaseAnonKey: optionalNonEmpty,
});

const serverEnvSchema = z.object({
  supabaseServiceRoleKey: optionalNonEmpty,
  ingestionTriggerSecret: optionalNonEmpty,
  anthropicApiKey: optionalNonEmpty,
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).catch('info'),
});

/**
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only for
 * statically written property accesses, so these must not be dynamic.
 */
const publicEnv = publicEnvSchema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

const serverEnv = serverEnvSchema.parse({
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ingestionTriggerSecret: process.env.INGESTION_TRIGGER_SECRET,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  logLevel: process.env.LOG_LEVEL,
});

export const env = {
  ...publicEnv,
  ...serverEnv,
  isProduction: process.env.NODE_ENV === 'production',
} as const;

/**
 * True when browser-side Supabase access (auth, RLS-scoped reads) is
 * configured. When false the app runs in local demo mode.
 */
export function hasSupabaseClientConfig(): boolean {
  return (
    publicEnv.supabaseUrl !== undefined && publicEnv.supabaseAnonKey !== undefined
  );
}

/**
 * True when server-side privileged access (ingestion writes) is configured.
 * Callers must be server-only — the service role key bypasses RLS.
 */
export function hasSupabaseServiceConfig(): boolean {
  return (
    publicEnv.supabaseUrl !== undefined &&
    serverEnv.supabaseServiceRoleKey !== undefined
  );
}

/**
 * Whether the app falls back to the in-process demo store.
 *
 * This is a development and preview convenience: the full ingestion
 * pipeline still runs, it just persists into memory instead of Postgres.
 * Records produced this way are always flagged `isDemo`.
 */
export function isDemoMode(): boolean {
  return !hasSupabaseClientConfig();
}
