/**
 * Outbound HTTP for connectors.
 *
 * Every remote call goes through here so that timeout, retry with exponential
 * backoff and error classification are uniform across sources. A source that
 * hangs or fails must never take the rest of the pipeline down with it.
 */

import { SourceUnavailableError } from '@/lib/errors';

export interface FetchJsonOptions {
  readonly headers?: Readonly<Record<string, string>>;
  /** Milliseconds before the attempt is aborted. */
  readonly timeoutMs?: number;
  /** Number of retries after the first attempt. */
  readonly retries?: number;
  /** Base delay for exponential backoff, in milliseconds. */
  readonly backoffMs?: number;
  /** Identifies the source in thrown errors. */
  readonly sourceId?: string;
  readonly signal?: AbortSignal;
}

const DEFAULTS = {
  timeoutMs: 10_000,
  retries: 2,
  backoffMs: 500,
} as const;

/** HTTP statuses where retrying can plausibly succeed. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const retries = options.retries ?? DEFAULTS.retries;
  const backoffMs = options.backoffMs ?? DEFAULTS.backoffMs;
  const sourceId = options.sourceId ?? 'unknown';

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abortOuter = () => controller.abort();
    options.signal?.addEventListener('abort', abortOuter);

    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', ...options.headers },
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        const error = new SourceUnavailableError(
          `HTTP ${response.status} von ${new URL(url).host}`,
          { sourceId, status: response.status, host: new URL(url).host },
        );
        if (!retryable || attempt === retries) throw error;
        lastError = error;
      } else {
        return (await response.json()) as T;
      }
    } catch (error) {
      // A non-retryable HTTP error was rethrown above; surface it unchanged.
      if (error instanceof SourceUnavailableError && attempt === retries) throw error;
      lastError = error;
      if (attempt === retries) break;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abortOuter);
    }

    await delay(backoffMs * 2 ** attempt);
  }

  throw new SourceUnavailableError(
    `Quelle nicht erreichbar nach ${retries + 1} Versuchen`,
    { sourceId, host: safeHost(url) },
    { cause: lastError },
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-url';
  }
}

/**
 * Same transport guarantees as `fetchJson`, but returns the body as text.
 * Used by feed connectors, which receive XML rather than JSON.
 */
export async function fetchText(url: string, options: FetchJsonOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const sourceId = options.sourceId ?? 'unknown';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/rss+xml, application/xml, text/xml', ...options.headers },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new SourceUnavailableError(`HTTP ${response.status} von ${safeHost(url)}`, {
        sourceId,
        status: response.status,
        host: safeHost(url),
      });
    }
    return await response.text();
  } catch (error) {
    if (error instanceof SourceUnavailableError) throw error;
    throw new SourceUnavailableError(
      'Feed nicht erreichbar',
      { sourceId, host: safeHost(url) },
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
  }
}
