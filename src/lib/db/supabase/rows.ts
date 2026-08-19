/**
 * Postgres row shapes and their mapping into domain types.
 *
 * The project does not yet generate Supabase types, so each query result is
 * narrowed through these interfaces at exactly one place — the `asRows`
 * helper — rather than being sprinkled with casts.
 */

import type {
  ConnectorRun,
  ConnectorRunStatus,
  NormalizationRun,
  RawImport,
  Source,
  SourceType,
} from '@/types/source';
import type {
  Award,
  ContractingAuthority,
  DocumentDownloadStatus,
  ProcedureType,
  ProcurementType,
  RequirementCategory,
  Tender,
  TenderDocument,
  TenderListItem,
  TenderLot,
  TenderRequirement,
  TenderStatus,
} from '@/types/tender';

/**
 * Narrows an untyped Supabase result.
 *
 * Safe because every call site names the columns it selects and the row
 * interfaces below mirror the migrations.
 */
export function asRows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

export function asRow<T>(data: unknown): T | null {
  return (data ?? null) as T | null;
}

// ---------------------------------------------------------------------------
// sources
// ---------------------------------------------------------------------------

export interface SourceRow {
  id: string;
  key: string;
  name: string;
  source_type: SourceType;
  country_code: string | null;
  website_url: string | null;
  description: string | null;
  is_active: boolean;
  is_demo: boolean;
  poll_interval_seconds: number;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export function toSource(row: SourceRow): Source {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    sourceType: row.source_type,
    countryCode: row.country_code,
    websiteUrl: row.website_url,
    description: row.description,
    isActive: row.is_active,
    isDemo: row.is_demo,
    pollIntervalSeconds: row.poll_interval_seconds,
    config: row.config ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// connector_runs / raw_imports / normalization_runs
// ---------------------------------------------------------------------------

export interface ConnectorRunRow {
  id: string;
  source_id: string;
  status: ConnectorRunStatus;
  started_at: string;
  finished_at: string | null;
  items_found: number;
  items_imported: number;
  items_skipped: number;
  items_failed: number;
  error_message: string | null;
  created_at: string;
  sources?: { key: string } | null;
}

export function toConnectorRun(row: ConnectorRunRow): ConnectorRun {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceKey: row.sources?.key ?? '',
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    itemsFound: row.items_found,
    itemsImported: row.items_imported,
    itemsSkipped: row.items_skipped,
    itemsFailed: row.items_failed,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export interface RawImportRow {
  id: string;
  source_id: string;
  connector_run_id: string | null;
  external_id: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  fetched_at: string;
  is_demo: boolean;
  created_at: string;
}

export function toRawImport(row: RawImportRow): RawImport {
  return {
    id: row.id,
    sourceId: row.source_id,
    connectorRunId: row.connector_run_id,
    externalId: row.external_id,
    payload: row.payload,
    payloadHash: row.payload_hash,
    fetchedAt: row.fetched_at,
    isDemo: row.is_demo,
    createdAt: row.created_at,
  };
}

export interface NormalizationRunRow {
  id: string;
  raw_import_id: string;
  source_id: string;
  tender_id: string | null;
  status: 'success' | 'failed';
  mapper_version: string;
  error_message: string | null;
  created_at: string;
}

export function toNormalizationRun(row: NormalizationRunRow): NormalizationRun {
  return {
    id: row.id,
    rawImportId: row.raw_import_id,
    sourceId: row.source_id,
    tenderId: row.tender_id,
    status: row.status,
    mapperVersion: row.mapper_version,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// contracting_authorities
// ---------------------------------------------------------------------------

export interface AuthorityRow {
  id: string;
  source_id: string;
  external_id: string | null;
  name: string;
  authority_type: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  region_code: string | null;
  country_code: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export function toAuthority(row: AuthorityRow): ContractingAuthority {
  return {
    id: row.id,
    sourceId: row.source_id,
    externalId: row.external_id,
    name: row.name,
    authorityType: row.authority_type,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    regionCode: row.region_code,
    countryCode: row.country_code,
    email: row.email,
    phone: row.phone,
    website: row.website,
    isDemo: row.is_demo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// tenders
// ---------------------------------------------------------------------------

export interface TenderRow {
  id: string;
  source_id: string;
  external_id: string;
  raw_import_id: string | null;
  source_url: string | null;
  original_language: string;
  fingerprint: string;
  dedupe_group_id: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  reference_number: string | null;
  procurement_type: ProcurementType;
  procedure_type: ProcedureType | null;
  cpv_codes: string[] | null;
  sectors: string[] | null;
  nuts_codes: string[] | null;
  country_code: string | null;
  region_code: string | null;
  city: string | null;
  postal_code: string | null;
  contracting_authority_id: string | null;
  publication_date: string | null;
  submission_deadline: string | null;
  question_deadline: string | null;
  binding_period_end: string | null;
  contract_start: string | null;
  contract_end: string | null;
  duration_months: number | null;
  estimated_value_net: string | number | null;
  currency: string;
  status: TenderStatus;
  source_extras: Record<string, unknown> | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  sources?: { key: string; name: string } | null;
  contracting_authorities?: AuthorityRow | null;
}

/** Postgres `numeric` arrives as a string; convert once, here. */
function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toTenderListItem(row: TenderRow): TenderListItem {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    sourceKey: row.sources?.key ?? '',
    sourceName: row.sources?.name ?? '',
    externalId: row.external_id,
    authorityName: row.contracting_authorities?.name ?? null,
    city: row.city,
    regionCode: row.region_code,
    countryCode: row.country_code,
    cpvCodes: row.cpv_codes ?? [],
    sectors: row.sectors ?? [],
    publicationDate: row.publication_date,
    submissionDeadline: row.submission_deadline,
    durationMonths: row.duration_months,
    estimatedValueNet: toNumber(row.estimated_value_net),
    currency: row.currency,
    status: row.status,
    procurementType: row.procurement_type,
    isDemo: row.is_demo,
  };
}

export function toTender(
  row: TenderRow,
  children: {
    lots: TenderLot[];
    requirements: TenderRequirement[];
    documents: TenderDocument[];
  },
): Tender {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceKey: row.sources?.key ?? '',
    sourceName: row.sources?.name ?? '',
    externalId: row.external_id,
    rawImportId: row.raw_import_id,
    sourceUrl: row.source_url,
    originalLanguage: row.original_language,
    fingerprint: row.fingerprint,
    dedupeGroupId: row.dedupe_group_id,
    title: row.title,
    summary: row.summary,
    description: row.description,
    referenceNumber: row.reference_number,
    procurementType: row.procurement_type,
    procedureType: row.procedure_type,
    cpvCodes: row.cpv_codes ?? [],
    sectors: row.sectors ?? [],
    nutsCodes: row.nuts_codes ?? [],
    countryCode: row.country_code,
    regionCode: row.region_code,
    city: row.city,
    postalCode: row.postal_code,
    contractingAuthorityId: row.contracting_authority_id,
    contractingAuthority:
      row.contracting_authorities === null || row.contracting_authorities === undefined
        ? null
        : toAuthority(row.contracting_authorities),
    publicationDate: row.publication_date,
    submissionDeadline: row.submission_deadline,
    questionDeadline: row.question_deadline,
    bindingPeriodEnd: row.binding_period_end,
    contractStart: row.contract_start,
    contractEnd: row.contract_end,
    durationMonths: row.duration_months,
    estimatedValueNet: toNumber(row.estimated_value_net),
    currency: row.currency,
    status: row.status,
    lots: children.lots,
    requirements: children.requirements,
    documents: children.documents,
    sourceExtras: row.source_extras ?? {},
    isDemo: row.is_demo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// tender children
// ---------------------------------------------------------------------------

export interface LotRow {
  id: string;
  tender_id: string;
  lot_number: string;
  title: string;
  description: string | null;
  estimated_value_net: string | number | null;
  cpv_codes: string[] | null;
}

export function toLot(row: LotRow): TenderLot {
  return {
    id: row.id,
    tenderId: row.tender_id,
    lotNumber: row.lot_number,
    title: row.title,
    description: row.description,
    estimatedValueNet: toNumber(row.estimated_value_net),
    cpvCodes: row.cpv_codes ?? [],
  };
}

export interface RequirementRow {
  id: string;
  tender_id: string;
  category: RequirementCategory;
  label: string;
  description: string | null;
  mandatory: boolean;
}

export function toRequirement(row: RequirementRow): TenderRequirement {
  return {
    id: row.id,
    tenderId: row.tender_id,
    category: row.category,
    label: row.label,
    description: row.description,
    mandatory: row.mandatory,
  };
}

export interface DocumentRow {
  id: string;
  tender_id: string;
  title: string;
  file_type: string | null;
  file_size_bytes: number | null;
  source_url: string | null;
  storage_path: string | null;
  download_status: DocumentDownloadStatus;
  is_demo: boolean;
}

export function toDocument(row: DocumentRow): TenderDocument {
  return {
    id: row.id,
    tenderId: row.tender_id,
    title: row.title,
    fileType: row.file_type,
    fileSizeBytes: row.file_size_bytes,
    sourceUrl: row.source_url,
    storagePath: row.storage_path,
    downloadStatus: row.download_status,
    isDemo: row.is_demo,
  };
}

// ---------------------------------------------------------------------------
// awards
// ---------------------------------------------------------------------------

export interface AwardRow {
  id: string;
  tender_id: string | null;
  contracting_authority_id: string | null;
  winner_name: string;
  winner_city: string | null;
  award_value_net: string | number | null;
  currency: string;
  award_date: string | null;
  bidder_count: number | null;
  source_url: string | null;
  is_demo: boolean;
  created_at: string;
  tenders?: { title: string } | null;
}

export function toAward(row: AwardRow): Award {
  return {
    id: row.id,
    tenderId: row.tender_id ?? '',
    tenderTitle: row.tenders?.title ?? '',
    contractingAuthorityId: row.contracting_authority_id,
    winnerName: row.winner_name,
    winnerCity: row.winner_city,
    awardValueNet: toNumber(row.award_value_net),
    currency: row.currency,
    awardDate: row.award_date,
    bidderCount: row.bidder_count,
    sourceUrl: row.source_url,
    isDemo: row.is_demo,
    createdAt: row.created_at,
  };
}
