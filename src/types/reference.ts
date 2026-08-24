/**
 * Business clients and reference projects.
 *
 * Strictly separate from the tender domain: a `ContractingAuthority` is a
 * public body that published a tender, a `BusinessClient` is a customer the
 * organisation already works for. The two are never merged
 * (see supabase/migrations/0007_business_clients.sql).
 *
 * Every record here is tenant-private and carries an `organizationId`.
 */

export const REFERENCE_PROJECT_STATUSES = [
  'planned',
  'active',
  'completed',
  'cancelled',
  'unknown',
] as const;

export type ReferenceProjectStatus = (typeof REFERENCE_PROJECT_STATUSES)[number];

export const REFERENCE_PROJECT_STATUS_LABELS: Record<ReferenceProjectStatus, string> = {
  planned: 'Geplant',
  active: 'Laufend',
  completed: 'Abgeschlossen',
  cancelled: 'Abgebrochen',
  unknown: 'Unbekannt',
};

export const REFERENCE_INVOICE_STATUSES = [
  'invoiced',
  'not_invoiced',
  'partially_invoiced',
  'unknown',
] as const;

export type ReferenceInvoiceStatus = (typeof REFERENCE_INVOICE_STATUSES)[number];

export const REFERENCE_INVOICE_STATUS_LABELS: Record<ReferenceInvoiceStatus, string> = {
  invoiced: 'Berechnet',
  not_invoiced: 'Nicht berechnet',
  partially_invoiced: 'Teilweise berechnet',
  unknown: 'Unbekannt',
};

/**
 * Service categories a reference project can cover.
 *
 * `unknown` is the default and the honest answer whenever the source does not
 * state the service. It is never replaced by a guess.
 */
export const REFERENCE_SERVICE_CATEGORIES = [
  'security',
  'paramedic',
  'cleaning',
  'warehouse',
  'construction_support',
  'facility_management',
  'other',
  'unknown',
] as const;

export type ReferenceServiceCategory = (typeof REFERENCE_SERVICE_CATEGORIES)[number];

export const REFERENCE_SERVICE_CATEGORY_LABELS: Record<
  ReferenceServiceCategory,
  string
> = {
  security: 'Sicherheitsdienst',
  paramedic: 'Sanitätsdienst / Paramedic',
  cleaning: 'Reinigung',
  warehouse: 'Lagerdienst',
  construction_support: 'Bauunterstützung / Bauhelfer',
  facility_management: 'Facility Management',
  other: 'Sonstige',
  unknown: 'Unbekannt',
};

/**
 * How a service classification reached its current state.
 *
 * The boolean `confirmedByUser` cannot tell an untouched proposal from a
 * rejected one — both are false — so the status is carried alongside it.
 */
export const SERVICE_CONFIRMATION_STATUSES = [
  'proposed',
  'confirmed',
  'manual',
  'rejected',
  'unknown',
] as const;

export type ServiceConfirmationStatus =
  (typeof SERVICE_CONFIRMATION_STATUSES)[number];

export const SERVICE_CONFIRMATION_STATUS_LABELS: Record<
  ServiceConfirmationStatus,
  string
> = {
  proposed: 'Vorschlag',
  confirmed: 'Bestätigt',
  manual: 'Manuell festgelegt',
  rejected: 'Verworfen',
  unknown: 'Unbekannt',
};

export const SERVICE_CONFIRMATION_STATUS_DESCRIPTIONS: Record<
  ServiceConfirmationStatus,
  string
> = {
  proposed:
    'Automatisch erkannt und noch nicht geprüft. Zählt nicht als Nachweis.',
  confirmed: 'Der Vorschlag wurde unverändert bestätigt und gilt als Nachweis.',
  manual:
    'Die Kategorie wurde von Hand festgelegt und bestätigt. Gilt als Nachweis.',
  rejected: 'Der Vorschlag wurde als unzutreffend verworfen.',
  unknown:
    'Es wurde festgestellt, dass sich die Leistungsart nicht bestimmen lässt.',
};

export const CLASSIFICATION_SOURCES = [
  'name_rule',
  'manual',
  'import_column',
  'ai',
] as const;

export type ClassificationSource = (typeof CLASSIFICATION_SOURCES)[number];

export const CLASSIFICATION_SOURCE_LABELS: Record<ClassificationSource, string> = {
  name_rule: 'Regel auf Objektnamen',
  manual: 'Manuell erfasst',
  import_column: 'Aus Importspalte',
  ai: 'KI-Vorschlag',
};

export const CONFIDENTIALITY_LEVELS = [
  'internal',
  'confidential',
  'public_reference',
] as const;

export type ConfidentialityLevel = (typeof CONFIDENTIALITY_LEVELS)[number];

export const CONFIDENTIALITY_LEVEL_LABELS: Record<ConfidentialityLevel, string> = {
  internal: 'Intern',
  confidential: 'Vertraulich',
  public_reference: 'Als Referenz freigegeben',
};

// ---------------------------------------------------------------------------
// Business client
// ---------------------------------------------------------------------------

export interface BusinessClient {
  id: string;
  organizationId: string;
  name: string;
  /** Comparison form of `name`; the original is never overwritten. */
  normalizedName: string;
  country: string | null;
  website: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Aggregated client row for the overview table. */
export interface BusinessClientListItem {
  id: string;
  name: string;
  country: string | null;
  isActive: boolean;
  projectCount: number;
  activeProjectCount: number;
  locationCount: number;
  /** Only categories a user has confirmed. Proposals are excluded. */
  confirmedServiceCategories: ReferenceServiceCategory[];
  /** End of the most recent project period, or null when unknown. */
  lastProjectEnd: string | null;
  /** Other clients of the same organisation with a very similar name. */
  duplicateCandidateNames: string[];
}

// ---------------------------------------------------------------------------
// Reference project
// ---------------------------------------------------------------------------

/**
 * A service recorded against a reference project.
 *
 * `confirmedByUser === false` means this is a proposal, not a fact. The UI must
 * label it accordingly, and only confirmed entries may feed suggestions.
 */
export interface ReferenceProjectService {
  id: string;
  referenceProjectId: string;
  serviceCategory: ReferenceServiceCategory;
  serviceLabel: string | null;
  classificationSource: ClassificationSource;
  /** 0..1, or null when the source carries no confidence. */
  classificationConfidence: number | null;
  /** True only for `confirmed` and `manual`. The single evidence flag. */
  confirmedByUser: boolean;
  /** How the current state came about. */
  confirmationStatus: ServiceConfirmationStatus;
  /** When the decision was taken; null while still an untouched proposal. */
  confirmedAt: string | null;
  /** Who took the decision. */
  confirmedBy: string | null;
  /** Display name of `confirmedBy`, resolved for the UI. */
  confirmedByName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceProject {
  id: string;
  organizationId: string;
  businessClientId: string | null;
  /** Denormalised for list views. */
  businessClientName: string | null;

  /** The customer's own object number from their source list. */
  externalObjectNumber: string | null;
  projectName: string;
  /** Kind of site, e.g. "Datacenter". Never the delivered service. */
  objectType: string | null;

  country: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  address: string | null;

  /** ISO dates (YYYY-MM-DD). */
  startDate: string | null;
  endDate: string | null;
  projectStatus: ReferenceProjectStatus;
  invoiceStatus: ReferenceInvoiceStatus;

  /**
   * The shift column exactly as delivered, e.g. "218/146/0".
   *
   * The meaning of the individual numbers is NOT established. No code may
   * label or interpret them until the user has confirmed a meaning.
   */
  shiftSummaryRaw: string | null;
  /** The raw value split into numbers, for arithmetic only. */
  shiftValues: number[];

  description: string | null;
  confidentialityLevel: ConfidentialityLevel;
  sourceImportId: string | null;

  services: ReferenceProjectService[];
  createdAt: string;
  updatedAt: string;
}

/** Compact projection for the reference table. */
export interface ReferenceProjectListItem {
  id: string;
  externalObjectNumber: string | null;
  projectName: string;
  businessClientId: string | null;
  businessClientName: string | null;
  objectType: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  startDate: string | null;
  endDate: string | null;
  projectStatus: ReferenceProjectStatus;
  invoiceStatus: ReferenceInvoiceStatus;
  shiftSummaryRaw: string | null;
  serviceCategories: ReferenceServiceCategory[];
  /** True while at least one service is still an untouched proposal. */
  hasUnconfirmedServices: boolean;
  /** True when no service counts as evidence yet. */
  hasOnlyProposals: boolean;
  /** Categories that count as evidence. */
  confirmedServiceCategories: ReferenceServiceCategory[];
  /** Open proposals, for the bulk-confirmation selection. */
  openProposals: Array<{
    serviceId: string;
    serviceCategory: ReferenceServiceCategory;
  }>;
  confidentialityLevel: ConfidentialityLevel;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export const REFERENCE_IMPORT_STATUSES = [
  'draft',
  'validated',
  'dry_run',
  'imported',
  'failed',
  'cancelled',
] as const;

export type ReferenceImportStatus = (typeof REFERENCE_IMPORT_STATUSES)[number];

export const REFERENCE_IMPORT_STATUS_LABELS: Record<ReferenceImportStatus, string> = {
  draft: 'Entwurf',
  validated: 'Geprüft',
  dry_run: 'Testlauf',
  imported: 'Importiert',
  failed: 'Fehlgeschlagen',
  cancelled: 'Abgebrochen',
};

export const IMPORT_ROW_VALIDATION_STATUSES = [
  'valid',
  'warning',
  'error',
  'skipped',
  'imported',
] as const;

export type ImportRowValidationStatus =
  (typeof IMPORT_ROW_VALIDATION_STATUSES)[number];

export const IMPORT_ROW_VALIDATION_STATUS_LABELS: Record<
  ImportRowValidationStatus,
  string
> = {
  valid: 'Gültig',
  warning: 'Warnung',
  error: 'Fehler',
  skipped: 'Übersprungen',
  imported: 'Importiert',
};

export interface ReferenceImport {
  id: string;
  organizationId: string;
  fileName: string;
  fileType: 'csv' | 'xlsx' | 'manual';
  status: ReferenceImportStatus;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  importedRows: number;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

export const VALIDATION_SEVERITIES = ['error', 'warning', 'info'] as const;
export type ValidationSeverity = (typeof VALIDATION_SEVERITIES)[number];

/**
 * A single finding on an import row.
 *
 * `suggestion` is always only a proposal — it is never applied automatically
 * (Phase-2 rule: no automatic correction without user confirmation).
 */
export interface ValidationMessage {
  severity: ValidationSeverity;
  /** Stable machine code, e.g. `missing_client`. */
  code: string;
  /** Source column the finding refers to, when applicable. */
  field: string | null;
  message: string;
  /** Proposed correction. Never applied without confirmation. */
  suggestion: string | null;
}

export interface ReferenceImportRow {
  id: string;
  referenceImportId: string;
  rowNumber: number;
  /** Verbatim source row. Never modified. */
  rawData: Record<string, string>;
  /** Normalised proposal, held separately from `rawData`. */
  normalizedData: Record<string, unknown>;
  validationStatus: ImportRowValidationStatus;
  validationMessages: ValidationMessage[];
  importedProjectId: string | null;
  createdAt: string;
}
