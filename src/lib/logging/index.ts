/**
 * Structured logging.
 *
 * Every ingestion step logs with context (source, run id, external id) so a
 * failing connector can be traced without guesswork. Secrets and personal
 * data must never be passed in (CLAUDE.md § Fehlerbehandlung & Logging).
 */

import { env } from '@/lib/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogContext {
  /** Subsystem emitting the entry, e.g. `connector:demo`. */
  scope?: string;
  sourceKey?: string;
  connectorRunId?: string;
  rawImportId?: string;
  tenderId?: string;
  externalId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

/**
 * Keys whose values are treated as credentials and dropped before printing.
 * Deliberately narrow: `sourceKey` and similar identifiers must stay readable,
 * or the ingestion logs lose the context that makes them useful.
 */
const REDACTED_KEY_PATTERN =
  /^(key|apikey|api_key|token|secret|password|passwd|authorization|cookie|credential)s?$|(_|^)(apikey|api_key|secret|token|password|credential)s?(_|$)/i;

/** Drops values whose key suggests a credential, before anything is printed. */
function redact(context: LogContext): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    safe[key] = REDACTED_KEY_PATTERN.test(key) ? '[redacted]' : value;
  }
  return safe;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[env.logLevel];
}

function emit(level: LogLevel, message: string, context: LogContext = {}): void {
  if (!shouldLog(level)) return;

  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...redact(context),
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /**
   * Returns a logger that stamps every entry with the given context.
   * Chainable, so the pipeline can layer source → run → record context.
   */
  child(context: LogContext): Logger;
}

function createLogger(baseContext: LogContext): Logger {
  return {
    debug: (message, context) => emit('debug', message, { ...baseContext, ...context }),
    info: (message, context) => emit('info', message, { ...baseContext, ...context }),
    warn: (message, context) => emit('warn', message, { ...baseContext, ...context }),
    error: (message, context) => emit('error', message, { ...baseContext, ...context }),
    child: (context) => createLogger({ ...baseContext, ...context }),
  };
}

export const logger: Logger = createLogger({});
