/**
 * Application error types and the shared API error shape.
 *
 * Errors carry a stable machine-readable `code` so API clients and the UI
 * can react without string matching. Nothing here ever embeds secrets or
 * personal data (CLAUDE.md § Fehlerbehandlung & Logging).
 */

export type AppErrorCode =
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'connector_failed'
  | 'normalization_failed'
  | 'configuration_missing'
  | 'internal_error';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  connector_failed: 502,
  normalization_failed: 422,
  configuration_missing: 503,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  /** Safe-to-expose context. Must not contain secrets or personal data. */
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: AppErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('validation_failed', message, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('not_found', `${resource} wurde nicht gefunden.`, id ? { id } : undefined);
    this.name = 'NotFoundError';
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Anmeldung erforderlich.') {
    super('unauthenticated', message);
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Keine Berechtigung für diese Aktion.') {
    super('forbidden', message);
    this.name = 'ForbiddenError';
  }
}

export class ConnectorError extends AppError {
  constructor(connectorKey: string, message: string, cause?: unknown) {
    super('connector_failed', message, { connectorKey });
    this.name = 'ConnectorError';
    this.cause = cause;
  }
}

export class NormalizationError extends AppError {
  constructor(rawImportId: string, message: string, cause?: unknown) {
    super('normalization_failed', message, { rawImportId });
    this.name = 'NormalizationError';
    this.cause = cause;
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super('configuration_missing', message);
    this.name = 'ConfigurationError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Extracts a log-safe message from an unknown thrown value. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unbekannter Fehler';
}
