import 'server-only';

/**
 * Runtime configuration.
 *
 * All values come from environment variables — no credential ever lives in the
 * source tree. Source activation is configuration, not a code change: flipping
 * `MARKET_SOURCES` or removing a social API key changes which connectors run
 * without touching a module.
 */

import { z } from 'zod';

const booleanFromEnv = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

const envSchema = z.object({
  /** Ordered list of market sources; the first reachable one wins. */
  MARKET_SOURCES: csv,
  /** Ordered list of social sources to poll. */
  SOCIAL_SOURCES: csv,

  /** X/Twitter API v2 bearer token — read access to recent search. */
  X_BEARER_TOKEN: z.string().optional(),
  /** Reddit script-app credentials (optional; without them the public JSON feed is used). */
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().optional(),
  /** Comma-separated RSS/Atom news feeds. */
  NEWS_FEED_URLS: csv,

  /**
   * Master switch for live order placement. Everything else defaults to paper
   * trading; live mode must be turned on deliberately and never by accident.
   */
  LIVE_TRADING_ENABLED: booleanFromEnv,
  EXCHANGE_API_KEY: z.string().optional(),
  EXCHANGE_API_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Configuration problems must be loud — a half-configured app that silently
  // falls back is worse than one that refuses to start.
  throw new Error(`Ungültige Umgebungskonfiguration: ${parsed.error.message}`);
}

export const env: Env = parsed.data;

/** Market sources in priority order; demo is the last resort. */
export function marketSourceOrder(): readonly string[] {
  return env.MARKET_SOURCES.length > 0 ? env.MARKET_SOURCES : ['binance', 'coingecko', 'demo'];
}

/** Social sources to poll; empty means "everything that is configured". */
export function socialSourceOrder(): readonly string[] {
  return env.SOCIAL_SOURCES.length > 0 ? env.SOCIAL_SOURCES : ['x', 'reddit', 'news', 'demo'];
}
