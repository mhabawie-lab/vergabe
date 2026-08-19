/**
 * The unified internal tender format.
 *
 * Every connector's output is mapped into these types by the normalizer.
 * No source-specific field ever reaches this model — source peculiarities
 * live in `sourceExtras` (mirrors the `jsonb` column of the same name).
 *
 * See CLAUDE.md § "Rohdaten & Normalisierung".
 */

/** Lifecycle status of a tender, harmonised across all sources. */
export const TENDER_STATUSES = [
  'published',
  'amended',
  'closed',
  'awarded',
  'cancelled',
] as const;

export type TenderStatus = (typeof TENDER_STATUSES)[number];

export const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  published: 'Veröffentlicht',
  amended: 'Geändert',
  closed: 'Frist abgelaufen',
  awarded: 'Vergeben',
  cancelled: 'Aufgehoben',
};

/** Contract category (services / works / supplies). */
export const PROCUREMENT_TYPES = ['services', 'works', 'supplies'] as const;
export type ProcurementType = (typeof PROCUREMENT_TYPES)[number];

export const PROCUREMENT_TYPE_LABELS: Record<ProcurementType, string> = {
  services: 'Dienstleistung',
  works: 'Bauleistung',
  supplies: 'Lieferleistung',
};

/** Award procedure as used in German and EU procurement law. */
export const PROCEDURE_TYPES = [
  'open',
  'restricted',
  'negotiated',
  'competitive_dialogue',
  'direct_award',
  'framework',
] as const;

export type ProcedureType = (typeof PROCEDURE_TYPES)[number];

export const PROCEDURE_TYPE_LABELS: Record<ProcedureType, string> = {
  open: 'Offenes Verfahren',
  restricted: 'Nichtoffenes Verfahren',
  negotiated: 'Verhandlungsverfahren',
  competitive_dialogue: 'Wettbewerblicher Dialog',
  direct_award: 'Direktvergabe',
  framework: 'Rahmenvereinbarung',
};

/**
 * A structured requirement extracted from a tender.
 *
 * Phase 1 fills these from the normalizer where the source provides them.
 * Phase 3 adds AI-extracted requirements and the `isMissingForOrg` flag.
 */
export const REQUIREMENT_CATEGORIES = [
  'eligibility',
  'staff',
  'certificate',
  'reference',
  'other',
] as const;

export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export const REQUIREMENT_CATEGORY_LABELS: Record<RequirementCategory, string> = {
  eligibility: 'Eignung',
  staff: 'Personal',
  certificate: 'Zertifikat / Nachweis',
  reference: 'Referenz',
  other: 'Sonstiges',
};

export interface TenderRequirement {
  id: string;
  tenderId: string;
  category: RequirementCategory;
  label: string;
  description: string | null;
  mandatory: boolean;
}

/** A lot (Los) of a divided tender. */
export interface TenderLot {
  id: string;
  tenderId: string;
  lotNumber: string;
  title: string;
  description: string | null;
  estimatedValueNet: number | null;
  cpvCodes: string[];
}

/** A procurement document attached to a tender. */
export const DOCUMENT_DOWNLOAD_STATUSES = [
  'pending',
  'downloaded',
  'failed',
  'unavailable',
] as const;

export type DocumentDownloadStatus = (typeof DOCUMENT_DOWNLOAD_STATUSES)[number];

export const DOCUMENT_DOWNLOAD_STATUS_LABELS: Record<DocumentDownloadStatus, string> = {
  pending: 'Ausstehend',
  downloaded: 'Heruntergeladen',
  failed: 'Fehlgeschlagen',
  unavailable: 'Nicht verfügbar',
};

export interface TenderDocument {
  id: string;
  tenderId: string;
  title: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  sourceUrl: string | null;
  /** Populated once the download stage (phase 3) has stored the file. */
  storagePath: string | null;
  downloadStatus: DocumentDownloadStatus;
  isDemo: boolean;
}

/** A contracting authority (Auftraggeber). */
export interface ContractingAuthority {
  id: string;
  sourceId: string;
  externalId: string | null;
  name: string;
  /** Public body, municipality, state agency, private company, … */
  authorityType: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  regionCode: string | null;
  countryCode: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** An award (Zuschlag) closing out a tender. */
export interface Award {
  id: string;
  tenderId: string;
  /** Denormalised for list views that do not join the tender. */
  tenderTitle: string;
  contractingAuthorityId: string | null;
  winnerName: string;
  winnerCity: string | null;
  awardValueNet: number | null;
  currency: string;
  awardDate: string | null;
  bidderCount: number | null;
  sourceUrl: string | null;
  isDemo: boolean;
  createdAt: string;
}

/**
 * The canonical tender record the UI reads.
 *
 * `sourceId` + `externalId` is the provenance pair required by CLAUDE.md and
 * is unique per source. `fingerprint` and `dedupeGroupId` back cross-source
 * duplicate detection.
 */
export interface Tender {
  id: string;

  // --- Provenance -------------------------------------------------------
  sourceId: string;
  sourceKey: string;
  sourceName: string;
  externalId: string;
  rawImportId: string | null;
  sourceUrl: string | null;
  originalLanguage: string;

  // --- Duplicate detection ---------------------------------------------
  /** Stable hash over title + authority + deadline + value. */
  fingerprint: string;
  /** Set once duplicates across sources have been grouped. */
  dedupeGroupId: string | null;

  // --- Core content -----------------------------------------------------
  title: string;
  /** Short teaser used in list views. */
  summary: string | null;
  /** Full Leistungsbeschreibung. */
  description: string | null;
  referenceNumber: string | null;
  procurementType: ProcurementType;
  procedureType: ProcedureType | null;

  // --- Classification ---------------------------------------------------
  cpvCodes: string[];
  sectors: string[];
  nutsCodes: string[];

  // --- Location ---------------------------------------------------------
  countryCode: string | null;
  regionCode: string | null;
  city: string | null;
  postalCode: string | null;

  // --- Authority --------------------------------------------------------
  contractingAuthorityId: string | null;
  contractingAuthority: ContractingAuthority | null;

  // --- Dates ------------------------------------------------------------
  publicationDate: string | null;
  submissionDeadline: string | null;
  questionDeadline: string | null;
  bindingPeriodEnd: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  /** Contract duration (Laufzeit) in months. */
  durationMonths: number | null;

  // --- Value ------------------------------------------------------------
  estimatedValueNet: number | null;
  currency: string;

  // --- Status -----------------------------------------------------------
  status: TenderStatus;

  // --- Structure --------------------------------------------------------
  lots: TenderLot[];
  requirements: TenderRequirement[];
  documents: TenderDocument[];

  /** Source-specific fields that have no place in the unified model. */
  sourceExtras: Record<string, unknown>;

  // --- Governance -------------------------------------------------------
  /** True for demo records. Rendered as a DEMO badge everywhere. */
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Compact projection used by tables, dashboards and search results. */
export interface TenderListItem {
  id: string;
  title: string;
  summary: string | null;
  sourceKey: string;
  sourceName: string;
  externalId: string;
  authorityName: string | null;
  city: string | null;
  regionCode: string | null;
  countryCode: string | null;
  cpvCodes: string[];
  sectors: string[];
  publicationDate: string | null;
  submissionDeadline: string | null;
  estimatedValueNet: number | null;
  currency: string;
  status: TenderStatus;
  procurementType: ProcurementType;
  isDemo: boolean;
}
