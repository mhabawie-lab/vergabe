/**
 * Uniform API response envelope.
 *
 * Every route handler answers in this shape so clients can branch on `code`
 * rather than parse messages. Unexpected errors are logged with context and
 * answered generically — internals never leak to the caller
 * (CLAUDE.md § Fehlerbehandlung & Logging).
 */

import { NextResponse } from 'next/server';
import { isAppError, toErrorMessage, type AppErrorCode } from '@/lib/errors';
import { logger } from '@/lib/logging';

export interface ApiErrorBody {
  error: {
    code: AppErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiError(
  code: AppErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: details === undefined ? { code, message } : { code, message, details } },
    { status },
  );
}

/** Maps a thrown value onto the error envelope. */
export function handleApiError(error: unknown, scope: string): NextResponse {
  if (isAppError(error)) {
    if (error.status >= 500) {
      logger.error('API-Fehler', { scope, code: error.code, error: error.message });
    } else {
      logger.warn('API-Anfrage abgewiesen', { scope, code: error.code });
    }
    return apiError(error.code, error.message, error.status, error.details);
  }

  logger.error('Unerwarteter API-Fehler', { scope, error: toErrorMessage(error) });
  return apiError(
    'internal_error',
    'Ein interner Fehler ist aufgetreten.',
    500,
  );
}
