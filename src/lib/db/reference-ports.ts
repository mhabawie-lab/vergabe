/**
 * Storage port for customer and reference data.
 *
 * Kept apart from the tender ports because the data has a different
 * confidentiality class: tenders are shared reference data, these rows are
 * tenant-private commercial records. Every method therefore takes the
 * organisation explicitly — there is no call that could read across tenants.
 */

import type { PaginatedResult } from './ports';
import type { ClientQuery, ReferenceQuery } from '@/modules/references/query';
import type { DuplicateCandidateSource } from '@/modules/references/dedupe';
import type { ConfirmationAction } from '@/modules/references/confirmation';
import type {
  BusinessClient,
  BusinessClientListItem,
  ReferenceImport,
  ReferenceImportRow,
  ReferenceProject,
  ReferenceProjectListItem,
  ReferenceProjectService,
  ReferenceServiceCategory,
  ServiceConfirmationStatus,
} from '@/types/reference';

/** Headline figures for the dashboard tiles. */
export interface ReferenceMetrics {
  activeClients: number;
  referenceProjects: number;
  /** Distinct cities across all reference projects. */
  coveredLocations: number;
  /** Service categories with at least one user-confirmed entry. */
  confirmedServiceCategories: number;
}

export interface ClientDetail {
  client: BusinessClient;
  projects: ReferenceProjectListItem[];
  /** Distinct cities of the client's projects. */
  locations: string[];
  confirmedServiceCategories: ReferenceServiceCategory[];
  proposedServiceCategories: ReferenceServiceCategory[];
  /** Other clients of the same organisation with a similar name. */
  duplicateCandidates: Array<{ id: string; name: string }>;
}

/** Facet values for the filter dropdowns, derived from stored data. */
export interface ReferenceFacets {
  clients: Array<{ id: string; name: string }>;
  cities: string[];
  regions: string[];
  objectTypes: string[];
}

export interface CreateClientInput {
  organizationId: string;
  name: string;
  country: string | null;
  website: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface CreateProjectInput {
  organizationId: string;
  businessClientId: string | null;
  externalObjectNumber: string | null;
  projectName: string;
  objectType: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  address: string | null;
  startDate: string | null;
  endDate: string | null;
  shiftSummaryRaw: string | null;
  shiftValues: number[];
  invoiceStatus: ReferenceProject['invoiceStatus'];
  projectStatus: ReferenceProject['projectStatus'];
  description: string | null;
  sourceImportId: string | null;
  services: Array<{
    serviceCategory: ReferenceServiceCategory;
    serviceLabel: string | null;
    classificationSource: ReferenceProject['services'][number]['classificationSource'];
    classificationConfidence: number | null;
    confirmedByUser: boolean;
    notes: string | null;
  }>;
}

export interface ServiceDecisionInput {
  organizationId: string;
  serviceId: string;
  action: ConfirmationAction;
  /** Required for `change_and_confirm`. */
  targetCategory: ReferenceServiceCategory | null;
  userId: string | null;
  /** Optional internal note recorded with the decision. */
  note?: string | null;
}

export interface ServiceDecisionResult {
  referenceProjectId: string;
  before: {
    serviceCategory: ReferenceServiceCategory;
    confirmationStatus: ServiceConfirmationStatus;
  };
  after: ReferenceProjectService;
}

export interface AuditEntryInput {
  organizationId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  /** Classification metadata only. Never customer data. */
  metadata: Record<string, unknown>;
}

export interface AuditEntry {
  id: string;
  organizationId: string | null;
  userId: string | null;
  userName: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateImportInput {
  organizationId: string;
  fileName: string;
  fileType: 'csv' | 'xlsx' | 'manual';
  status: ReferenceImport['status'];
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  importedRows: number;
  createdBy: string | null;
}

export interface CreateImportRowInput {
  referenceImportId: string;
  rowNumber: number;
  rawData: Record<string, string>;
  normalizedData: Record<string, unknown>;
  validationStatus: ReferenceImportRow['validationStatus'];
  validationMessages: ReferenceImportRow['validationMessages'];
  importedProjectId: string | null;
}

export interface ReferenceStore {
  // --- Clients ----------------------------------------------------------
  listClients(
    organizationId: string,
    query: ClientQuery,
  ): Promise<PaginatedResult<BusinessClientListItem>>;
  findClientById(organizationId: string, id: string): Promise<ClientDetail | null>;
  /**
   * Returns the existing client with this normalised name, or creates one.
   * Used by the import so a client mentioned on many rows is stored once.
   * `created` reports which of the two happened, so the caller can count new
   * clients without a second query.
   */
  ensureClient(
    organizationId: string,
    name: string,
    country: string | null,
  ): Promise<{ client: BusinessClient; created: boolean }>;
  createClient(input: CreateClientInput): Promise<BusinessClient>;
  /**
   * All clients of the organisation, name and comparison key only.
   * Feeds the duplicate check without loading the full records.
   */
  listClientNames(
    organizationId: string,
  ): Promise<Array<{ id: string; name: string; normalizedName: string }>>;
  /** One client by id, scoped to the organisation. Null when foreign. */
  findClientRecord(
    organizationId: string,
    id: string,
  ): Promise<BusinessClient | null>;
  updateClient(
    organizationId: string,
    id: string,
    patch: Partial<Omit<CreateClientInput, 'organizationId'>>,
  ): Promise<BusinessClient | null>;

  // --- Projects ---------------------------------------------------------
  listProjects(
    organizationId: string,
    query: ReferenceQuery,
  ): Promise<PaginatedResult<ReferenceProjectListItem>>;
  findProjectById(organizationId: string, id: string): Promise<ReferenceProject | null>;
  createProject(input: CreateProjectInput): Promise<ReferenceProject>;

  /**
   * Applies a confirmation decision to one service.
   *
   * Returns the state before and after, so the caller can write an audit entry
   * that names what actually changed. Returns null when the service does not
   * exist **or belongs to another organisation** — the two are deliberately
   * indistinguishable to the caller, so a probe cannot reveal foreign ids.
   */
  applyServiceDecision(
    input: ServiceDecisionInput,
  ): Promise<ServiceDecisionResult | null>;

  /** Reads services by id, scoped to the organisation. Used by bulk confirm. */
  listServicesByIds(
    organizationId: string,
    serviceIds: readonly string[],
  ): Promise<ReferenceProjectService[]>;

  /** Appends an audit entry. Metadata only — never customer data. */
  recordAuditEntry(input: AuditEntryInput): Promise<void>;

  /** Audit entries for one resource, newest first. */
  listAuditEntries(
    organizationId: string,
    resourceType: string,
    resourceIds: readonly string[],
    limit: number,
  ): Promise<AuditEntry[]>;

  /** Everything needed to compare an import row against the existing stock. */
  listDuplicateCandidates(organizationId: string): Promise<DuplicateCandidateSource[]>;

  // --- Imports ----------------------------------------------------------
  createImport(input: CreateImportInput): Promise<ReferenceImport>;
  addImportRows(rows: readonly CreateImportRowInput[]): Promise<void>;
  listImports(organizationId: string, limit: number): Promise<ReferenceImport[]>;
  findImportById(
    organizationId: string,
    id: string,
  ): Promise<{ importRun: ReferenceImport; rows: ReferenceImportRow[] } | null>;

  // --- Aggregates -------------------------------------------------------
  getMetrics(organizationId: string): Promise<ReferenceMetrics>;
  listFacets(organizationId: string): Promise<ReferenceFacets>;
}
