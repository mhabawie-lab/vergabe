/**
 * Storage port for the Subunternehmer-Radar.
 *
 * Separate from the tender and reference ports because the confidentiality
 * class is different again: these rows name third-party companies, hold
 * negotiated prices and point at uploaded documents. Every method takes the
 * organisation explicitly — there is no call that could read across tenants.
 *
 * Two operations are narrower than the rest and are gated by their own
 * permissions in the route handlers: rates (`subcontractors:financial`) and
 * documents (`subcontractors:documents`).
 */

import type { PaginatedResult } from './ports';
import type { AuditEntry, AuditEntryInput } from './reference-ports';
import type { NeedQuery, PartnerQuery, SignalQuery } from '@/modules/partners/query';
import type { MatchResult } from '@/modules/partners/matching';
import type {
  AssignmentTreeNode,
  CredentialSummary,
  MatchStatus,
  PartnerActivity,
  PartnerAvailability,
  PartnerCompany,
  PartnerCompanyListItem,
  PartnerContact,
  PartnerDocument,
  PartnerQualification,
  PartnerRate,
  PartnerService,
  PartnerServiceRegion,
  PartnerSignal,
  PartnerSignalListItem,
  SubcontractorAssignment,
  SubcontractorMatchListItem,
  SubcontractorNeed,
  SubcontractorNeedListItem,
} from '@/types/partner';

/** Headline figures for the dashboard tiles. */
export interface PartnerMetrics {
  qualifiedPartners: number;
  availableNow: number;
  companiesSeekingSubcontractors: number;
  dueFollowUps: number;
  expiringCredentials: number;
  openNeeds: number;
}

/** Everything the company detail page shows, in one read. */
export interface PartnerCompanyDetail {
  company: PartnerCompany;
  contacts: PartnerContact[];
  services: PartnerService[];
  regions: PartnerServiceRegion[];
  availability: PartnerAvailability[];
  qualifications: PartnerQualification[];
  documents: PartnerDocument[];
  activities: PartnerActivity[];
  signals: PartnerSignal[];
  assignments: SubcontractorAssignment[];
  credentialSummary: CredentialSummary;
  /** Other companies of the organisation with a similar name. */
  duplicateCandidates: Array<{ id: string; legalName: string }>;
}

export interface PartnerFacets {
  countries: string[];
  regions: string[];
  cities: string[];
}

export interface CreatePartnerInput {
  organizationId: string;
  createdBy: string | null;
  legalName: string;
  normalizedName: string;
  tradeName: string | null;
  relationshipDirection: PartnerCompany['relationshipDirection'];
  partnerLevel: PartnerCompany['partnerLevel'];
  status: PartnerCompany['status'];
  verificationStatus: PartnerCompany['verificationStatus'];
  country: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  address: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  registryName: string | null;
  registryNumber: string | null;
  vatId: string | null;
  lei: string | null;
  staffModel: PartnerCompany['staffModel'];
  furtherSubcontractingStatus: PartnerCompany['furtherSubcontractingStatus'];
  datacenterExperienceStatus: PartnerCompany['datacenterExperienceStatus'];
  isPreferred: boolean;
  isBlocked: boolean;
  blockedReason: string | null;
  internalRating: number | null;
  sourceType: PartnerCompany['sourceType'];
  sourceName: string | null;
  sourceUrl: string | null;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  internalNotes: string | null;
  linkedBusinessClientId: string | null;
}

export type UpdatePartnerInput = Partial<Omit<CreatePartnerInput, 'organizationId'>>;

export interface SaveContactInput {
  organizationId: string;
  partnerCompanyId: string;
  id?: string;
  firstName: string | null;
  lastName: string;
  role: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  preferredChannel: PartnerContact['preferredChannel'];
  sourceType: PartnerContact['sourceType'];
  internalNote: string | null;
  isActive: boolean;
}

export interface SaveServiceInput {
  organizationId: string;
  partnerCompanyId: string;
  serviceCategory: PartnerService['serviceCategory'];
  serviceLabel: string | null;
  confirmation: PartnerService['confirmation'];
  confirmationSource: PartnerService['confirmationSource'];
  capacityNote: string | null;
  availableStaff: number | null;
  deliveryMode: PartnerService['deliveryMode'];
  note: string | null;
}

export interface SaveRegionInput {
  organizationId: string;
  partnerCompanyId: string;
  id?: string;
  country: string | null;
  region: string | null;
  city: string | null;
  radiusKm: number | null;
  nationwide: boolean;
  willingToTravel: boolean;
  isConfirmed: boolean;
  note: string | null;
}

export interface SaveAvailabilityInput {
  organizationId: string;
  partnerCompanyId: string;
  id?: string;
  serviceCategory: PartnerAvailability['serviceCategory'];
  availableFrom: string | null;
  availableUntil: string | null;
  status: PartnerAvailability['status'];
  availableStaff: number | null;
  shiftModel: PartnerAvailability['shiftModel'];
  nightShift: boolean;
  weekend: boolean;
  aroundTheClock: boolean;
  shortNotice: boolean;
  note: string | null;
  /** Set when the user states they just confirmed the figure. */
  confirmNow: boolean;
}

export interface SaveQualificationInput {
  organizationId: string;
  partnerCompanyId: string;
  id?: string;
  credentialType: PartnerQualification['credentialType'];
  title: string | null;
  issuer: string | null;
  documentNumber: string | null;
  validFrom: string | null;
  validUntil: string | null;
  reviewStatus: PartnerQualification['reviewStatus'];
  reviewedBy: string | null;
  note: string | null;
}

export interface SaveDocumentInput {
  organizationId: string;
  partnerCompanyId: string;
  partnerQualificationId: string | null;
  credentialType: PartnerDocument['credentialType'];
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  checksum: string | null;
  confidentiality: PartnerDocument['confidentiality'];
  validFrom: string | null;
  validUntil: string | null;
  note: string | null;
  uploadedBy: string | null;
}

export interface SaveRateInput {
  organizationId: string;
  partnerCompanyId: string;
  id?: string;
  serviceCategory: PartnerRate['serviceCategory'];
  region: string | null;
  rateModel: PartnerRate['rateModel'];
  unit: string | null;
  netAmount: number | null;
  currency: string;
  validFrom: string | null;
  validUntil: string | null;
  surcharges: string | null;
  negotiationStatus: PartnerRate['negotiationStatus'];
  internalNote: string | null;
  createdBy: string | null;
}

export interface SaveActivityInput {
  organizationId: string;
  partnerCompanyId: string;
  partnerContactId: string | null;
  activityType: PartnerActivity['activityType'];
  occurredAt: string;
  summary: string | null;
  outcome: string | null;
  nextAction: string | null;
  followUpAt: string | null;
  createdBy: string | null;
}

export interface SaveSignalInput {
  organizationId: string;
  id?: string;
  partnerCompanyId: string | null;
  companyNameRaw: string | null;
  signalType: PartnerSignal['signalType'];
  serviceCategory: PartnerSignal['serviceCategory'];
  projectName: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  description: string | null;
  sourceType: PartnerSignal['sourceType'];
  sourceName: string | null;
  sourceUrl: string | null;
  observedAt: string;
  validUntil: string | null;
  confidence: PartnerSignal['confidence'];
  status: PartnerSignal['status'];
  assignedTo: string | null;
  nextAction: string | null;
  followUpAt: string | null;
  internalNote: string | null;
  createdBy: string | null;
}

export interface SaveNeedInput {
  organizationId: string;
  id?: string;
  title: string;
  referenceProjectId: string | null;
  tenderId: string | null;
  projectType: string | null;
  serviceCategory: SubcontractorNeed['serviceCategory'];
  country: string | null;
  region: string | null;
  city: string | null;
  siteAddress: string | null;
  radiusKm: number | null;
  startDate: string | null;
  endDate: string | null;
  requiredStaff: number | null;
  shiftModel: SubcontractorNeed['shiftModel'];
  aroundTheClock: boolean;
  nightWork: boolean;
  weekendWork: boolean;
  requiredQualifications: string[];
  requiredCredentials: SubcontractorNeed['requiredCredentials'];
  furtherSubcontractingAllowed: SubcontractorNeed['furtherSubcontractingAllowed'];
  targetBudget: number | null;
  currency: string;
  confidentiality: SubcontractorNeed['confidentiality'];
  status: SubcontractorNeed['status'];
  internalNote: string | null;
  createdBy: string | null;
}

export interface SaveAssignmentInput {
  organizationId: string;
  id?: string;
  partnerCompanyId: string;
  referenceProjectId: string | null;
  needId: string | null;
  role: SubcontractorAssignment['role'];
  parentAssignmentId: string | null;
  contractPartnerCompanyId: string | null;
  scope: string | null;
  staffCount: number | null;
  startDate: string | null;
  endDate: string | null;
  furtherSubcontractingAllowed: SubcontractorAssignment['furtherSubcontractingAllowed'];
  status: SubcontractorAssignment['status'];
  internalRating: number | null;
  note: string | null;
  createdBy: string | null;
}

/** A credential that is about to expire, for the monitoring screen. */
export interface ExpiringCredential {
  partnerCompanyId: string;
  companyName: string;
  qualification: PartnerQualification;
}

export interface PartnerImportRun {
  id: string;
  organizationId: string;
  fileName: string;
  fileType: 'csv' | 'xlsx' | 'manual';
  status: 'dry_run' | 'imported' | 'failed';
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  importedRows: number;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CreatePartnerImportInput {
  organizationId: string;
  fileName: string;
  fileType: 'csv' | 'xlsx' | 'manual';
  status: PartnerImportRun['status'];
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  importedRows: number;
  createdBy: string | null;
}

export interface CreatePartnerImportRowInput {
  partnerImportId: string;
  organizationId: string;
  rowNumber: number;
  rawData: Record<string, string>;
  normalizedData: Record<string, unknown>;
  validationStatus: 'valid' | 'warning' | 'error';
  validationMessages: unknown[];
  importedCompanyId: string | null;
}

/** Everything the duplicate check needs, without loading full records. */
export interface PartnerDuplicateCandidate {
  id: string;
  legalName: string;
  normalizedName: string;
  country: string | null;
  registryNumber: string | null;
  vatId: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
}

export interface PartnerStore {
  // --- Companies --------------------------------------------------------
  listCompanies(
    organizationId: string,
    query: PartnerQuery,
  ): Promise<PaginatedResult<PartnerCompanyListItem>>;
  /** Full detail, or null when the id belongs to another organisation. */
  findCompanyById(
    organizationId: string,
    id: string,
  ): Promise<PartnerCompanyDetail | null>;
  findCompanyRecord(organizationId: string, id: string): Promise<PartnerCompany | null>;
  listDuplicateCandidates(organizationId: string): Promise<PartnerDuplicateCandidate[]>;
  createCompany(input: CreatePartnerInput): Promise<PartnerCompany>;
  updateCompany(
    organizationId: string,
    id: string,
    patch: UpdatePartnerInput,
  ): Promise<PartnerCompany | null>;

  // --- Sub-records ------------------------------------------------------
  saveContact(input: SaveContactInput): Promise<PartnerContact | null>;
  saveService(input: SaveServiceInput): Promise<PartnerService | null>;
  saveRegion(input: SaveRegionInput): Promise<PartnerServiceRegion | null>;
  saveAvailability(input: SaveAvailabilityInput): Promise<PartnerAvailability | null>;
  saveQualification(input: SaveQualificationInput): Promise<PartnerQualification | null>;

  // --- Documents (subcontractors:documents) -----------------------------
  saveDocument(input: SaveDocumentInput): Promise<PartnerDocument | null>;
  listDocuments(organizationId: string, partnerCompanyId: string): Promise<PartnerDocument[]>;
  findDocument(organizationId: string, id: string): Promise<PartnerDocument | null>;
  reviewDocument(
    organizationId: string,
    id: string,
    review: {
      reviewStatus: PartnerDocument['reviewStatus'];
      reviewedBy: string | null;
      note: string | null;
    },
  ): Promise<PartnerDocument | null>;

  // --- Rates (subcontractors:financial) ---------------------------------
  listRates(organizationId: string, partnerCompanyId: string): Promise<PartnerRate[]>;
  saveRate(input: SaveRateInput): Promise<PartnerRate | null>;

  // --- Activities -------------------------------------------------------
  saveActivity(input: SaveActivityInput): Promise<PartnerActivity | null>;
  listActivities(
    organizationId: string,
    options: { partnerCompanyId?: string; limit: number },
  ): Promise<Array<PartnerActivity & { companyName: string }>>;
  listDueFollowUps(
    organizationId: string,
    until: string,
  ): Promise<Array<PartnerActivity & { companyName: string }>>;

  // --- Signals ----------------------------------------------------------
  listSignals(
    organizationId: string,
    query: SignalQuery,
  ): Promise<PaginatedResult<PartnerSignalListItem>>;
  findSignalById(organizationId: string, id: string): Promise<PartnerSignal | null>;
  saveSignal(input: SaveSignalInput): Promise<PartnerSignal | null>;

  // --- Needs and matches ------------------------------------------------
  listNeeds(
    organizationId: string,
    query: NeedQuery,
  ): Promise<PaginatedResult<SubcontractorNeedListItem>>;
  findNeedById(organizationId: string, id: string): Promise<SubcontractorNeed | null>;
  saveNeed(input: SaveNeedInput): Promise<SubcontractorNeed | null>;
  /**
   * Recomputes and stores the matches for a need.
   *
   * The scoring itself lives in `modules/partners/matching` so both adapters
   * produce identical figures; the store only supplies candidates and
   * persists the result.
   */
  recomputeMatches(
    organizationId: string,
    needId: string,
  ): Promise<MatchResult[] | null>;
  listMatches(
    organizationId: string,
    needId: string,
  ): Promise<SubcontractorMatchListItem[]>;
  updateMatchStatus(
    organizationId: string,
    matchId: string,
    status: MatchStatus,
    reviewedBy: string | null,
  ): Promise<SubcontractorMatchListItem | null>;

  // --- Assignments ------------------------------------------------------
  listAssignments(
    organizationId: string,
    options: { partnerCompanyId?: string; referenceProjectId?: string },
  ): Promise<AssignmentTreeNode[]>;
  findAssignmentById(
    organizationId: string,
    id: string,
  ): Promise<SubcontractorAssignment | null>;
  saveAssignment(input: SaveAssignmentInput): Promise<SubcontractorAssignment | null>;

  // --- Credentials ------------------------------------------------------
  listExpiringCredentials(
    organizationId: string,
    withinDays: number,
  ): Promise<ExpiringCredential[]>;

  // --- Import -----------------------------------------------------------
  createImport(input: CreatePartnerImportInput): Promise<PartnerImportRun>;
  addImportRows(rows: readonly CreatePartnerImportRowInput[]): Promise<void>;
  listImports(organizationId: string, limit: number): Promise<PartnerImportRun[]>;

  // --- Audit ------------------------------------------------------------
  recordAuditEntry(input: AuditEntryInput): Promise<void>;
  listAuditEntries(
    organizationId: string,
    resourceType: string,
    resourceIds: readonly string[],
    limit: number,
  ): Promise<AuditEntry[]>;

  // --- Aggregates -------------------------------------------------------
  getMetrics(organizationId: string): Promise<PartnerMetrics>;
  listFacets(organizationId: string): Promise<PartnerFacets>;
}
