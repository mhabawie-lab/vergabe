/**
 * HTTP client for the TED search API (v3).
 *
 * Deliberately thin: it speaks HTTP, retries, and throttles. It does not
 * interpret a single field of the response — the notices it returns are
 * handed to `raw_imports` verbatim and interpreted only by the mapper
 * (CLAUDE.md § Architektur-Pipeline).
 */

import { ConnectorError } from '@/lib/errors';
import type { Logger } from '@/lib/logging';

const SEARCH_PATH = '/v3/notices/search';

/** Pagination style: TED's scroll cursor, stable across a whole result set. */
const PAGINATION_MODE = 'ITERATION';

export interface TedSearchRequest {
  /** TED expert query. Built by `query.ts`, never by the caller. */
  query: string;
  fields: readonly string[];
  limit: number;
  /** Scroll cursor from the previous response; omitted on the first page. */
  iterationNextToken: string | null;
}

export interface TedSearchResponse {
  /** Untouched notice objects, exactly as TED delivered them. */
  notices: Record<string, unknown>[];
  /** Size of the whole result set, not of this page. */
  totalNoticeCount: number;
  /** Cursor for the next page, or null when the result set is exhausted. */
  iterationNextToken: string | null;
}

export interface TedClientOptions {
  baseUrl: string;
  requestTimeoutMs: number;
  maxRetries: number;
  minRequestIntervalMs: number;
  logger: Logger;
}

/** Retried: TED is briefly unavailable or is asking us to slow down. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function backoffMs(attempt: number): number {
  // 1s, 2s, 4s, 8s … capped, so a long outage does not stall the whole run.
  return Math.min(1_000 * 2 ** attempt, 30_000);
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('Abgebrochen'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error('Abgebrochen'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Reads TED's own error message without leaking a whole HTML error page. */
function describeFailure(status: number, body: string): string {
  const trimmed = body.trim().slice(0, 500);
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === 'object' && 'message' in parsed) {
      const message = (parsed as { message: unknown }).message;
      if (typeof message === 'string') return `HTTP ${status}: ${message}`;
    }
  } catch {
    // Not JSON — fall through to the truncated body.
  }
  return trimmed.length > 0 ? `HTTP ${status}: ${trimmed}` : `HTTP ${status}`;
}

function readNotices(body: unknown): Record<string, unknown>[] {
  if (body === null || typeof body !== 'object') return [];
  const notices = (body as { notices?: unknown }).notices;
  if (!Array.isArray(notices)) return [];
  return notices.filter(
    (entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === 'object' && !Array.isArray(entry),
  );
}

function readToken(body: unknown): string | null {
  if (body === null || typeof body !== 'object') return null;
  const token = (body as { iterationNextToken?: unknown }).iterationNextToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

function readTotal(body: unknown): number {
  if (body === null || typeof body !== 'object') return 0;
  const total = (body as { totalNoticeCount?: unknown }).totalNoticeCount;
  return typeof total === 'number' && Number.isFinite(total) ? total : 0;
}

export class TedSearchClient {
  private nextRequestAllowedAt = 0;

  constructor(private readonly options: TedClientOptions) {}

  /**
   * Runs one search request.
   *
   * @throws ConnectorError on a non-retryable response or once the retries
   *         are used up. The runner turns that into a failed connector run.
   */
  async search(
    request: TedSearchRequest,
    signal: AbortSignal,
  ): Promise<TedSearchResponse> {
    const url = new URL(SEARCH_PATH, this.options.baseUrl).toString();

    const body = JSON.stringify({
      query: request.query,
      fields: [...request.fields],
      limit: request.limit,
      paginationMode: PAGINATION_MODE,
      ...(request.iterationNextToken === null
        ? { page: 1 }
        : { iterationNextToken: request.iterationNextToken }),
    });

    let lastFailure = 'Unbekannter Fehler';

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      signal.throwIfAborted();

      if (attempt > 0) {
        const wait = backoffMs(attempt - 1);
        this.options.logger.warn('TED-Anfrage wird wiederholt', {
          scope: 'connector:ted-eforms',
          attempt,
          waitMs: wait,
          reason: lastFailure,
        });
        await abortableDelay(wait, signal);
      }

      await this.throttle(signal);

      try {
        const response = await this.fetchOnce(url, body, signal);

        if (response.ok) {
          const parsed: unknown = await response.json();
          return {
            notices: readNotices(parsed),
            totalNoticeCount: readTotal(parsed),
            iterationNextToken: readToken(parsed),
          };
        }

        const text = await response.text();
        lastFailure = describeFailure(response.status, text);

        // A rejected query or an unknown field will be rejected again on
        // every retry — fail immediately so the operator sees the reason.
        if (!isRetryableStatus(response.status)) {
          throw new ConnectorError('ted-eforms', `TED-Anfrage abgelehnt: ${lastFailure}`);
        }
      } catch (error) {
        if (error instanceof ConnectorError) throw error;
        if (signal.aborted) throw error;
        lastFailure = error instanceof Error ? error.message : 'Netzwerkfehler';
      }
    }

    throw new ConnectorError(
      'ted-eforms',
      `TED ist nach ${this.options.maxRetries + 1} Versuchen nicht erreichbar: ${lastFailure}`,
    );
  }

  private async fetchOnce(
    url: string,
    body: string,
    signal: AbortSignal,
  ): Promise<Response> {
    // Two independent reasons to give up: the run was cancelled, or this
    // single request took too long. `AbortSignal.any` merges both.
    const timeoutSignal = AbortSignal.timeout(this.options.requestTimeoutMs);

    return fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body,
      signal: AbortSignal.any([signal, timeoutSignal]),
    });
  }

  /** Per-source rate limit: keeps a minimum gap between two requests. */
  private async throttle(signal: AbortSignal): Promise<void> {
    const wait = this.nextRequestAllowedAt - Date.now();
    if (wait > 0) await abortableDelay(wait, signal);
    this.nextRequestAllowedAt = Date.now() + this.options.minRequestIntervalMs;
  }
}
