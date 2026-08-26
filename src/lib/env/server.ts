/**
 * Server-side environment: secrets, the backend decision, storage settings.
 *
 * `server-only` is not decoration. The secret key bypasses Row Level
 * Security; a build that pulled this module into a client bundle would be a
 * security incident, and the import guard turns that into a build error
 * instead of a discovery.
 */

import 'server-only';

import { z } from 'zod';
import {
  hasSupabaseClientConfig,
  publicEnv,
  supabasePublishableKey,
  type DataBackend,
} from './public';

const optionalNonEmpty = z.string().trim().min(1).optional().catch(undefined);

/** Five minutes. Long enough to click a link, short enough not to be shared. */
const DEFAULT_SIGNED_URL_TTL_SECONDS = 300;
const MAX_SIGNED_URL_TTL_SECONDS = 3600;

const serverSchema = z.object({
  /** Current name for the privileged key. */
  supabaseSecretKey: optionalNonEmpty,
  /** Legacy name for the same thing. */
  supabaseServiceRoleKey: optionalNonEmpty,
  supabaseProjectRef: optionalNonEmpty,
  databaseUrl: optionalNonEmpty,
  declaredBackend: z.enum(['supabase', 'memory']).optional().catch(undefined),
  allowMemoryInProduction: z
    .enum(['true', 'false'])
    .optional()
    .catch(undefined)
    .transform((value) => value === 'true'),
  signedUrlTtlSeconds: z.coerce
    .number()
    .int()
    .min(30)
    .max(MAX_SIGNED_URL_TTL_SECONDS)
    .catch(DEFAULT_SIGNED_URL_TTL_SECONDS),
  ingestionTriggerSecret: optionalNonEmpty,
  anthropicApiKey: optionalNonEmpty,
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).catch('info'),
});

const parsed = serverSchema.parse({
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseProjectRef: process.env.SUPABASE_PROJECT_REF,
  databaseUrl: process.env.DATABASE_URL,
  declaredBackend: process.env.DATA_BACKEND,
  allowMemoryInProduction: process.env.ALLOW_MEMORY_BACKEND_IN_PRODUCTION,
  signedUrlTtlSeconds: process.env.STORAGE_SIGNED_URL_TTL_SECONDS,
  ingestionTriggerSecret: process.env.INGESTION_TRIGGER_SECRET,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  logLevel: process.env.LOG_LEVEL,
});

/** The privileged key, preferring the current name over the legacy one. */
const supabaseSecretKey = parsed.supabaseSecretKey ?? parsed.supabaseServiceRoleKey;

export class EnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentError';
  }
}

export interface BackendDecision {
  backend: DataBackend;
  /** Why this backend was chosen — shown in the infrastructure page. */
  reason: string;
  /** True when the choice came from `DATA_BACKEND` rather than inference. */
  explicit: boolean;
}

/**
 * Decides which store the application uses.
 *
 * The rule that matters: **there is no silent fallback from Supabase to
 * memory.** A production deployment whose database is unreachable must fail
 * loudly. Falling back would present an empty application as a working one
 * and, worse, accept customer data into a store that evaporates on restart.
 *
 * @throws EnvironmentError when the configuration cannot produce a safe choice.
 */
export function resolveBackend(): BackendDecision {
  const declared = parsed.declaredBackend ?? publicEnv.declaredBackend;
  const configured = hasSupabaseClientConfig();

  if (declared === 'supabase') {
    if (!configured) {
      throw new EnvironmentError(
        'DATA_BACKEND=supabase, aber NEXT_PUBLIC_SUPABASE_URL oder ' +
          'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlt. Es wird nicht ' +
          'stillschweigend auf den flüchtigen Speicher zurückgefallen.',
      );
    }
    return { backend: 'supabase', reason: 'DATA_BACKEND=supabase', explicit: true };
  }

  if (declared === 'memory') {
    if (publicEnv.isProduction && !parsed.allowMemoryInProduction) {
      throw new EnvironmentError(
        'DATA_BACKEND=memory ist in der Produktion nicht zulässig: Der ' +
          'Speicher ist flüchtig und würde echte Daten verlieren. Setzen Sie ' +
          'ALLOW_MEMORY_BACKEND_IN_PRODUCTION=true nur für eine bewusste, ' +
          'dokumentierte Ausnahme.',
      );
    }
    return {
      backend: 'memory',
      reason: publicEnv.isProduction
        ? 'DATA_BACKEND=memory, in der Produktion ausdrücklich erlaubt'
        : 'DATA_BACKEND=memory',
      explicit: true,
    };
  }

  // Nothing declared: infer, but never infer something unsafe.
  if (configured) {
    return {
      backend: 'supabase',
      reason: 'Supabase ist konfiguriert; DATA_BACKEND ist nicht gesetzt',
      explicit: false,
    };
  }

  if (publicEnv.isProduction) {
    throw new EnvironmentError(
      'Keine Supabase-Konfiguration in der Produktion. Erforderlich sind ' +
        'NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
        'Der Start wird abgebrochen, statt auf einen flüchtigen Speicher ' +
        'auszuweichen.',
    );
  }

  return {
    backend: 'memory',
    reason: 'Keine Supabase-Konfiguration; Entwicklungsmodus',
    explicit: false,
  };
}

export const serverEnv = {
  supabaseUrl: publicEnv.supabaseUrl,
  supabasePublishableKey,
  supabaseSecretKey,
  supabaseProjectRef: parsed.supabaseProjectRef,
  databaseUrl: parsed.databaseUrl,
  signedUrlTtlSeconds: parsed.signedUrlTtlSeconds,
  ingestionTriggerSecret: parsed.ingestionTriggerSecret,
  anthropicApiKey: parsed.anthropicApiKey,
  logLevel: parsed.logLevel,
  isProduction: publicEnv.isProduction,
  /** True when the deprecated variable names are what is in use. */
  usesLegacyPublishableName: publicEnv.usesLegacyPublishableName,
  usesLegacySecretName:
    parsed.supabaseSecretKey === undefined && parsed.supabaseServiceRoleKey !== undefined,
} as const;

/**
 * Deprecation notices for the legacy variable names.
 *
 * Returned rather than logged here, so the caller decides when to emit them —
 * and so no value is ever put near a log line by accident.
 */
export function legacyEnvironmentWarnings(): string[] {
  const warnings: string[] = [];

  if (serverEnv.usesLegacyPublishableName) {
    warnings.push(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY ist veraltet. Bitte auf ' +
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY umstellen.',
    );
  }
  if (serverEnv.usesLegacySecretName) {
    warnings.push(
      'SUPABASE_SERVICE_ROLE_KEY ist veraltet. Bitte auf SUPABASE_SECRET_KEY ' +
        'umstellen. Der Schlüssel gehört ausschließlich auf den Server.',
    );
  }

  return warnings;
}

/**
 * True when privileged, RLS-bypassing access is configured.
 *
 * Used only by the ingestion writer. Never for a normal user request: a query
 * made with this key ignores every policy, so it must never stand in for a
 * user's own permissions.
 */
export function hasSupabaseServiceConfig(): boolean {
  return publicEnv.supabaseUrl !== undefined && supabaseSecretKey !== undefined;
}

export { hasSupabaseClientConfig };
