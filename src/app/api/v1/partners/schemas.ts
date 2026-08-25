/**
 * Request schemas shared by the partner routes.
 *
 * Kept in one file so the same field is validated the same way wherever it
 * arrives — a second, slightly different schema for the same value is how a
 * validation rule quietly stops applying.
 */

import { z } from 'zod';
import {
  ACTIVITY_TYPES,
  ASSIGNMENT_ROLES,
  ASSIGNMENT_STATUSES,
  AVAILABILITY_STATUSES,
  CONTACT_CHANNELS,
  CREDENTIAL_REVIEW_STATUSES,
  CREDENTIAL_TYPES,
  DATACENTER_EXPERIENCE_STATUSES,
  FURTHER_SUBCONTRACTING_STATUSES,
  MATCH_STATUSES,
  NEED_STATUSES,
  NEGOTIATION_STATUSES,
  PARTNER_LEVELS,
  PARTNER_SERVICE_CATEGORIES,
  PARTNER_SERVICE_CONFIRMATIONS,
  PARTNER_SERVICE_SOURCES,
  PARTNER_STATUSES,
  RATE_MODELS,
  RELATIONSHIP_DIRECTIONS,
  SERVICE_DELIVERY_MODES,
  SHIFT_MODELS,
  SIGNAL_CONFIDENCES,
  SIGNAL_STATUSES,
  SIGNAL_TYPES,
  SOURCE_TYPES,
  STAFF_MODELS,
  VERIFICATION_STATUSES,
} from '@/types/partner';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const optionalDate = isoDate.nullable().optional();
const optionalText = z.string().max(4000).nullable().optional();
const shortText = z.string().max(300).nullable().optional();
const uuid = z.string().uuid();

export const companySchema = z.object({
  legalName: z.string().max(300),
  tradeName: shortText,
  relationshipDirection: z.enum(RELATIONSHIP_DIRECTIONS),
  partnerLevel: z.enum(PARTNER_LEVELS),
  status: z.enum(PARTNER_STATUSES),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  country: z.string().max(10).nullable().optional(),
  region: shortText,
  city: shortText,
  postalCode: z.string().max(20).nullable().optional(),
  address: shortText,
  website: z.string().max(400).nullable().optional(),
  email: z.string().max(300).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  registryName: shortText,
  registryNumber: z.string().max(60).nullable().optional(),
  vatId: z.string().max(30).nullable().optional(),
  lei: z.string().max(30).nullable().optional(),
  staffModel: z.enum(STAFF_MODELS),
  furtherSubcontractingStatus: z.enum(FURTHER_SUBCONTRACTING_STATUSES),
  datacenterExperienceStatus: z.enum(DATACENTER_EXPERIENCE_STATUSES),
  isPreferred: z.boolean(),
  isBlocked: z.boolean(),
  blockedReason: z.string().max(600).nullable().optional(),
  internalRating: z.number().int().min(1).max(5).nullable().optional(),
  sourceType: z.enum(SOURCE_TYPES).nullable().optional(),
  sourceName: shortText,
  sourceUrl: z.string().max(400).nullable().optional(),
  lastContactAt: optionalDate,
  nextFollowUpAt: optionalDate,
  internalNotes: optionalText,
  linkedBusinessClientId: uuid.nullable().optional(),
  /** Must be true once a duplicate warning was shown. */
  acknowledgeDuplicateWarning: z.boolean().optional(),
});

export const contactSchema = z.object({
  id: uuid.optional(),
  partnerCompanyId: uuid,
  firstName: shortText,
  lastName: z.string().min(1).max(200),
  role: shortText,
  businessEmail: z.string().max(300).nullable().optional(),
  businessPhone: z.string().max(60).nullable().optional(),
  preferredChannel: z.enum(CONTACT_CHANNELS),
  sourceType: z.enum(SOURCE_TYPES).nullable().optional(),
  internalNote: optionalText,
  isActive: z.boolean(),
});

export const serviceSchema = z.object({
  partnerCompanyId: uuid,
  serviceCategory: z.enum(PARTNER_SERVICE_CATEGORIES),
  serviceLabel: shortText,
  confirmation: z.enum(PARTNER_SERVICE_CONFIRMATIONS),
  confirmationSource: z.enum(PARTNER_SERVICE_SOURCES),
  capacityNote: shortText,
  availableStaff: z.number().int().min(0).max(100000).nullable().optional(),
  deliveryMode: z.enum(SERVICE_DELIVERY_MODES),
  note: optionalText,
});

export const regionSchema = z.object({
  id: uuid.optional(),
  partnerCompanyId: uuid,
  country: z.string().max(10).nullable().optional(),
  region: shortText,
  city: shortText,
  radiusKm: z.number().int().min(0).max(5000).nullable().optional(),
  nationwide: z.boolean(),
  willingToTravel: z.boolean(),
  isConfirmed: z.boolean(),
  note: optionalText,
});

export const availabilitySchema = z.object({
  id: uuid.optional(),
  partnerCompanyId: uuid,
  serviceCategory: z.enum(PARTNER_SERVICE_CATEGORIES).nullable().optional(),
  availableFrom: optionalDate,
  availableUntil: optionalDate,
  status: z.enum(AVAILABILITY_STATUSES),
  availableStaff: z.number().int().min(0).max(100000).nullable().optional(),
  shiftModel: z.enum(SHIFT_MODELS),
  nightShift: z.boolean(),
  weekend: z.boolean(),
  aroundTheClock: z.boolean(),
  shortNotice: z.boolean(),
  note: optionalText,
  /** The user states they just confirmed the figure with the partner. */
  confirmNow: z.boolean(),
});

export const qualificationSchema = z.object({
  id: uuid.optional(),
  partnerCompanyId: uuid,
  credentialType: z.enum(CREDENTIAL_TYPES),
  title: shortText,
  issuer: shortText,
  documentNumber: z.string().max(120).nullable().optional(),
  validFrom: optionalDate,
  validUntil: optionalDate,
  reviewStatus: z.enum(CREDENTIAL_REVIEW_STATUSES),
  note: optionalText,
});

export const documentSchema = z.object({
  partnerCompanyId: uuid,
  partnerQualificationId: uuid.nullable().optional(),
  credentialType: z.enum(CREDENTIAL_TYPES),
  fileName: z.string().min(1).max(300),
  mimeType: z.string().max(120).nullable().optional(),
  fileSize: z.number().int().min(0).nullable().optional(),
  validFrom: optionalDate,
  validUntil: optionalDate,
  note: optionalText,
});

export const documentReviewSchema = z.object({
  reviewStatus: z.enum(CREDENTIAL_REVIEW_STATUSES),
  note: optionalText,
});

export const rateSchema = z.object({
  id: uuid.optional(),
  partnerCompanyId: uuid,
  serviceCategory: z.enum(PARTNER_SERVICE_CATEGORIES).nullable().optional(),
  region: shortText,
  rateModel: z.enum(RATE_MODELS),
  unit: shortText,
  netAmount: z.number().min(0).max(10_000_000).nullable().optional(),
  currency: z.string().length(3),
  validFrom: optionalDate,
  validUntil: optionalDate,
  surcharges: optionalText,
  negotiationStatus: z.enum(NEGOTIATION_STATUSES),
  internalNote: optionalText,
});

export const activitySchema = z.object({
  partnerCompanyId: uuid,
  partnerContactId: uuid.nullable().optional(),
  activityType: z.enum(ACTIVITY_TYPES),
  occurredAt: z.string().min(4).max(40),
  summary: optionalText,
  outcome: optionalText,
  nextAction: optionalText,
  followUpAt: optionalDate,
});

export const signalSchema = z.object({
  id: uuid.optional(),
  partnerCompanyId: uuid.nullable().optional(),
  companyNameRaw: shortText,
  signalType: z.enum(SIGNAL_TYPES),
  serviceCategory: z.enum(PARTNER_SERVICE_CATEGORIES).nullable().optional(),
  projectName: shortText,
  country: z.string().max(10).nullable().optional(),
  region: shortText,
  city: shortText,
  description: optionalText,
  sourceType: z.enum(SOURCE_TYPES),
  sourceName: shortText,
  sourceUrl: z.string().max(400).nullable().optional(),
  observedAt: isoDate,
  validUntil: optionalDate,
  confidence: z.enum(SIGNAL_CONFIDENCES),
  status: z.enum(SIGNAL_STATUSES),
  nextAction: optionalText,
  followUpAt: optionalDate,
  internalNote: optionalText,
});

export const needSchema = z.object({
  id: uuid.optional(),
  title: z.string().min(1).max(300),
  referenceProjectId: uuid.nullable().optional(),
  tenderId: uuid.nullable().optional(),
  projectType: shortText,
  serviceCategory: z.enum(PARTNER_SERVICE_CATEGORIES),
  country: z.string().max(10).nullable().optional(),
  region: shortText,
  city: shortText,
  siteAddress: shortText,
  radiusKm: z.number().int().min(0).max(5000).nullable().optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  requiredStaff: z.number().int().min(0).max(100000).nullable().optional(),
  shiftModel: z.enum(SHIFT_MODELS),
  aroundTheClock: z.boolean(),
  nightWork: z.boolean(),
  weekendWork: z.boolean(),
  requiredQualifications: z.array(z.string().max(200)).max(30),
  requiredCredentials: z.array(z.enum(CREDENTIAL_TYPES)).max(20),
  furtherSubcontractingAllowed: z.enum(FURTHER_SUBCONTRACTING_STATUSES),
  targetBudget: z.number().min(0).max(1_000_000_000).nullable().optional(),
  currency: z.string().length(3),
  confidentiality: z.enum(['internal', 'confidential']),
  status: z.enum(NEED_STATUSES),
  internalNote: optionalText,
});

export const matchStatusSchema = z.object({
  status: z.enum(MATCH_STATUSES),
});

export const assignmentSchema = z.object({
  id: uuid.optional(),
  partnerCompanyId: uuid,
  referenceProjectId: uuid.nullable().optional(),
  needId: uuid.nullable().optional(),
  role: z.enum(ASSIGNMENT_ROLES),
  parentAssignmentId: uuid.nullable().optional(),
  contractPartnerCompanyId: uuid.nullable().optional(),
  scope: optionalText,
  staffCount: z.number().int().min(0).max(100000).nullable().optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  furtherSubcontractingAllowed: z.enum(FURTHER_SUBCONTRACTING_STATUSES),
  status: z.enum(ASSIGNMENT_STATUSES),
  internalRating: z.number().int().min(1).max(5).nullable().optional(),
  note: optionalText,
});
