/**
 * PartnerStore backed by Postgres via Supabase.
 *
 * Every query filters on `organization_id` even though RLS already does —
 * belt and braces, and it keeps the intent identical to the in-memory adapter
 * so the two cannot drift apart on tenancy.
 *
 * The company list goes through `search_partner_companies` (migration 0013).
 * Filtering here, on a page that has already been fetched, would give a wrong
 * total and half-empty pages, because most filters live in child tables.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaginatedResult } from '../ports';
import type { AuditEntry, AuditEntryInput } from '../reference-ports';
import type {
  CreatePartnerImportInput,
  CreatePartnerImportRowInput,
  CreatePartnerInput,
  ExpiringCredential,
  PartnerCompanyDetail,
  PartnerDuplicateCandidate,
  PartnerFacets,
  PartnerImportRun,
  PartnerMetrics,
  PartnerStore,
  SaveActivityInput,
  SaveAssignmentInput,
  SaveAvailabilityInput,
  SaveContactInput,
  SaveDocumentInput,
  SaveNeedInput,
  SaveQualificationInput,
  SaveRateInput,
  SaveRegionInput,
  SaveServiceInput,
  SaveSignalInput,
  UpdatePartnerInput,
} from '../partner-ports';
import { asRow, asRows } from './rows';
import { buildChainTree, validateChainLink } from '@/modules/partners/chain';
import {
  daysUntil,
  qualificationAsCredential,
  summarizeCredentials,
} from '@/modules/partners/credentials';
import { countsAsCurrent, coversDate } from '@/modules/partners/availability';
import {
  rankCandidates,
  type MatchCandidate,
  type MatchResult,
} from '@/modules/partners/matching';
import { countsAsOpenDemand, isDemandSignal, isSignalExpired } from '@/modules/partners/signals';
import type { NeedQuery, PartnerQuery, SignalQuery } from '@/modules/partners/query';
import { looksLikeSameValue, normalizeForComparison } from '@/modules/references/normalize';
import type {
  AssignmentTreeNode,
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
  SubcontractorMatch,
  SubcontractorMatchListItem,
  SubcontractorNeed,
  SubcontractorNeedListItem,
} from '@/types/partner';

/** One row of `search_partner_companies`: the id plus the count of matches. */
interface SearchMatchRow {
  id: string;
  total_count: number;
}

// ---------------------------------------------------------------------------
// Row shapes and mappers
// ---------------------------------------------------------------------------

interface CompanyRow {
  id: string;
  organization_id: string;
  legal_name: string;
  normalized_name: string;
  trade_name: string | null;
  relationship_direction: PartnerCompany['relationshipDirection'];
  partner_level: PartnerCompany['partnerLevel'];
  status: PartnerCompany['status'];
  verification_status: PartnerCompany['verificationStatus'];
  country: string | null;
  region: string | null;
  city: string | null;
  postal_code: string | null;
  address: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  registry_name: string | null;
  registry_number: string | null;
  vat_id: string | null;
  lei: string | null;
  staff_model: PartnerCompany['staffModel'];
  further_subcontracting_status: PartnerCompany['furtherSubcontractingStatus'];
  datacenter_experience_status: PartnerCompany['datacenterExperienceStatus'];
  is_preferred: boolean;
  is_blocked: boolean;
  blocked_reason: string | null;
  internal_rating: number | null;
  source_type: PartnerCompany['sourceType'];
  source_name: string | null;
  source_url: string | null;
  first_observed_at: string | null;
  last_verified_at: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  internal_notes: string | null;
  linked_business_client_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

const COMPANY_COLUMNS = '*';

function toCompany(row: CompanyRow): PartnerCompany {
  return {
    id: row.id,
    organizationId: row.organization_id,
    legalName: row.legal_name,
    normalizedName: row.normalized_name,
    tradeName: row.trade_name,
    relationshipDirection: row.relationship_direction,
    partnerLevel: row.partner_level,
    status: row.status,
    verificationStatus: row.verification_status,
    country: row.country,
    region: row.region,
    city: row.city,
    postalCode: row.postal_code,
    address: row.address,
    website: row.website,
    email: row.email,
    phone: row.phone,
    registryName: row.registry_name,
    registryNumber: row.registry_number,
    vatId: row.vat_id,
    lei: row.lei,
    staffModel: row.staff_model,
    furtherSubcontractingStatus: row.further_subcontracting_status,
    datacenterExperienceStatus: row.datacenter_experience_status,
    isPreferred: row.is_preferred,
    isBlocked: row.is_blocked,
    blockedReason: row.blocked_reason,
    internalRating: row.internal_rating,
    sourceType: row.source_type,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    firstObservedAt: row.first_observed_at,
    lastVerifiedAt: row.last_verified_at,
    lastContactAt: row.last_contact_at,
    nextFollowUpAt: row.next_follow_up_at,
    internalNotes: row.internal_notes,
    linkedBusinessClientId: row.linked_business_client_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function companyToRow(input: CreatePartnerInput): Record<string, unknown> {
  return {
    organization_id: input.organizationId,
    legal_name: input.legalName,
    normalized_name: input.normalizedName,
    trade_name: input.tradeName,
    relationship_direction: input.relationshipDirection,
    partner_level: input.partnerLevel,
    status: input.status,
    verification_status: input.verificationStatus,
    country: input.country,
    region: input.region,
    city: input.city,
    postal_code: input.postalCode,
    address: input.address,
    website: input.website,
    email: input.email,
    phone: input.phone,
    registry_name: input.registryName,
    registry_number: input.registryNumber,
    vat_id: input.vatId,
    lei: input.lei,
    staff_model: input.staffModel,
    further_subcontracting_status: input.furtherSubcontractingStatus,
    datacenter_experience_status: input.datacenterExperienceStatus,
    is_preferred: input.isPreferred,
    is_blocked: input.isBlocked,
    blocked_reason: input.blockedReason,
    internal_rating: input.internalRating,
    source_type: input.sourceType,
    source_name: input.sourceName,
    source_url: input.sourceUrl,
    last_contact_at: input.lastContactAt,
    next_follow_up_at: input.nextFollowUpAt,
    internal_notes: input.internalNotes,
    linked_business_client_id: input.linkedBusinessClientId,
    created_by: input.createdBy,
  };
}

/** camelCase patch → snake_case columns, omitting untouched fields. */
function patchToRow(patch: UpdatePartnerInput): Record<string, unknown> {
  const mapping: Record<string, string> = {
    legalName: 'legal_name',
    normalizedName: 'normalized_name',
    tradeName: 'trade_name',
    relationshipDirection: 'relationship_direction',
    partnerLevel: 'partner_level',
    status: 'status',
    verificationStatus: 'verification_status',
    country: 'country',
    region: 'region',
    city: 'city',
    postalCode: 'postal_code',
    address: 'address',
    website: 'website',
    email: 'email',
    phone: 'phone',
    registryName: 'registry_name',
    registryNumber: 'registry_number',
    vatId: 'vat_id',
    lei: 'lei',
    staffModel: 'staff_model',
    furtherSubcontractingStatus: 'further_subcontracting_status',
    datacenterExperienceStatus: 'datacenter_experience_status',
    isPreferred: 'is_preferred',
    isBlocked: 'is_blocked',
    blockedReason: 'blocked_reason',
    internalRating: 'internal_rating',
    sourceType: 'source_type',
    sourceName: 'source_name',
    sourceUrl: 'source_url',
    lastContactAt: 'last_contact_at',
    nextFollowUpAt: 'next_follow_up_at',
    internalNotes: 'internal_notes',
    linkedBusinessClientId: 'linked_business_client_id',
  };

  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(mapping)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value !== undefined) row[column] = value;
  }
  return row;
}

interface ServiceRow {
  id: string;
  partner_company_id: string;
  organization_id: string;
  service_category: PartnerService['serviceCategory'];
  service_label: string | null;
  confirmation: PartnerService['confirmation'];
  confirmation_source: PartnerService['confirmationSource'];
  capacity_note: string | null;
  available_staff: number | null;
  delivery_mode: PartnerService['deliveryMode'];
  note: string | null;
  created_at: string;
  updated_at: string;
}

function toService(row: ServiceRow): PartnerService {
  return {
    id: row.id,
    partnerCompanyId: row.partner_company_id,
    organizationId: row.organization_id,
    serviceCategory: row.service_category,
    serviceLabel: row.service_label,
    confirmation: row.confirmation,
    confirmationSource: row.confirmation_source,
    capacityNote: row.capacity_note,
    availableStaff: row.available_staff,
    deliveryMode: row.delivery_mode,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface RegionRow {
  id: string;
  partner_company_id: string;
  organization_id: string;
  country: string | null;
  region: string | null;
  city: string | null;
  radius_km: number | null;
  nationwide: boolean;
  willing_to_travel: boolean;
  is_confirmed: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function toRegion(row: RegionRow): PartnerServiceRegion {
  return {
    id: row.id,
    partnerCompanyId: row.partner_company_id,
    organizationId: row.organization_id,
    country: row.country,
    region: row.region,
    city: row.city,
    radiusKm: row.radius_km,
    nationwide: row.nationwide,
    willingToTravel: row.willing_to_travel,
    isConfirmed: row.is_confirmed,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface AvailabilityRow {
  id: string;
  partner_company_id: string;
  organization_id: string;
  service_category: PartnerAvailability['serviceCategory'];
  available_from: string | null;
  available_until: string | null;
  status: PartnerAvailability['status'];
  available_staff: number | null;
  shift_model: PartnerAvailability['shiftModel'];
  night_shift: boolean;
  weekend: boolean;
  around_the_clock: boolean;
  short_notice: boolean;
  note: string | null;
  last_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

function toAvailability(row: AvailabilityRow): PartnerAvailability {
  return {
    id: row.id,
    partnerCompanyId: row.partner_company_id,
    organizationId: row.organization_id,
    serviceCategory: row.service_category,
    availableFrom: row.available_from,
    availableUntil: row.available_until,
    status: row.status,
    availableStaff: row.available_staff,
    shiftModel: row.shift_model,
    nightShift: row.night_shift,
    weekend: row.weekend,
    aroundTheClock: row.around_the_clock,
    shortNotice: row.short_notice,
    note: row.note,
    lastConfirmedAt: row.last_confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface QualificationRow {
  id: string;
  partner_company_id: string;
  organization_id: string;
  credential_type: PartnerQualification['credentialType'];
  title: string | null;
  issuer: string | null;
  document_number: string | null;
  valid_from: string | null;
  valid_until: string | null;
  review_status: PartnerQualification['reviewStatus'];
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function toQualification(row: QualificationRow): PartnerQualification {
  return {
    id: row.id,
    partnerCompanyId: row.partner_company_id,
    organizationId: row.organization_id,
    credentialType: row.credential_type,
    title: row.title,
    issuer: row.issuer,
    documentNumber: row.document_number,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface DocumentRow {
  id: string;
  partner_company_id: string;
  organization_id: string;
  partner_qualification_id: string | null;
  credential_type: PartnerDocument['credentialType'];
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  checksum: string | null;
  confidentiality: PartnerDocument['confidentiality'];
  scan_status: PartnerDocument['scanStatus'];
  valid_from: string | null;
  valid_until: string | null;
  review_status: PartnerDocument['reviewStatus'];
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

function toDocument(row: DocumentRow): PartnerDocument {
  return {
    id: row.id,
    partnerCompanyId: row.partner_company_id,
    organizationId: row.organization_id,
    partnerQualificationId: row.partner_qualification_id,
    credentialType: row.credential_type,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    checksum: row.checksum,
    confidentiality: row.confidentiality,
    scanStatus: row.scan_status,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    note: row.note,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ContactRow {
  id: string;
  partner_company_id: string;
  organization_id: string;
  first_name: string | null;
  last_name: string;
  role: string | null;
  business_email: string | null;
  business_phone: string | null;
  preferred_channel: PartnerContact['preferredChannel'];
  source_type: PartnerContact['sourceType'];
  last_verified_at: string | null;
  internal_note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function toContact(row: ContactRow): PartnerContact {
  return {
    id: row.id,
    partnerCompanyId: row.partner_company_id,
    organizationId: row.organization_id,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    businessEmail: row.business_email,
    businessPhone: row.business_phone,
    preferredChannel: row.preferred_channel,
    sourceType: row.source_type,
    lastVerifiedAt: row.last_verified_at,
    internalNote: row.internal_note,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface RateRow {
  id: string;
  partner_company_id: string;
  organization_id: string;
  service_category: PartnerRate['serviceCategory'];
  region: string | null;
  rate_model: PartnerRate['rateModel'];
  unit: string | null;
  net_amount: string | number | null;
  currency: string;
  valid_from: string | null;
  valid_until: string | null;
  surcharges: string | null;
  negotiation_status: PartnerRate['negotiationStatus'];
  internal_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRate(row: RateRow): PartnerRate {
  return {
    id: row.id,
    partnerCompanyId: row.partner_company_id,
    organizationId: row.organization_id,
    serviceCategory: row.service_category,
    region: row.region,
    rateModel: row.rate_model,
    unit: row.unit,
    netAmount: toNumber(row.net_amount),
    currency: row.currency,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    surcharges: row.surcharges,
    negotiationStatus: row.negotiation_status,
    internalNote: row.internal_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ActivityRow {
  id: string;
  partner_company_id: string;
  organization_id: string;
  partner_contact_id: string | null;
  activity_type: PartnerActivity['activityType'];
  occurred_at: string;
  summary: string | null;
  outcome: string | null;
  next_action: string | null;
  follow_up_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  partner_companies?: { legal_name: string } | null;
}

function toActivity(row: ActivityRow): PartnerActivity {
  return {
    id: row.id,
    partnerCompanyId: row.partner_company_id,
    organizationId: row.organization_id,
    partnerContactId: row.partner_contact_id,
    activityType: row.activity_type,
    occurredAt: row.occurred_at,
    summary: row.summary,
    outcome: row.outcome,
    nextAction: row.next_action,
    followUpAt: row.follow_up_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface SignalRow {
  id: string;
  organization_id: string;
  partner_company_id: string | null;
  company_name_raw: string | null;
  signal_type: PartnerSignal['signalType'];
  service_category: PartnerSignal['serviceCategory'];
  project_name: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  description: string | null;
  source_type: PartnerSignal['sourceType'];
  source_name: string | null;
  source_url: string | null;
  observed_at: string;
  valid_until: string | null;
  confidence: PartnerSignal['confidence'];
  status: PartnerSignal['status'];
  assigned_to: string | null;
  next_action: string | null;
  follow_up_at: string | null;
  internal_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  partner_companies?: { legal_name: string } | null;
}

function toSignal(row: SignalRow): PartnerSignal {
  return {
    id: row.id,
    organizationId: row.organization_id,
    partnerCompanyId: row.partner_company_id,
    companyNameRaw: row.company_name_raw,
    signalType: row.signal_type,
    serviceCategory: row.service_category,
    projectName: row.project_name,
    country: row.country,
    region: row.region,
    city: row.city,
    description: row.description,
    sourceType: row.source_type,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    observedAt: row.observed_at,
    validUntil: row.valid_until,
    confidence: row.confidence,
    status: row.status,
    assignedTo: row.assigned_to,
    nextAction: row.next_action,
    followUpAt: row.follow_up_at,
    internalNote: row.internal_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface NeedRow {
  id: string;
  organization_id: string;
  title: string;
  reference_project_id: string | null;
  tender_id: string | null;
  project_type: string | null;
  service_category: SubcontractorNeed['serviceCategory'];
  country: string | null;
  region: string | null;
  city: string | null;
  site_address: string | null;
  radius_km: number | null;
  start_date: string | null;
  end_date: string | null;
  required_staff: number | null;
  shift_model: SubcontractorNeed['shiftModel'];
  around_the_clock: boolean;
  night_work: boolean;
  weekend_work: boolean;
  required_qualifications: string[];
  required_credentials: SubcontractorNeed['requiredCredentials'];
  further_subcontracting_allowed: SubcontractorNeed['furtherSubcontractingAllowed'];
  target_budget: string | number | null;
  currency: string;
  confidentiality: SubcontractorNeed['confidentiality'];
  status: SubcontractorNeed['status'];
  internal_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toNeed(row: NeedRow): SubcontractorNeed {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    referenceProjectId: row.reference_project_id,
    tenderId: row.tender_id,
    projectType: row.project_type,
    serviceCategory: row.service_category,
    country: row.country,
    region: row.region,
    city: row.city,
    siteAddress: row.site_address,
    radiusKm: row.radius_km,
    startDate: row.start_date,
    endDate: row.end_date,
    requiredStaff: row.required_staff,
    shiftModel: row.shift_model,
    aroundTheClock: row.around_the_clock,
    nightWork: row.night_work,
    weekendWork: row.weekend_work,
    requiredQualifications: row.required_qualifications,
    requiredCredentials: row.required_credentials,
    furtherSubcontractingAllowed: row.further_subcontracting_allowed,
    targetBudget: toNumber(row.target_budget),
    currency: row.currency,
    confidentiality: row.confidentiality,
    status: row.status,
    internalNote: row.internal_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface MatchRow {
  id: string;
  organization_id: string;
  need_id: string;
  partner_company_id: string;
  total_score: string | number;
  score_version: string;
  service_score: string | number;
  region_score: string | number;
  availability_score: string | number;
  capacity_score: string | number;
  credential_score: string | number;
  datacenter_score: string | number;
  exclusion_reason: string | null;
  missing_information: string[];
  reasoning: SubcontractorMatch['reasoning'];
  status: MatchStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  partner_companies?: { legal_name: string; status: PartnerCompany['status']; is_blocked: boolean } | null;
}

function toMatch(row: MatchRow): SubcontractorMatchListItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    needId: row.need_id,
    partnerCompanyId: row.partner_company_id,
    totalScore: toNumber(row.total_score) ?? 0,
    scoreVersion: row.score_version,
    serviceScore: toNumber(row.service_score) ?? 0,
    regionScore: toNumber(row.region_score) ?? 0,
    availabilityScore: toNumber(row.availability_score) ?? 0,
    capacityScore: toNumber(row.capacity_score) ?? 0,
    credentialScore: toNumber(row.credential_score) ?? 0,
    datacenterScore: toNumber(row.datacenter_score) ?? 0,
    exclusionReason: row.exclusion_reason,
    missingInformation: row.missing_information,
    reasoning: row.reasoning,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyName: row.partner_companies?.legal_name ?? '—',
    companyStatus: row.partner_companies?.status ?? 'prospect',
    companyIsBlocked: row.partner_companies?.is_blocked ?? false,
  };
}

interface AssignmentRow {
  id: string;
  organization_id: string;
  partner_company_id: string;
  reference_project_id: string | null;
  need_id: string | null;
  role: SubcontractorAssignment['role'];
  parent_assignment_id: string | null;
  chain_level: number;
  contract_partner_company_id: string | null;
  scope: string | null;
  staff_count: number | null;
  start_date: string | null;
  end_date: string | null;
  further_subcontracting_allowed: SubcontractorAssignment['furtherSubcontractingAllowed'];
  status: SubcontractorAssignment['status'];
  internal_rating: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  partner_companies?: { legal_name: string; is_blocked: boolean } | null;
}

function toAssignment(row: AssignmentRow): SubcontractorAssignment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    partnerCompanyId: row.partner_company_id,
    referenceProjectId: row.reference_project_id,
    needId: row.need_id,
    role: row.role,
    parentAssignmentId: row.parent_assignment_id,
    chainLevel: row.chain_level,
    contractPartnerCompanyId: row.contract_partner_company_id,
    scope: row.scope,
    staffCount: row.staff_count,
    startDate: row.start_date,
    endDate: row.end_date,
    furtherSubcontractingAllowed: row.further_subcontracting_allowed,
    status: row.status,
    internalRating: row.internal_rating,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ImportRow {
  id: string;
  organization_id: string;
  file_name: string;
  file_type: 'csv' | 'xlsx' | 'manual';
  status: PartnerImportRun['status'];
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  imported_rows: number;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

function toImportRun(row: ImportRow): PartnerImportRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    fileName: row.file_name,
    fileType: row.file_type,
    status: row.status,
    totalRows: row.total_rows,
    validRows: row.valid_rows,
    warningRows: row.warning_rows,
    errorRows: row.error_rows,
    importedRows: row.imported_rows,
    createdBy: row.created_by,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class SupabasePartnerStore implements PartnerStore {
  constructor(private readonly client: SupabaseClient) {}

  private fail(what: string, message: string): never {
    throw new Error(`${what} konnte nicht geladen werden: ${message}`);
  }

  // --- Companies ---------------------------------------------------------

  async listCompanies(
    organizationId: string,
    query: PartnerQuery,
  ): Promise<PaginatedResult<PartnerCompanyListItem>> {
    // Filtering happens in the database (migration 0013). Doing it here on an
    // already-fetched page would produce wrong totals and half-empty pages.
    const { data: matches, error: searchError } = await this.client.rpc(
      'search_partner_companies',
      {
        p_organization_id: organizationId,
        p_query: query.q ?? null,
        p_directions: query.directions?.length ? query.directions : null,
        p_statuses: query.statuses?.length ? query.statuses : null,
        p_services: query.services?.length ? query.services : null,
        p_country: query.country ?? null,
        p_region: query.region ?? null,
        p_city: query.city ?? null,
        p_min_radius_km: query.minRadiusKm ?? null,
        p_verification_statuses: query.verifications?.length ? query.verifications : null,
        p_datacenter: query.datacenter ?? null,
        p_min_available_staff: query.minAvailableStaff ?? null,
        p_available_on: query.availableOn ?? null,
        p_credential_state: query.credentialState ?? null,
        p_only_preferred: query.preferred === true,
        p_only_blocked: query.blocked === true,
        p_include_blocked: query.blocked !== false,
        p_include_archived: query.includeArchived === true,
        p_has_open_demand_signal: query.demand ?? null,
        p_last_contact_before: query.lastContactBefore ?? null,
        p_follow_up_before: query.followUpBefore ?? null,
        p_sort: query.sort,
        p_direction: query.direction,
        p_limit: query.pageSize,
        p_offset: (query.page - 1) * query.pageSize,
      },
    );

    if (searchError !== null) {
      throw new Error(
        `Partner konnten nicht geladen werden: ${searchError.message}. ` +
          'Ist die Migration 0013_partner_search_rpc.sql eingespielt?',
      );
    }

    const rows = asRows<SearchMatchRow>(matches);
    const total = rows[0]?.total_count ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / query.pageSize));

    if (rows.length === 0) {
      return { items: [], total, page: query.page, pageSize: query.pageSize, pageCount };
    }

    const ids = rows.map((row) => row.id);
    const items = await this.loadListItems(organizationId, ids);

    return { items, total, page: query.page, pageSize: query.pageSize, pageCount };
  }

  /** Loads the child data the list columns need, in one round per table. */
  private async loadListItems(
    organizationId: string,
    ids: readonly string[],
  ): Promise<PartnerCompanyListItem[]> {
    const [companies, services, regions, availability, qualifications, signals] =
      await Promise.all([
        this.client
          .from('partner_companies')
          .select(COMPANY_COLUMNS)
          .eq('organization_id', organizationId)
          .in('id', ids),
        this.client
          .from('partner_services')
          .select('*')
          .eq('organization_id', organizationId)
          .in('partner_company_id', ids),
        this.client
          .from('partner_service_regions')
          .select('*')
          .eq('organization_id', organizationId)
          .in('partner_company_id', ids),
        this.client
          .from('partner_availability')
          .select('*')
          .eq('organization_id', organizationId)
          .in('partner_company_id', ids),
        this.client
          .from('partner_qualifications')
          .select('*')
          .eq('organization_id', organizationId)
          .in('partner_company_id', ids),
        this.client
          .from('partner_signals')
          .select('*')
          .eq('organization_id', organizationId)
          .in('partner_company_id', ids),
      ]);

    const now = new Date();
    const byCompany = new Map(
      asRows<CompanyRow>(companies.data).map((row) => [row.id, toCompany(row)]),
    );

    const group = <T extends { partner_company_id: string }>(
      rows: T[],
    ): Map<string, T[]> => {
      const map = new Map<string, T[]>();
      for (const row of rows) {
        const list = map.get(row.partner_company_id) ?? [];
        list.push(row);
        map.set(row.partner_company_id, list);
      }
      return map;
    };

    const servicesBy = group(asRows<ServiceRow>(services.data));
    const regionsBy = group(asRows<RegionRow>(regions.data));
    const availabilityBy = group(asRows<AvailabilityRow>(availability.data));
    const qualificationsBy = group(asRows<QualificationRow>(qualifications.data));
    const signalsBy = new Map<string, PartnerSignal[]>();
    for (const row of asRows<SignalRow>(signals.data)) {
      if (row.partner_company_id === null) continue;
      const list = signalsBy.get(row.partner_company_id) ?? [];
      list.push(toSignal(row));
      signalsBy.set(row.partner_company_id, list);
    }

    // `in` does not preserve order, so the ordering decided in SQL is restored.
    return ids
      .map((id) => {
        const company = byCompany.get(id);
        if (company === undefined) return null;

        const companyServices = (servicesBy.get(id) ?? []).map(toService);
        const companyRegions = (regionsBy.get(id) ?? []).map(toRegion);
        const companyAvailability = (availabilityBy.get(id) ?? []).map(toAvailability);
        const companyQualifications = (qualificationsBy.get(id) ?? []).map(toQualification);

        const staffFigures = companyAvailability
          .filter((entry) => countsAsCurrent(entry, now))
          .map((entry) => entry.availableStaff)
          .filter((value): value is number => value !== null);

        return {
          id: company.id,
          legalName: company.legalName,
          tradeName: company.tradeName,
          relationshipDirection: company.relationshipDirection,
          partnerLevel: company.partnerLevel,
          status: company.status,
          verificationStatus: company.verificationStatus,
          country: company.country,
          region: company.region,
          city: company.city,
          isPreferred: company.isPreferred,
          isBlocked: company.isBlocked,
          datacenterExperienceStatus: company.datacenterExperienceStatus,
          confirmedServices: [
            ...new Set(
              companyServices
                .filter((service) => service.confirmation === 'confirmed')
                .map((service) => service.serviceCategory),
            ),
          ],
          declaredServices: [
            ...new Set(
              companyServices
                .filter((service) => service.confirmation === 'self_declared')
                .map((service) => service.serviceCategory),
            ),
          ],
          regions: [
            ...new Set(
              companyRegions.flatMap((region) =>
                region.nationwide
                  ? ['bundesweit']
                  : [region.city, region.region].filter(
                      (value): value is string => value !== null,
                    ),
              ),
            ),
          ],
          availableStaff: staffFigures.length > 0 ? Math.max(...staffFigures) : null,
          credentialSummary: summarizeCredentials(
            companyQualifications.map(qualificationAsCredential),
            now,
          ),
          hasOpenDemandSignal: (signalsBy.get(id) ?? []).some((signal) =>
            countsAsOpenDemand(signal, now),
          ),
          lastContactAt: company.lastContactAt,
          nextFollowUpAt: company.nextFollowUpAt,
        } satisfies PartnerCompanyListItem;
      })
      .filter((item): item is PartnerCompanyListItem => item !== null);
  }

  async findCompanyById(
    organizationId: string,
    id: string,
  ): Promise<PartnerCompanyDetail | null> {
    const { data, error } = await this.client
      .from('partner_companies')
      .select(COMPANY_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (error !== null) this.fail('Der Partner', error.message);

    const row = asRow<CompanyRow>(data);
    if (row === null) return null;
    const company = toCompany(row);

    const [
      contacts,
      services,
      regions,
      availability,
      qualifications,
      documents,
      activities,
      signals,
      assignments,
      siblings,
    ] = await Promise.all([
      this.client.from('partner_contacts').select('*').eq('organization_id', organizationId).eq('partner_company_id', id),
      this.client.from('partner_services').select('*').eq('organization_id', organizationId).eq('partner_company_id', id),
      this.client.from('partner_service_regions').select('*').eq('organization_id', organizationId).eq('partner_company_id', id),
      this.client.from('partner_availability').select('*').eq('organization_id', organizationId).eq('partner_company_id', id),
      this.client.from('partner_qualifications').select('*').eq('organization_id', organizationId).eq('partner_company_id', id),
      this.client.from('partner_documents').select('*').eq('organization_id', organizationId).eq('partner_company_id', id),
      this.client.from('partner_activities').select('*').eq('organization_id', organizationId).eq('partner_company_id', id).order('occurred_at', { ascending: false }).limit(100),
      this.client.from('partner_signals').select('*').eq('organization_id', organizationId).eq('partner_company_id', id),
      this.client.from('subcontractor_assignments').select('*').eq('organization_id', organizationId).eq('partner_company_id', id),
      this.client.from('partner_companies').select('id, legal_name, normalized_name').eq('organization_id', organizationId).neq('id', id),
    ]);

    const storedQualifications = asRows<QualificationRow>(qualifications.data).map(
      toQualification,
    );

    return {
      company,
      contacts: asRows<ContactRow>(contacts.data).map(toContact),
      services: asRows<ServiceRow>(services.data).map(toService),
      regions: asRows<RegionRow>(regions.data).map(toRegion),
      availability: asRows<AvailabilityRow>(availability.data).map(toAvailability),
      qualifications: storedQualifications,
      documents: asRows<DocumentRow>(documents.data).map(toDocument),
      activities: asRows<ActivityRow>(activities.data).map(toActivity),
      signals: asRows<SignalRow>(signals.data).map(toSignal),
      assignments: asRows<AssignmentRow>(assignments.data).map(toAssignment),
      credentialSummary: summarizeCredentials(
        storedQualifications.map(qualificationAsCredential),
        new Date(),
      ),
      duplicateCandidates: asRows<{
        id: string;
        legal_name: string;
        normalized_name: string;
      }>(siblings.data)
        .filter((other) => looksLikeSameValue(other.normalized_name, company.normalizedName))
        .map((other) => ({ id: other.id, legalName: other.legal_name })),
    };
  }

  async findCompanyRecord(
    organizationId: string,
    id: string,
  ): Promise<PartnerCompany | null> {
    const { data, error } = await this.client
      .from('partner_companies')
      .select(COMPANY_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (error !== null) this.fail('Der Partner', error.message);
    const row = asRow<CompanyRow>(data);
    return row === null ? null : toCompany(row);
  }

  async listDuplicateCandidates(
    organizationId: string,
  ): Promise<PartnerDuplicateCandidate[]> {
    const { data, error } = await this.client
      .from('partner_companies')
      .select(
        'id, legal_name, normalized_name, country, registry_number, vat_id, website, email, phone, city, address',
      )
      .eq('organization_id', organizationId);

    if (error !== null) this.fail('Die Partnerliste', error.message);

    return asRows<{
      id: string;
      legal_name: string;
      normalized_name: string;
      country: string | null;
      registry_number: string | null;
      vat_id: string | null;
      website: string | null;
      email: string | null;
      phone: string | null;
      city: string | null;
      address: string | null;
    }>(data).map((row) => ({
      id: row.id,
      legalName: row.legal_name,
      normalizedName: row.normalized_name,
      country: row.country,
      registryNumber: row.registry_number,
      vatId: row.vat_id,
      website: row.website,
      email: row.email,
      phone: row.phone,
      city: row.city,
      address: row.address,
    }));
  }

  async createCompany(input: CreatePartnerInput): Promise<PartnerCompany> {
    const { data, error } = await this.client
      .from('partner_companies')
      .insert({ ...companyToRow(input), first_observed_at: new Date().toISOString() })
      .select(COMPANY_COLUMNS)
      .single();

    if (error !== null) {
      throw new Error(`Der Partner konnte nicht angelegt werden: ${error.message}`);
    }

    const row = asRow<CompanyRow>(data);
    if (row === null) throw new Error('Der Partner konnte nicht angelegt werden.');
    return toCompany(row);
  }

  async updateCompany(
    organizationId: string,
    id: string,
    patch: UpdatePartnerInput,
  ): Promise<PartnerCompany | null> {
    const row = patchToRow(patch);
    if (patch.status === 'archived') row.archived_at = new Date().toISOString();
    else if (patch.status !== undefined) row.archived_at = null;

    const { data, error } = await this.client
      .from('partner_companies')
      .update(row)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select(COMPANY_COLUMNS)
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Der Partner konnte nicht gespeichert werden: ${error.message}`);
    }

    const updated = asRow<CompanyRow>(data);
    return updated === null ? null : toCompany(updated);
  }

  // --- Sub-records -------------------------------------------------------

  /** Confirms the company belongs to the organisation before writing a child. */
  private async ownsCompany(organizationId: string, companyId: string): Promise<boolean> {
    const { data } = await this.client
      .from('partner_companies')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', companyId)
      .maybeSingle();
    return asRow<{ id: string }>(data) !== null;
  }

  async saveContact(input: SaveContactInput): Promise<PartnerContact | null> {
    if (!(await this.ownsCompany(input.organizationId, input.partnerCompanyId))) return null;

    const payload = {
      partner_company_id: input.partnerCompanyId,
      organization_id: input.organizationId,
      first_name: input.firstName,
      last_name: input.lastName,
      role: input.role,
      business_email: input.businessEmail,
      business_phone: input.businessPhone,
      preferred_channel: input.preferredChannel,
      source_type: input.sourceType,
      internal_note: input.internalNote,
      is_active: input.isActive,
    };

    const query =
      input.id === undefined
        ? this.client.from('partner_contacts').insert(payload)
        : this.client
            .from('partner_contacts')
            .update(payload)
            .eq('id', input.id)
            .eq('organization_id', input.organizationId);

    const { data, error } = await query.select('*').maybeSingle();
    if (error !== null) {
      throw new Error(`Der Kontakt konnte nicht gespeichert werden: ${error.message}`);
    }
    const row = asRow<ContactRow>(data);
    return row === null ? null : toContact(row);
  }

  async saveService(input: SaveServiceInput): Promise<PartnerService | null> {
    if (!(await this.ownsCompany(input.organizationId, input.partnerCompanyId))) return null;

    const { data, error } = await this.client
      .from('partner_services')
      .upsert(
        {
          partner_company_id: input.partnerCompanyId,
          organization_id: input.organizationId,
          service_category: input.serviceCategory,
          service_label: input.serviceLabel,
          confirmation: input.confirmation,
          confirmation_source: input.confirmationSource,
          capacity_note: input.capacityNote,
          available_staff: input.availableStaff,
          delivery_mode: input.deliveryMode,
          note: input.note,
        },
        { onConflict: 'partner_company_id,service_category' },
      )
      .select('*')
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Die Leistung konnte nicht gespeichert werden: ${error.message}`);
    }
    const row = asRow<ServiceRow>(data);
    return row === null ? null : toService(row);
  }

  async saveRegion(input: SaveRegionInput): Promise<PartnerServiceRegion | null> {
    if (!(await this.ownsCompany(input.organizationId, input.partnerCompanyId))) return null;

    const payload = {
      partner_company_id: input.partnerCompanyId,
      organization_id: input.organizationId,
      country: input.country,
      region: input.region,
      city: input.city,
      radius_km: input.radiusKm,
      nationwide: input.nationwide,
      willing_to_travel: input.willingToTravel,
      is_confirmed: input.isConfirmed,
      note: input.note,
    };

    const query =
      input.id === undefined
        ? this.client.from('partner_service_regions').insert(payload)
        : this.client
            .from('partner_service_regions')
            .update(payload)
            .eq('id', input.id)
            .eq('organization_id', input.organizationId);

    const { data, error } = await query.select('*').maybeSingle();
    if (error !== null) {
      throw new Error(`Das Einsatzgebiet konnte nicht gespeichert werden: ${error.message}`);
    }
    const row = asRow<RegionRow>(data);
    return row === null ? null : toRegion(row);
  }

  async saveAvailability(
    input: SaveAvailabilityInput,
  ): Promise<PartnerAvailability | null> {
    if (!(await this.ownsCompany(input.organizationId, input.partnerCompanyId))) return null;

    const payload: Record<string, unknown> = {
      partner_company_id: input.partnerCompanyId,
      organization_id: input.organizationId,
      service_category: input.serviceCategory,
      available_from: input.availableFrom,
      available_until: input.availableUntil,
      status: input.status,
      available_staff: input.availableStaff,
      shift_model: input.shiftModel,
      night_shift: input.nightShift,
      weekend: input.weekend,
      around_the_clock: input.aroundTheClock,
      short_notice: input.shortNotice,
      note: input.note,
    };
    // Only stamp the confirmation when the user actually confirmed it.
    if (input.confirmNow) payload.last_confirmed_at = new Date().toISOString();

    const query =
      input.id === undefined
        ? this.client.from('partner_availability').insert(payload)
        : this.client
            .from('partner_availability')
            .update(payload)
            .eq('id', input.id)
            .eq('organization_id', input.organizationId);

    const { data, error } = await query.select('*').maybeSingle();
    if (error !== null) {
      throw new Error(`Die Verfügbarkeit konnte nicht gespeichert werden: ${error.message}`);
    }
    const row = asRow<AvailabilityRow>(data);
    return row === null ? null : toAvailability(row);
  }

  async saveQualification(
    input: SaveQualificationInput,
  ): Promise<PartnerQualification | null> {
    if (!(await this.ownsCompany(input.organizationId, input.partnerCompanyId))) return null;

    const payload = {
      partner_company_id: input.partnerCompanyId,
      organization_id: input.organizationId,
      credential_type: input.credentialType,
      title: input.title,
      issuer: input.issuer,
      document_number: input.documentNumber,
      valid_from: input.validFrom,
      valid_until: input.validUntil,
      review_status: input.reviewStatus,
      reviewed_by: input.reviewStatus === 'pending' ? null : input.reviewedBy,
      reviewed_at: input.reviewStatus === 'pending' ? null : new Date().toISOString(),
      note: input.note,
    };

    const query =
      input.id === undefined
        ? this.client.from('partner_qualifications').insert(payload)
        : this.client
            .from('partner_qualifications')
            .update(payload)
            .eq('id', input.id)
            .eq('organization_id', input.organizationId);

    const { data, error } = await query.select('*').maybeSingle();
    if (error !== null) {
      throw new Error(`Der Nachweis konnte nicht gespeichert werden: ${error.message}`);
    }
    const row = asRow<QualificationRow>(data);
    return row === null ? null : toQualification(row);
  }

  // --- Documents ---------------------------------------------------------

  async saveDocument(input: SaveDocumentInput): Promise<PartnerDocument | null> {
    if (!(await this.ownsCompany(input.organizationId, input.partnerCompanyId))) return null;

    const { data, error } = await this.client
      .from('partner_documents')
      .insert({
        partner_company_id: input.partnerCompanyId,
        organization_id: input.organizationId,
        partner_qualification_id: input.partnerQualificationId,
        credential_type: input.credentialType,
        storage_path: input.storagePath,
        file_name: input.fileName,
        mime_type: input.mimeType,
        file_size: input.fileSize,
        checksum: input.checksum,
        confidentiality: input.confidentiality,
        // No scanner is wired up; the column stays at its honest default.
        scan_status: 'not_scanned',
        valid_from: input.validFrom,
        valid_until: input.validUntil,
        note: input.note,
        uploaded_by: input.uploadedBy,
      })
      .select('*')
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Das Dokument konnte nicht gespeichert werden: ${error.message}`);
    }
    const row = asRow<DocumentRow>(data);
    return row === null ? null : toDocument(row);
  }

  async listDocuments(
    organizationId: string,
    partnerCompanyId: string,
  ): Promise<PartnerDocument[]> {
    const { data, error } = await this.client
      .from('partner_documents')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('partner_company_id', partnerCompanyId);

    if (error !== null) this.fail('Die Dokumente', error.message);
    return asRows<DocumentRow>(data).map(toDocument);
  }

  async findDocument(
    organizationId: string,
    id: string,
  ): Promise<PartnerDocument | null> {
    const { data, error } = await this.client
      .from('partner_documents')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (error !== null) this.fail('Das Dokument', error.message);
    const row = asRow<DocumentRow>(data);
    return row === null ? null : toDocument(row);
  }

  async reviewDocument(
    organizationId: string,
    id: string,
    review: {
      reviewStatus: PartnerDocument['reviewStatus'];
      reviewedBy: string | null;
      note: string | null;
    },
  ): Promise<PartnerDocument | null> {
    const payload: Record<string, unknown> = {
      review_status: review.reviewStatus,
      reviewed_by: review.reviewedBy,
      reviewed_at: new Date().toISOString(),
    };
    if (review.note !== null) payload.note = review.note;

    const { data, error } = await this.client
      .from('partner_documents')
      .update(payload)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Die Prüfung konnte nicht gespeichert werden: ${error.message}`);
    }
    const row = asRow<DocumentRow>(data);
    return row === null ? null : toDocument(row);
  }

  // --- Rates -------------------------------------------------------------

  async listRates(
    organizationId: string,
    partnerCompanyId: string,
  ): Promise<PartnerRate[]> {
    const { data, error } = await this.client
      .from('partner_rates')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('partner_company_id', partnerCompanyId);

    if (error !== null) this.fail('Die Konditionen', error.message);
    return asRows<RateRow>(data).map(toRate);
  }

  async saveRate(input: SaveRateInput): Promise<PartnerRate | null> {
    if (!(await this.ownsCompany(input.organizationId, input.partnerCompanyId))) return null;

    const payload = {
      partner_company_id: input.partnerCompanyId,
      organization_id: input.organizationId,
      service_category: input.serviceCategory,
      region: input.region,
      rate_model: input.rateModel,
      unit: input.unit,
      net_amount: input.netAmount,
      currency: input.currency,
      valid_from: input.validFrom,
      valid_until: input.validUntil,
      surcharges: input.surcharges,
      negotiation_status: input.negotiationStatus,
      internal_note: input.internalNote,
      created_by: input.createdBy,
    };

    const query =
      input.id === undefined
        ? this.client.from('partner_rates').insert(payload)
        : this.client
            .from('partner_rates')
            .update(payload)
            .eq('id', input.id)
            .eq('organization_id', input.organizationId);

    const { data, error } = await query.select('*').maybeSingle();
    if (error !== null) {
      throw new Error(`Die Kondition konnte nicht gespeichert werden: ${error.message}`);
    }
    const row = asRow<RateRow>(data);
    return row === null ? null : toRate(row);
  }

  // --- Activities --------------------------------------------------------

  async saveActivity(input: SaveActivityInput): Promise<PartnerActivity | null> {
    if (!(await this.ownsCompany(input.organizationId, input.partnerCompanyId))) return null;

    const { data, error } = await this.client
      .from('partner_activities')
      .insert({
        partner_company_id: input.partnerCompanyId,
        organization_id: input.organizationId,
        partner_contact_id: input.partnerContactId,
        activity_type: input.activityType,
        occurred_at: input.occurredAt,
        summary: input.summary,
        outcome: input.outcome,
        next_action: input.nextAction,
        follow_up_at: input.followUpAt,
        created_by: input.createdBy,
      })
      .select('*')
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Die Aktivität konnte nicht gespeichert werden: ${error.message}`);
    }

    // Keep the company's own follow-up fields in step with the activity.
    const companyPatch: Record<string, unknown> = { last_contact_at: input.occurredAt };
    if (input.followUpAt !== null) companyPatch.next_follow_up_at = input.followUpAt;
    await this.client
      .from('partner_companies')
      .update(companyPatch)
      .eq('organization_id', input.organizationId)
      .eq('id', input.partnerCompanyId);

    const row = asRow<ActivityRow>(data);
    return row === null ? null : toActivity(row);
  }

  async listActivities(
    organizationId: string,
    options: { partnerCompanyId?: string; limit: number },
  ): Promise<Array<PartnerActivity & { companyName: string }>> {
    let request = this.client
      .from('partner_activities')
      .select('*, partner_companies ( legal_name )')
      .eq('organization_id', organizationId)
      .order('occurred_at', { ascending: false })
      .limit(options.limit);

    if (options.partnerCompanyId !== undefined) {
      request = request.eq('partner_company_id', options.partnerCompanyId);
    }

    const { data, error } = await request;
    if (error !== null) this.fail('Die Aktivitäten', error.message);

    return asRows<ActivityRow>(data).map((row) => ({
      ...toActivity(row),
      companyName: row.partner_companies?.legal_name ?? '—',
    }));
  }

  async listDueFollowUps(
    organizationId: string,
    until: string,
  ): Promise<Array<PartnerActivity & { companyName: string }>> {
    const { data, error } = await this.client
      .from('partner_activities')
      .select('*, partner_companies ( legal_name )')
      .eq('organization_id', organizationId)
      .not('follow_up_at', 'is', null)
      .lte('follow_up_at', `${until}T23:59:59Z`)
      .order('follow_up_at', { ascending: true });

    if (error !== null) this.fail('Die Wiedervorlagen', error.message);

    return asRows<ActivityRow>(data).map((row) => ({
      ...toActivity(row),
      companyName: row.partner_companies?.legal_name ?? '—',
    }));
  }

  // --- Signals -----------------------------------------------------------

  async listSignals(
    organizationId: string,
    query: SignalQuery,
  ): Promise<PaginatedResult<PartnerSignalListItem>> {
    let request = this.client
      .from('partner_signals')
      .select('*, partner_companies ( legal_name )', { count: 'exact' })
      .eq('organization_id', organizationId);

    if (query.types !== undefined && query.types.length > 0) {
      request = request.in('signal_type', query.types);
    }
    if (query.statuses !== undefined && query.statuses.length > 0) {
      request = request.in('status', query.statuses);
    }
    if (query.services !== undefined && query.services.length > 0) {
      request = request.in('service_category', query.services);
    }
    if (query.demandOnly === true) {
      request = request.in('signal_type', [
        'seeks_subcontractor',
        'seeks_further_subcontractor',
        'seeks_security',
        'seeks_construction_support',
        'seeks_cleaning',
      ]);
    }
    if (query.includeExpired !== true) {
      request = request.neq('status', 'expired');
    }
    if (query.q !== undefined) {
      request = request.or(
        `company_name_raw.ilike.%${query.q}%,project_name.ilike.%${query.q}%,description.ilike.%${query.q}%`,
      );
    }

    const offset = (query.page - 1) * query.pageSize;
    const { data, error, count } = await request
      .order('observed_at', { ascending: false })
      .range(offset, offset + query.pageSize - 1);

    if (error !== null) this.fail('Die Signale', error.message);

    const now = new Date();
    const items = asRows<SignalRow>(data)
      .map((row) => ({
        ...toSignal(row),
        companyName: row.partner_companies?.legal_name ?? row.company_name_raw,
        assignedToName: null,
      }))
      // Date-based expiry cannot be expressed together with the rest above, so
      // it is applied here. It never changes the count of stored rows, only
      // hides ones whose own validity ran out.
      .filter((signal) => query.includeExpired === true || !isSignalExpired(signal, now));

    const total = count ?? items.length;
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async findSignalById(
    organizationId: string,
    id: string,
  ): Promise<PartnerSignal | null> {
    const { data, error } = await this.client
      .from('partner_signals')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (error !== null) this.fail('Das Signal', error.message);
    const row = asRow<SignalRow>(data);
    return row === null ? null : toSignal(row);
  }

  async saveSignal(input: SaveSignalInput): Promise<PartnerSignal | null> {
    if (
      input.partnerCompanyId !== null &&
      !(await this.ownsCompany(input.organizationId, input.partnerCompanyId))
    ) {
      return null;
    }

    const payload = {
      organization_id: input.organizationId,
      partner_company_id: input.partnerCompanyId,
      company_name_raw: input.companyNameRaw,
      signal_type: input.signalType,
      service_category: input.serviceCategory,
      project_name: input.projectName,
      country: input.country,
      region: input.region,
      city: input.city,
      description: input.description,
      source_type: input.sourceType,
      source_name: input.sourceName,
      source_url: input.sourceUrl,
      observed_at: input.observedAt,
      valid_until: input.validUntil,
      confidence: input.confidence,
      status: input.status,
      assigned_to: input.assignedTo,
      next_action: input.nextAction,
      follow_up_at: input.followUpAt,
      internal_note: input.internalNote,
      created_by: input.createdBy,
    };

    const query =
      input.id === undefined
        ? this.client.from('partner_signals').insert(payload)
        : this.client
            .from('partner_signals')
            .update(payload)
            .eq('id', input.id)
            .eq('organization_id', input.organizationId);

    const { data, error } = await query.select('*').maybeSingle();
    if (error !== null) {
      throw new Error(`Das Signal konnte nicht gespeichert werden: ${error.message}`);
    }
    const row = asRow<SignalRow>(data);
    return row === null ? null : toSignal(row);
  }

  // --- Needs and matches -------------------------------------------------

  async listNeeds(
    organizationId: string,
    query: NeedQuery,
  ): Promise<PaginatedResult<SubcontractorNeedListItem>> {
    let request = this.client
      .from('subcontractor_needs')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId);

    if (query.statuses !== undefined && query.statuses.length > 0) {
      request = request.in('status', query.statuses);
    }
    if (query.services !== undefined && query.services.length > 0) {
      request = request.in('service_category', query.services);
    }
    if (query.q !== undefined) {
      request = request.ilike('title', `%${query.q}%`);
    }

    const offset = (query.page - 1) * query.pageSize;
    const { data, error, count } = await request
      .order('created_at', { ascending: false })
      .range(offset, offset + query.pageSize - 1);

    if (error !== null) this.fail('Die Bedarfe', error.message);

    const needs = asRows<NeedRow>(data).map(toNeed);
    const ids = needs.map((need) => need.id);

    const { data: matchData } = ids.length === 0
      ? { data: [] }
      : await this.client
          .from('subcontractor_matches')
          .select('need_id, status')
          .eq('organization_id', organizationId)
          .in('need_id', ids);

    const matches = asRows<{ need_id: string; status: MatchStatus }>(matchData);

    const total = count ?? needs.length;
    return {
      items: needs.map((need) => ({
        ...need,
        matchCount: matches.filter((match) => match.need_id === need.id).length,
        shortlistedCount: matches.filter(
          (match) => match.need_id === need.id && match.status === 'shortlisted',
        ).length,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async findNeedById(
    organizationId: string,
    id: string,
  ): Promise<SubcontractorNeed | null> {
    const { data, error } = await this.client
      .from('subcontractor_needs')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (error !== null) this.fail('Der Bedarf', error.message);
    const row = asRow<NeedRow>(data);
    return row === null ? null : toNeed(row);
  }

  async saveNeed(input: SaveNeedInput): Promise<SubcontractorNeed | null> {
    const payload = {
      organization_id: input.organizationId,
      title: input.title,
      reference_project_id: input.referenceProjectId,
      tender_id: input.tenderId,
      project_type: input.projectType,
      service_category: input.serviceCategory,
      country: input.country,
      region: input.region,
      city: input.city,
      site_address: input.siteAddress,
      radius_km: input.radiusKm,
      start_date: input.startDate,
      end_date: input.endDate,
      required_staff: input.requiredStaff,
      shift_model: input.shiftModel,
      around_the_clock: input.aroundTheClock,
      night_work: input.nightWork,
      weekend_work: input.weekendWork,
      required_qualifications: input.requiredQualifications,
      required_credentials: input.requiredCredentials,
      further_subcontracting_allowed: input.furtherSubcontractingAllowed,
      target_budget: input.targetBudget,
      currency: input.currency,
      confidentiality: input.confidentiality,
      status: input.status,
      internal_note: input.internalNote,
      created_by: input.createdBy,
    };

    const query =
      input.id === undefined
        ? this.client.from('subcontractor_needs').insert(payload)
        : this.client
            .from('subcontractor_needs')
            .update(payload)
            .eq('id', input.id)
            .eq('organization_id', input.organizationId);

    const { data, error } = await query.select('*').maybeSingle();
    if (error !== null) {
      throw new Error(`Der Bedarf konnte nicht gespeichert werden: ${error.message}`);
    }
    const row = asRow<NeedRow>(data);
    return row === null ? null : toNeed(row);
  }

  async recomputeMatches(
    organizationId: string,
    needId: string,
  ): Promise<MatchResult[] | null> {
    const need = await this.findNeedById(organizationId, needId);
    if (need === null) return null;

    const [companies, services, regions, availability, qualifications] = await Promise.all([
      this.client.from('partner_companies').select(COMPANY_COLUMNS).eq('organization_id', organizationId),
      this.client.from('partner_services').select('*').eq('organization_id', organizationId),
      this.client.from('partner_service_regions').select('*').eq('organization_id', organizationId),
      this.client.from('partner_availability').select('*').eq('organization_id', organizationId),
      this.client.from('partner_qualifications').select('*').eq('organization_id', organizationId),
    ]);

    const serviceRows = asRows<ServiceRow>(services.data).map(toService);
    const regionRows = asRows<RegionRow>(regions.data).map(toRegion);
    const availabilityRows = asRows<AvailabilityRow>(availability.data).map(toAvailability);
    const qualificationRows = asRows<QualificationRow>(qualifications.data).map(toQualification);

    const candidates: MatchCandidate[] = asRows<CompanyRow>(companies.data)
      .map(toCompany)
      .map((company) => ({
        company,
        services: serviceRows.filter((entry) => entry.partnerCompanyId === company.id),
        regions: regionRows.filter((entry) => entry.partnerCompanyId === company.id),
        availability: availabilityRows.filter((entry) => entry.partnerCompanyId === company.id),
        qualifications: qualificationRows.filter(
          (entry) => entry.partnerCompanyId === company.id,
        ),
      }));

    // The same scoring function both adapters use, so the figures match.
    const results = rankCandidates(candidates, need);

    const componentOf = (result: MatchResult, key: string): number =>
      result.components.find((entry) => entry.key === key)?.points ?? 0;

    const rows = results.map((result) => ({
      organization_id: organizationId,
      need_id: needId,
      partner_company_id: result.partnerCompanyId,
      total_score: result.totalScore,
      score_version: result.scoreVersion,
      service_score: componentOf(result, 'service'),
      region_score: componentOf(result, 'region'),
      availability_score: componentOf(result, 'availability'),
      capacity_score: componentOf(result, 'capacity'),
      credential_score: componentOf(result, 'credentials'),
      datacenter_score: componentOf(result, 'datacenter'),
      exclusion_reason: result.exclusionReason,
      missing_information: result.missingInformation,
      reasoning: result.components,
    }));

    if (rows.length > 0) {
      // `onConflict` keeps the human decision on an existing match: only the
      // computed columns are replaced, `status` is not in the payload.
      const { error } = await this.client
        .from('subcontractor_matches')
        .upsert(rows, { onConflict: 'need_id,partner_company_id' });
      if (error !== null) {
        throw new Error(`Die Matches konnten nicht gespeichert werden: ${error.message}`);
      }
    }

    return results;
  }

  async listMatches(
    organizationId: string,
    needId: string,
  ): Promise<SubcontractorMatchListItem[]> {
    const { data, error } = await this.client
      .from('subcontractor_matches')
      .select('*, partner_companies ( legal_name, status, is_blocked )')
      .eq('organization_id', organizationId)
      .eq('need_id', needId)
      .order('total_score', { ascending: false });

    if (error !== null) this.fail('Die Matches', error.message);
    return asRows<MatchRow>(data).map(toMatch);
  }

  async updateMatchStatus(
    organizationId: string,
    matchId: string,
    status: MatchStatus,
    reviewedBy: string | null,
  ): Promise<SubcontractorMatchListItem | null> {
    const { data, error } = await this.client
      .from('subcontractor_matches')
      .update({
        status,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
      .eq('id', matchId)
      .select('*, partner_companies ( legal_name, status, is_blocked )')
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Der Match konnte nicht gespeichert werden: ${error.message}`);
    }
    const row = asRow<MatchRow>(data);
    return row === null ? null : toMatch(row);
  }

  // --- Assignments -------------------------------------------------------

  async listAssignments(
    organizationId: string,
    options: { partnerCompanyId?: string; referenceProjectId?: string },
  ): Promise<AssignmentTreeNode[]> {
    let request = this.client
      .from('subcontractor_assignments')
      .select('*, partner_companies ( legal_name, is_blocked )')
      .eq('organization_id', organizationId);

    if (options.referenceProjectId !== undefined) {
      request = request.eq('reference_project_id', options.referenceProjectId);
    }

    const { data, error } = await request;
    if (error !== null) this.fail('Die Projektzuordnungen', error.message);

    const rows = asRows<AssignmentRow>(data);

    // When one company is asked for, the whole chain it belongs to is still
    // returned: a subcontractor without its parent is not a chain.
    const relevant =
      options.partnerCompanyId === undefined
        ? rows
        : (() => {
            const byId = new Map(rows.map((row) => [row.id, row]));
            const wanted = new Set<string>();
            for (const row of rows) {
              if (row.partner_company_id !== options.partnerCompanyId) continue;
              let cursor: AssignmentRow | undefined = row;
              let hops = 0;
              while (cursor !== undefined && hops <= 8) {
                wanted.add(cursor.id);
                cursor =
                  cursor.parent_assignment_id === null
                    ? undefined
                    : byId.get(cursor.parent_assignment_id);
                hops += 1;
              }
            }
            return rows.filter((row) => wanted.has(row.id));
          })();

    return buildChainTree(
      relevant.map((row) => ({
        assignment: toAssignment(row),
        companyName: row.partner_companies?.legal_name ?? '—',
        companyIsBlocked: row.partner_companies?.is_blocked ?? false,
      })),
    );
  }

  async findAssignmentById(
    organizationId: string,
    id: string,
  ): Promise<SubcontractorAssignment | null> {
    const { data, error } = await this.client
      .from('subcontractor_assignments')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();

    if (error !== null) this.fail('Die Zuordnung', error.message);
    const row = asRow<AssignmentRow>(data);
    return row === null ? null : toAssignment(row);
  }

  async saveAssignment(
    input: SaveAssignmentInput,
  ): Promise<SubcontractorAssignment | null> {
    if (!(await this.ownsCompany(input.organizationId, input.partnerCompanyId))) return null;

    const { data: existingData } = await this.client
      .from('subcontractor_assignments')
      .select('id, parent_assignment_id, chain_level, partner_company_id')
      .eq('organization_id', input.organizationId);

    // Checked here as well as in the database trigger: the application must
    // give a readable error rather than surfacing a raised exception.
    const { chainLevel } = validateChainLink({
      assignmentId: input.id ?? null,
      parentAssignmentId: input.parentAssignmentId,
      existing: asRows<{
        id: string;
        parent_assignment_id: string | null;
        chain_level: number;
        partner_company_id: string;
      }>(existingData).map((row) => ({
        id: row.id,
        parentAssignmentId: row.parent_assignment_id,
        chainLevel: row.chain_level,
        partnerCompanyId: row.partner_company_id,
      })),
    });

    const payload = {
      organization_id: input.organizationId,
      partner_company_id: input.partnerCompanyId,
      reference_project_id: input.referenceProjectId,
      need_id: input.needId,
      role: input.role,
      parent_assignment_id: input.parentAssignmentId,
      chain_level: chainLevel,
      contract_partner_company_id: input.contractPartnerCompanyId,
      scope: input.scope,
      staff_count: input.staffCount,
      start_date: input.startDate,
      end_date: input.endDate,
      further_subcontracting_allowed: input.furtherSubcontractingAllowed,
      status: input.status,
      internal_rating: input.internalRating,
      note: input.note,
      created_by: input.createdBy,
    };

    const query =
      input.id === undefined
        ? this.client.from('subcontractor_assignments').insert(payload)
        : this.client
            .from('subcontractor_assignments')
            .update(payload)
            .eq('id', input.id)
            .eq('organization_id', input.organizationId);

    const { data, error } = await query.select('*').maybeSingle();
    if (error !== null) {
      throw new Error(`Die Zuordnung konnte nicht gespeichert werden: ${error.message}`);
    }
    const row = asRow<AssignmentRow>(data);
    return row === null ? null : toAssignment(row);
  }

  // --- Credentials -------------------------------------------------------

  async listExpiringCredentials(
    organizationId: string,
    withinDays: number,
  ): Promise<ExpiringCredential[]> {
    const limit = new Date();
    limit.setUTCDate(limit.getUTCDate() + withinDays);

    const { data, error } = await this.client
      .from('partner_qualifications')
      .select('*, partner_companies ( legal_name )')
      .eq('organization_id', organizationId)
      .not('valid_until', 'is', null)
      .lte('valid_until', limit.toISOString().slice(0, 10))
      .order('valid_until', { ascending: true });

    if (error !== null) this.fail('Die Nachweise', error.message);

    return asRows<QualificationRow & { partner_companies?: { legal_name: string } | null }>(
      data,
    ).map((row) => ({
      partnerCompanyId: row.partner_company_id,
      companyName: row.partner_companies?.legal_name ?? '—',
      qualification: toQualification(row),
    }));
  }

  // --- Import ------------------------------------------------------------

  async createImport(input: CreatePartnerImportInput): Promise<PartnerImportRun> {
    const { data, error } = await this.client
      .from('partner_imports')
      .insert({
        organization_id: input.organizationId,
        file_name: input.fileName,
        file_type: input.fileType,
        status: input.status,
        total_rows: input.totalRows,
        valid_rows: input.validRows,
        warning_rows: input.warningRows,
        error_rows: input.errorRows,
        imported_rows: input.importedRows,
        created_by: input.createdBy,
        completed_at: input.status === 'dry_run' ? null : new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error !== null) {
      throw new Error(`Der Importlauf konnte nicht angelegt werden: ${error.message}`);
    }

    const row = asRow<ImportRow>(data);
    if (row === null) throw new Error('Der Importlauf konnte nicht angelegt werden.');
    return toImportRun(row);
  }

  async addImportRows(rows: readonly CreatePartnerImportRowInput[]): Promise<void> {
    if (rows.length === 0) return;

    const { error } = await this.client.from('partner_import_rows').insert(
      rows.map((row) => ({
        partner_import_id: row.partnerImportId,
        organization_id: row.organizationId,
        row_number: row.rowNumber,
        raw_data: row.rawData,
        normalized_data: row.normalizedData,
        validation_status: row.validationStatus,
        validation_messages: row.validationMessages,
        imported_company_id: row.importedCompanyId,
      })),
    );

    if (error !== null) {
      throw new Error(`Die Importzeilen konnten nicht gespeichert werden: ${error.message}`);
    }
  }

  async listImports(
    organizationId: string,
    limit: number,
  ): Promise<PartnerImportRun[]> {
    const { data, error } = await this.client
      .from('partner_imports')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error !== null) this.fail('Die Importläufe', error.message);
    return asRows<ImportRow>(data).map(toImportRun);
  }

  // --- Audit -------------------------------------------------------------

  async recordAuditEntry(input: AuditEntryInput): Promise<void> {
    const { error } = await this.client.from('audit_log').insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      metadata: input.metadata,
    });

    if (error !== null) {
      throw new Error(`Der Audit-Eintrag konnte nicht geschrieben werden: ${error.message}`);
    }
  }

  async listAuditEntries(
    organizationId: string,
    resourceType: string,
    resourceIds: readonly string[],
    limit: number,
  ): Promise<AuditEntry[]> {
    if (resourceIds.length === 0) return [];

    const { data, error } = await this.client
      .from('audit_log')
      .select('*, profiles ( full_name, email )')
      .eq('organization_id', organizationId)
      .eq('resource_type', resourceType)
      .in('resource_id', resourceIds)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error !== null) this.fail('Die Audit-Historie', error.message);

    return asRows<{
      id: string;
      organization_id: string | null;
      user_id: string | null;
      action: string;
      resource_type: string | null;
      resource_id: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
      profiles?: { full_name: string | null; email: string | null } | null;
    }>(data).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      userName: row.profiles?.full_name ?? row.profiles?.email ?? null,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
    }));
  }

  // --- Aggregates --------------------------------------------------------

  async getMetrics(organizationId: string): Promise<PartnerMetrics> {
    const day = new Date().toISOString().slice(0, 10);
    const horizon = new Date();
    horizon.setUTCDate(horizon.getUTCDate() + 90);

    const [companies, availability, signals, followUps, credentials, needs] =
      await Promise.all([
        this.client
          .from('partner_companies')
          .select('id, status, is_blocked, archived_at')
          .eq('organization_id', organizationId),
        this.client
          .from('partner_availability')
          .select('partner_company_id, status, available_from, available_until, last_confirmed_at')
          .eq('organization_id', organizationId),
        this.client
          .from('partner_signals')
          .select('partner_company_id, signal_type, status, valid_until')
          .eq('organization_id', organizationId),
        this.client
          .from('partner_activities')
          .select('id')
          .eq('organization_id', organizationId)
          .not('follow_up_at', 'is', null)
          .lte('follow_up_at', `${day}T23:59:59Z`),
        this.client
          .from('partner_qualifications')
          .select('id')
          .eq('organization_id', organizationId)
          .not('valid_until', 'is', null)
          .lte('valid_until', horizon.toISOString().slice(0, 10)),
        this.client
          .from('subcontractor_needs')
          .select('id')
          .eq('organization_id', organizationId)
          .in('status', ['active', 'in_review']),
      ]);

    const now = new Date();
    const companyRows = asRows<{
      id: string;
      status: PartnerCompany['status'];
      is_blocked: boolean;
      archived_at: string | null;
    }>(companies.data).filter((row) => row.archived_at === null);

    const availabilityRows = asRows<AvailabilityRow>(availability.data).map(toAvailability);
    const signalRows = asRows<SignalRow>(signals.data);

    const availableCompanies = new Set(
      availabilityRows
        .filter(
          (entry) =>
            countsAsCurrent(entry, now) &&
            (entry.status === 'available' || entry.status === 'partially_available') &&
            coversDate(entry, day),
        )
        .map((entry) => entry.partnerCompanyId),
    );

    const demandCompanies = new Set(
      signalRows
        .filter(
          (row) =>
            row.partner_company_id !== null &&
            isDemandSignal(row.signal_type) &&
            countsAsOpenDemand(
              { signalType: row.signal_type, status: row.status, validUntil: row.valid_until },
              now,
            ),
        )
        .map((row) => row.partner_company_id),
    );

    return {
      qualifiedPartners: companyRows.filter(
        (row) => !row.is_blocked && (row.status === 'qualified' || row.status === 'preferred'),
      ).length,
      availableNow: availableCompanies.size,
      companiesSeekingSubcontractors: demandCompanies.size,
      dueFollowUps: asRows<{ id: string }>(followUps.data).length,
      expiringCredentials: asRows<{ id: string }>(credentials.data).length,
      openNeeds: asRows<{ id: string }>(needs.data).length,
    };
  }

  async listFacets(organizationId: string): Promise<PartnerFacets> {
    const [companies, regions] = await Promise.all([
      this.client
        .from('partner_companies')
        .select('country, region, city')
        .eq('organization_id', organizationId),
      this.client
        .from('partner_service_regions')
        .select('region, city')
        .eq('organization_id', organizationId),
    ]);

    const companyRows = asRows<{
      country: string | null;
      region: string | null;
      city: string | null;
    }>(companies.data);
    const regionRows = asRows<{ region: string | null; city: string | null }>(regions.data);

    const collect = (values: Array<string | null>): string[] =>
      [...new Set(values.filter((value): value is string => value !== null))].sort((a, b) =>
        a.localeCompare(b, 'de'),
      );

    return {
      countries: collect(companyRows.map((row) => row.country)),
      regions: collect([
        ...companyRows.map((row) => row.region),
        ...regionRows.map((row) => row.region),
      ]),
      cities: collect([
        ...companyRows.map((row) => row.city),
        ...regionRows.map((row) => row.city),
      ]),
    };
  }
}

/** Kept so both adapters agree on what "not stale" means. */
export { normalizeForComparison, daysUntil };
