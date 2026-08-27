/**
 * Connector configuration for the TED / EU eForms source.
 *
 * Everything here comes from `sources.config` — a non-secret jsonb column —
 * so the search window, the CPV scope and the rate limit are changed by
 * updating a row, never by a deployment (CLAUDE.md § Connectors).
 *
 * The TED search API needs no credentials, so no secret is read here. Should
 * that ever change, the key belongs in an environment variable, not in this
 * column.
 */

import { z } from 'zod';

/** Public TED search API. Overridable so a test can point somewhere else. */
export const TED_DEFAULT_BASE_URL = 'https://api.ted.europa.eu';

/**
 * CPV scope of the default configuration: the launch sectors.
 *
 * A trailing `*` is TED's own wildcard and matches the whole CPV branch, so
 * `797*` covers 79710000 (Sicherheitsdienste) down to 79715000
 * (Streifendienste) without enumerating every child code.
 */
export const TED_DEFAULT_CPV_CODES = [
  '797*', // Sicherheits-, Wach-, Überwachungs- und Streifendienste
  '75251110', // Brandverhütung
  '90910000', // Reinigungsdienste
  '90911*', // Gebäude- und Wohnungsreinigung
  '90919*', // Büro- und Anlagenreinigung
  '98341*', // Unterbringungs- und Pförtnerdienste
  '85311000', // Soziale Betreuung mit Unterbringung
] as const;

/**
 * A TED search term: a CPV code, optionally with a trailing wildcard.
 *
 * Validated rather than trusted because the value is interpolated into the
 * expert query string — the one place in this connector where a stored value
 * becomes part of a query (CLAUDE.md § Sicherheit).
 */
const cpvTerm = z
  .string()
  .trim()
  .regex(/^\d{2,8}\*?$/, 'CPV-Term muss 2–8 Ziffern haben, optional mit "*".');

/** ISO 3166-1 alpha-3, the form TED publishes. */
const alpha3 = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Ländercode muss ISO 3166-1 alpha-3 sein (z. B. DEU).');

/** TED notice type, e.g. `cn-standard`. Restricted to the documented shape. */
const noticeType = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{2,32}$/, 'Ungültiger TED-Bekanntmachungstyp.');

export const tedConfigSchema = z.object({
  baseUrl: z.url().default(TED_DEFAULT_BASE_URL),
  /** CPV scope. Empty means "no CPV restriction" and is rejected: a run over
   *  all of TED would import hundreds of thousands of irrelevant notices. */
  cpvCodes: z.array(cpvTerm).min(1).default([...TED_DEFAULT_CPV_CODES]),
  /** Place of performance. Empty means every country TED covers. */
  countries: z.array(alpha3).default(['DEU']),
  /** Optional narrowing to specific notice types. Empty means all types. */
  noticeTypes: z.array(noticeType).default([]),
  /**
   * How far back each run looks. TED republishes corrections under a new
   * publication number, so a window a few days wide is what keeps amendments
   * flowing in; unchanged notices are skipped by the payload hash anyway.
   */
  lookbackDays: z.int().min(1).max(365).default(14),
  /** Notices per HTTP request. TED caps this at 100. */
  pageSize: z.int().min(1).max(100).default(100),
  /** Upper bound per run, so a widened CPV scope cannot run away. */
  maxNoticesPerRun: z.int().min(1).max(50_000).default(5_000),
  requestTimeoutMs: z.int().min(1_000).max(120_000).default(30_000),
  /** Retries per request, on top of the first attempt. */
  maxRetries: z.int().min(0).max(6).default(3),
  /** Minimum spacing between two requests — the per-source rate limit. */
  minRequestIntervalMs: z.int().min(0).max(60_000).default(1_000),
});

export type TedConfig = z.infer<typeof tedConfigSchema>;

/**
 * Reads `sources.config`.
 *
 * A malformed value is an error, not a silently ignored field: a connector
 * quietly running a different query than the operator configured is worse
 * than one that refuses to start.
 */
export function parseTedConfig(config: Record<string, unknown>): TedConfig {
  return tedConfigSchema.parse(config);
}
