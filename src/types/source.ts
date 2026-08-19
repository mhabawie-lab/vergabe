/**
 * Source, raw import and connector-run types.
 *
 * These describe the ingestion side of the pipeline. The UI reads them only
 * in the admin/data-source area — never to render tenders.
 */

export const SOURCE_TYPES = ['api', 'scraper', 'file_feed', 'manual'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  api: 'API',
  scraper: 'Scraper',
  file_feed: 'Datei-Feed',
  manual: 'Manuell',
};

/**
 * A registered data source.
 *
 * `isActive` is data, not code: enabling or disabling a connector never
 * requires a deployment (CLAUDE.md § Connectors).
 */
export interface Source {
  id: string;
  /** Stable key matching the connector implementation, e.g. `demo`. */
  key: string;
  name: string;
  sourceType: SourceType;
  countryCode: string | null;
  /** Homepage of the portal, for operator reference. */
  websiteUrl: string | null;
  description: string | null;
  isActive: boolean;
  /** Demo sources may only ever produce records flagged `isDemo`. */
  isDemo: boolean;
  /** Minimum seconds between two connector runs. */
  pollIntervalSeconds: number;
  /** Free-form, non-secret connector configuration. */
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const CONNECTOR_RUN_STATUSES = [
  'running',
  'success',
  'partial',
  'failed',
] as const;

export type ConnectorRunStatus = (typeof CONNECTOR_RUN_STATUSES)[number];

export const CONNECTOR_RUN_STATUS_LABELS: Record<ConnectorRunStatus, string> = {
  running: 'Läuft',
  success: 'Erfolgreich',
  partial: 'Teilweise',
  failed: 'Fehlgeschlagen',
};

/** One execution of a connector, recorded for monitoring. */
export interface ConnectorRun {
  id: string;
  sourceId: string;
  sourceKey: string;
  status: ConnectorRunStatus;
  startedAt: string;
  finishedAt: string | null;
  itemsFound: number;
  itemsImported: number;
  itemsSkipped: number;
  itemsFailed: number;
  errorMessage: string | null;
  createdAt: string;
}

/**
 * An untouched payload as delivered by a source.
 *
 * Never mutated — re-running the normalizer reads from here
 * (CLAUDE.md § Rohdaten & Normalisierung).
 */
export interface RawImport {
  id: string;
  sourceId: string;
  connectorRunId: string | null;
  externalId: string;
  /** Verbatim source payload. */
  payload: Record<string, unknown>;
  /** SHA-256 over the canonical payload; unchanged payloads are skipped. */
  payloadHash: string;
  fetchedAt: string;
  isDemo: boolean;
  createdAt: string;
}

export const NORMALIZATION_RUN_STATUSES = ['success', 'failed'] as const;
export type NormalizationRunStatus = (typeof NORMALIZATION_RUN_STATUSES)[number];

/** Outcome of mapping one raw import into the unified model. */
export interface NormalizationRun {
  id: string;
  rawImportId: string;
  sourceId: string;
  tenderId: string | null;
  status: NormalizationRunStatus;
  /** Version of the mapper that produced the result, for reprocessing. */
  mapperVersion: string;
  errorMessage: string | null;
  createdAt: string;
}

/** Aggregated health view of a source, shown in the admin area. */
export interface SourceHealth {
  source: Source;
  lastRun: ConnectorRun | null;
  tenderCount: number;
  rawImportCount: number;
}
