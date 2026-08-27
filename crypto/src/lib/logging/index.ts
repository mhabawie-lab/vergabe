/**
 * Structured logging.
 *
 * Every entry carries the pipeline context it belongs to (source, run, asset)
 * so a failing connector can be traced end to end. Secrets are redacted before
 * anything leaves this module — API keys must never reach a log sink.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  readonly sourceId?: string;
  readonly runId?: string;
  readonly asset?: string;
  readonly stage?: string;
  readonly [key: string]: unknown;
}

const SECRET_KEY_PATTERN = /(key|token|secret|password|bearer|authorization|signature)/i;

/**
 * Replaces values whose key looks credential-bearing, and any string that
 * looks like a long opaque token, with a placeholder.
 */
export function redactSecrets(value: unknown, keyHint = ''): unknown {
  if (typeof value === 'string') {
    if (SECRET_KEY_PATTERN.test(keyHint)) return '[redacted]';
    // Long unbroken alphanumeric runs are almost always tokens, not prose.
    if (/^[A-Za-z0-9_\-.]{32,}$/.test(value)) return '[redacted]';
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactSecrets(inner, key);
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

function emit(level: LogLevel, message: string, context: LogContext): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(redactSecrets(context) as LogContext),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function createLogger(base: LogContext = {}): Logger {
  return {
    debug: (message, context) => emit('debug', message, { ...base, ...context }),
    info: (message, context) => emit('info', message, { ...base, ...context }),
    warn: (message, context) => emit('warn', message, { ...base, ...context }),
    error: (message, context) => emit('error', message, { ...base, ...context }),
    child: (context) => createLogger({ ...base, ...context }),
  };
}

export const logger = createLogger();
