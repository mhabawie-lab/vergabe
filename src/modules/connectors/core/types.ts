/**
 * The connector contract.
 *
 * A connector's only job is to hand back untouched payloads from one source.
 * It knows nothing about the unified tender model — all mapping happens in
 * the normalizer (CLAUDE.md § Architektur-Pipeline).
 *
 * Adding a source means adding a module under `../sources/<key>` plus a
 * mapper. No existing connector, the data model, or the UI changes.
 */

import type { Logger } from '@/lib/logging';
import type { Source, SourceType } from '@/types/source';

/** One untouched record as the source delivered it. */
export interface RawRecord {
  /** The source's own identifier. Stored as `raw_imports.external_id`. */
  externalId: string;
  /** Verbatim payload. Persisted unchanged. */
  payload: Record<string, unknown>;
}

export interface ConnectorFetchResult {
  records: RawRecord[];
  /**
   * Opaque cursor for the next page, or null when the source is exhausted.
   * Its format is the connector's own business.
   */
  nextCursor: string | null;
}

export interface ConnectorHealth {
  reachable: boolean;
  message: string;
  checkedAt: string;
}

/** Everything a connector receives from the runner. */
export interface ConnectorContext {
  /** The registered source row, including its non-secret `config`. */
  source: Source;
  logger: Logger;
  /** Aborts long-running fetches when the run is cancelled or times out. */
  signal: AbortSignal;
}

export interface TenderConnector {
  /** Must equal `sources.key`. */
  readonly key: string;
  readonly sourceType: SourceType;
  readonly description: string;

  /**
   * Fetches one page of raw records.
   *
   * Implementations must not write to the database, must not map into the
   * internal model, and must respect `context.signal`.
   */
  fetchBatch(
    context: ConnectorContext,
    cursor: string | null,
  ): Promise<ConnectorFetchResult>;

  /** Cheap reachability probe for the monitoring view. */
  healthCheck(context: ConnectorContext): Promise<ConnectorHealth>;
}
