/**
 * Storage ports.
 *
 * The UI depends on these interfaces, never on Supabase or on any connector.
 * Two adapters implement them: Postgres via Supabase (production) and an
 * in-process store (local demo mode, see lib/db/index.ts).
 */

import type { TenderSearchQuery } from '@/modules/tenders/query';
import type {
  ConnectorRun,
  ConnectorRunStatus,
  RawImport,
  Source,
  SourceHealth,
} from '@/types/source';
import type {
  Award,
  ContractingAuthority,
  Tender,
  TenderListItem,
} from '@/types/tender';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

// ---------------------------------------------------------------------------
// Read side
// ---------------------------------------------------------------------------

export interface DashboardMetrics {
  /** Tenders published within the last 7 days. */
  newTenders: number;
  /** Tenders above the relevance threshold of the rule-based match preview. */
  topMatches: number;
  /** Open tenders whose deadline falls within the next 30 days. */
  openDeadlines: number;
  /** Summed estimated value of all currently open tenders. */
  openVolume: number;
  /** Awards recorded within the last 30 days. */
  newAwards: number;
  /** Authorities the organisation tracks. */
  watchedAuthorities: number;
}

export interface AuthorityListItem {
  id: string;
  name: string;
  authorityType: string | null;
  city: string | null;
  regionCode: string | null;
  countryCode: string | null;
  tenderCount: number;
  openTenderCount: number;
  awardCount: number;
  isDemo: boolean;
}

/** A document row joined with the tender it belongs to. */
export interface DocumentListItem {
  id: string;
  tenderId: string;
  tenderTitle: string;
  title: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  downloadStatus: import('@/types/tender').DocumentDownloadStatus;
  isDemo: boolean;
}

export interface AuthorityDetail {
  authority: ContractingAuthority;
  tenders: TenderListItem[];
  awards: Award[];
}

/** Options for the search dropdowns, derived from the stored data. */
export interface FilterFacets {
  sources: Array<{ key: string; name: string; isDemo: boolean }>;
  authorities: Array<{ id: string; name: string }>;
  cities: string[];
}

export interface TenderRepository {
  search(query: TenderSearchQuery): Promise<PaginatedResult<TenderListItem>>;
  findById(id: string): Promise<Tender | null>;
  /** Open tenders ordered by deadline, for the dashboard and Fristen screen. */
  listUpcomingDeadlines(limit: number): Promise<TenderListItem[]>;
  listRecent(limit: number): Promise<TenderListItem[]>;
  getDashboardMetrics(organizationId: string | null): Promise<DashboardMetrics>;
  listAuthorities(
    search: string | null,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<AuthorityListItem>>;
  findAuthorityById(id: string): Promise<AuthorityDetail | null>;
  listAwards(page: number, pageSize: number): Promise<PaginatedResult<Award>>;
  listDocuments(
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<DocumentListItem>>;
  listAwardsForTender(tenderId: string): Promise<Award[]>;
  listFilterFacets(): Promise<FilterFacets>;
  listSourceHealth(): Promise<SourceHealth[]>;
  listSources(): Promise<Source[]>;
  listConnectorRuns(limit: number): Promise<ConnectorRun[]>;
  /** True when the store holds nothing but demo records. */
  isDemoOnly(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Write side (ingestion only)
// ---------------------------------------------------------------------------

export interface RawImportInput {
  sourceId: string;
  connectorRunId: string;
  externalId: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  isDemo: boolean;
}

export interface AuthorityUpsertInput {
  sourceId: string;
  externalId: string | null;
  name: string;
  authorityType: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  regionCode: string | null;
  countryCode: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  dedupeKey: string;
  isDemo: boolean;
}

export interface TenderUpsertInput {
  sourceId: string;
  rawImportId: string;
  contractingAuthorityId: string | null;
  fingerprint: string;
  isDemo: boolean;
  draft: import('@/modules/ingestion/normalizer/types').TenderDraft;
}

export interface AwardUpsertInput {
  sourceId: string;
  tenderId: string;
  contractingAuthorityId: string | null;
  externalId: string | null;
  winnerName: string;
  winnerCity: string | null;
  awardValueNet: number | null;
  currency: string;
  awardDate: string | null;
  bidderCount: number | null;
  sourceUrl: string | null;
  isDemo: boolean;
}

export interface ConnectorRunResult {
  status: ConnectorRunStatus;
  itemsFound: number;
  itemsImported: number;
  itemsSkipped: number;
  itemsFailed: number;
  errorMessage: string | null;
}

export interface NormalizationRecordInput {
  rawImportId: string;
  sourceId: string;
  tenderId: string | null;
  status: 'success' | 'failed';
  mapperVersion: string;
  errorMessage: string | null;
}

export interface IngestionStore {
  getSourceByKey(key: string): Promise<Source | null>;
  listActiveSources(): Promise<Source[]>;
  startConnectorRun(sourceId: string): Promise<ConnectorRun>;
  finishConnectorRun(runId: string, result: ConnectorRunResult): Promise<void>;
  /** True when this exact payload was already imported — the record is skipped. */
  hasRawImport(
    sourceId: string,
    externalId: string,
    payloadHash: string,
  ): Promise<boolean>;
  insertRawImport(input: RawImportInput): Promise<RawImport>;
  upsertAuthority(input: AuthorityUpsertInput): Promise<string>;
  /** Inserts or updates the tender and returns its id. */
  upsertTender(input: TenderUpsertInput): Promise<string>;
  upsertAward(input: AwardUpsertInput): Promise<string>;
  recordNormalization(input: NormalizationRecordInput): Promise<void>;
  /** Records exact fingerprint collisions across sources. */
  recordDuplicateCandidates(tenderId: string, fingerprint: string): Promise<number>;
}
