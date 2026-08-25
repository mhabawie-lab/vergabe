/**
 * Error classes for the ingestion and analysis pipeline.
 *
 * Errors carry structured context so a failing connector can be identified
 * without parsing message strings. Nothing here ever carries credentials —
 * see `redactSecrets` in the logging module for the outbound guard.
 */

export type ErrorContext = Readonly<Record<string, string | number | boolean | null>>;

export class AppError extends Error {
  readonly code: string;
  readonly context: ErrorContext;

  constructor(code: string, message: string, context: ErrorContext = {}, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
    this.context = context;
  }
}

/** A remote source could not be reached, timed out, or answered with an error status. */
export class SourceUnavailableError extends AppError {
  constructor(message: string, context: ErrorContext = {}, options?: ErrorOptions) {
    super('SOURCE_UNAVAILABLE', message, context, options);
  }
}

/** A source answered, but the payload did not match the expected shape. */
export class SourcePayloadError extends AppError {
  constructor(message: string, context: ErrorContext = {}, options?: ErrorOptions) {
    super('SOURCE_PAYLOAD_INVALID', message, context, options);
  }
}

/** A source is configured but its credentials are missing or incomplete. */
export class MissingCredentialsError extends AppError {
  constructor(message: string, context: ErrorContext = {}) {
    super('MISSING_CREDENTIALS', message, context);
  }
}

/** The caller asked for something the domain forbids (e.g. selling more than held). */
export class DomainRuleError extends AppError {
  constructor(message: string, context: ErrorContext = {}) {
    super('DOMAIN_RULE_VIOLATED', message, context);
  }
}

/** A live-trading action was attempted while the safety gate is closed. */
export class TradingLockedError extends AppError {
  constructor(message: string, context: ErrorContext = {}) {
    super('TRADING_LOCKED', message, context);
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
