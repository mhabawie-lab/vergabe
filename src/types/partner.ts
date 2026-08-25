/**
 * Domain types for the Subunternehmer-Radar.
 *
 * Naming: the tables are called `partner_companies` rather than
 * `subcontractors` because the domain is wider than the word. A record here
 * can be a company that may work *for* us, a company that may *hire* us, or
 * both — calling all of them subcontractors would build the wrong assumption
 * into every query. The user interface keeps the name the business uses,
 * "Subunternehmer-Radar" (documented in `PROJECT_PLAN.md` § 15.1).
 *
 * Everything in this file is tenant-private. Unlike tender data, which every
 * authenticated user may read, these records belong to exactly one
 * organisation (`docs/data-protection.md`).
 */

// ---------------------------------------------------------------------------
// Relationship direction and chain level
// ---------------------------------------------------------------------------

/**
 * Which way the possible business relationship runs.
 *
 * Kept apart from everything else because confusing the two directions is the
 * expensive mistake: calling a potential client a subcontractor produces an
 * offer nobody asked for.
 */
export const RELATIONSHIP_DIRECTIONS = [
  'can_work_for_us',
  'may_hire_us',
  'both',
  'unknown',
] as const;

export type RelationshipDirection = (typeof RELATIONSHIP_DIRECTIONS)[number];

export const RELATIONSHIP_DIRECTION_LABELS: Record<RelationshipDirection, string> = {
  can_work_for_us: 'Kann für uns arbeiten',
  may_hire_us: 'Sucht Subunternehmer',
  both: 'Beide Richtungen',
  unknown: 'Unbekannt',
};

export const RELATIONSHIP_DIRECTION_DESCRIPTIONS: Record<
  RelationshipDirection,
  string
> = {
  can_work_for_us:
    'Das Unternehmen kommt als Sub- oder Nachunternehmer für uns in Frage.',
  may_hire_us:
    'Das Unternehmen vergibt selbst Leistungen und kommt als Auftraggeber oder Kooperationspartner in Frage.',
  both: 'Beides — das Unternehmen kann für uns arbeiten und vergibt selbst.',
  unknown: 'Die Richtung ist noch nicht bestimmt.',
};

/** Where a company can sit in a subcontracting chain. */
export const PARTNER_LEVELS = [
  'main_contractor',
  'subcontractor',
  'sub_subcontractor',
  'further_subcontractor',
  'unknown',
] as const;

export type PartnerLevel = (typeof PARTNER_LEVELS)[number];

export const PARTNER_LEVEL_LABELS: Record<PartnerLevel, string> = {
  main_contractor: 'Hauptunternehmer',
  subcontractor: 'Nachunternehmer',
  sub_subcontractor: 'Subunternehmer',
  further_subcontractor: 'Weiterer Subunternehmer',
  unknown: 'Unbekannt',
};

// ---------------------------------------------------------------------------
// Status, verification, staffing
// ---------------------------------------------------------------------------

export const PARTNER_STATUSES = [
  'prospect',
  'contacted',
  'in_review',
  'qualified',
  'preferred',
  'blocked',
  'inactive',
  'archived',
] as const;

export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  prospect: 'Interessent',
  contacted: 'Kontaktiert',
  in_review: 'In Prüfung',
  qualified: 'Qualifiziert',
  preferred: 'Bevorzugt',
  blocked: 'Gesperrt',
  inactive: 'Inaktiv',
  archived: 'Archiviert',
};

/**
 * How well the company's own statements are backed by documents.
 *
 * `self_declared` is deliberately its own state: a company saying it holds a
 * licence is not the same as somebody having seen the licence.
 */
export const VERIFICATION_STATUSES = [
  'unverified',
  'self_declared',
  'documents_reviewed',
  'verified',
  'expired',
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  unverified: 'Ungeprüft',
  self_declared: 'Selbst angegeben',
  documents_reviewed: 'Unterlagen geprüft',
  verified: 'Verifiziert',
  expired: 'Abgelaufen',
};

export const VERIFICATION_STATUS_DESCRIPTIONS: Record<VerificationStatus, string> = {
  unverified: 'Es liegen keine Angaben zur Prüfung vor.',
  self_declared:
    'Angaben stammen vom Unternehmen selbst und sind nicht belegt.',
  documents_reviewed:
    'Unterlagen wurden gesichtet, die Prüfung ist aber nicht abgeschlossen.',
  verified: 'Unterlagen liegen vor und wurden als gültig bestätigt.',
  expired: 'Die Prüfung ist durch abgelaufene Nachweise hinfällig geworden.',
};

/** Who actually performs the work at the partner. */
export const STAFF_MODELS = [
  'own_staff',
  'mixed',
  'further_subcontractors',
  'unknown',
] as const;

export type StaffModel = (typeof STAFF_MODELS)[number];

export const STAFF_MODEL_LABELS: Record<StaffModel, string> = {
  own_staff: 'Eigene Mitarbeiter',
  mixed: 'Gemischt',
  further_subcontractors: 'Weitere Subunternehmer',
  unknown: 'Unbekannt',
};

/** Whether the partner may pass work on again. */
export const FURTHER_SUBCONTRACTING_STATUSES = [
  'allowed',
  'not_allowed',
  'unknown',
] as const;

export type FurtherSubcontractingStatus =
  (typeof FURTHER_SUBCONTRACTING_STATUSES)[number];

export const FURTHER_SUBCONTRACTING_LABELS: Record<
  FurtherSubcontractingStatus,
  string
> = {
  allowed: 'Erlaubt',
  not_allowed: 'Nicht erlaubt',
  unknown: 'Unbekannt',
};

/**
 * Experience in data centres, tracked separately because it is the decisive
 * criterion in this market segment and is asked for in almost every tender.
 */
export const DATACENTER_EXPERIENCE_STATUSES = [
  'confirmed',
  'claimed',
  'none',
  'unknown',
] as const;

export type DatacenterExperienceStatus =
  (typeof DATACENTER_EXPERIENCE_STATUSES)[number];

export const DATACENTER_EXPERIENCE_LABELS: Record<
  DatacenterExperienceStatus,
  string
> = {
  confirmed: 'Belegt',
  claimed: 'Selbst angegeben',
  none: 'Keine',
  unknown: 'Unbekannt',
};

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

/**
 * What a partner can deliver.
 *
 * Finer-grained than `ReferenceServiceCategory`, which describes what *we*
 * did: for a partner it matters whether "security" means guarding a building
 * site or manning a data centre, because the qualification requirements
 * differ. `PARTNER_TO_REFERENCE_SERVICE` below maps the two taxonomies so a
 * later match against our own references does not need a second source of
 * truth.
 */
export const PARTNER_SERVICE_CATEGORIES = [
  'security',
  'construction_site_security',
  'property_protection',
  'reception',
  'datacenter_security',
  'paramedic',
  'cleaning',
  'construction_support',
  'warehouse_logistics',
  'facility_management',
  'fire_watch',
  'other',
  'unknown',
] as const;

export type PartnerServiceCategory = (typeof PARTNER_SERVICE_CATEGORIES)[number];

export const PARTNER_SERVICE_CATEGORY_LABELS: Record<
  PartnerServiceCategory,
  string
> = {
  security: 'Sicherheitsdienst',
  construction_site_security: 'Baustellenbewachung',
  property_protection: 'Objektschutz',
  reception: 'Empfang / Pforte',
  datacenter_security: 'Rechenzentrum / Datacenter-Security',
  paramedic: 'Sanitätsdienst / Paramedic',
  cleaning: 'Reinigung',
  construction_support: 'Bauunterstützung / Bauhelfer',
  warehouse_logistics: 'Lager / Logistik',
  facility_management: 'Facility Management',
  fire_watch: 'Brandwache',
  other: 'Sonstige',
  unknown: 'Unbekannt',
};

/** Categories that count as data-centre work when scoring that criterion. */
export const DATACENTER_SERVICE_CATEGORIES: readonly PartnerServiceCategory[] = [
  'datacenter_security',
];

/**
 * How a partner service reached its current state.
 *
 * The same five-state model as the reference services in phase 2, and for the
 * same reason: an untouched proposal and a rejected one are both "not
 * confirmed" but mean opposite things.
 */
export const PARTNER_SERVICE_CONFIRMATIONS = [
  'proposed',
  'confirmed',
  'self_declared',
  'rejected',
  'unknown',
] as const;

export type PartnerServiceConfirmation =
  (typeof PARTNER_SERVICE_CONFIRMATIONS)[number];

export const PARTNER_SERVICE_CONFIRMATION_LABELS: Record<
  PartnerServiceConfirmation,
  string
> = {
  proposed: 'Vorschlag',
  confirmed: 'Bestätigt',
  self_declared: 'Selbst angegeben',
  rejected: 'Verworfen',
  unknown: 'Unbekannt',
};

/** Where the statement about a service came from. */
export const PARTNER_SERVICE_SOURCES = [
  'manual',
  'import_column',
  'partner_statement',
  'document',
  'name_rule',
] as const;

export type PartnerServiceSource = (typeof PARTNER_SERVICE_SOURCES)[number];

export const PARTNER_SERVICE_SOURCE_LABELS: Record<PartnerServiceSource, string> = {
  manual: 'Manuell erfasst',
  import_column: 'Aus Importspalte',
  partner_statement: 'Angabe des Unternehmens',
  document: 'Aus einem Nachweis',
  name_rule: 'Regel auf dem Firmennamen',
};

/** Whether the partner performs the service itself or passes it on. */
export const SERVICE_DELIVERY_MODES = ['own', 'subcontracted', 'unknown'] as const;
export type ServiceDeliveryMode = (typeof SERVICE_DELIVERY_MODES)[number];

export const SERVICE_DELIVERY_MODE_LABELS: Record<ServiceDeliveryMode, string> = {
  own: 'Eigene Leistung',
  subcontracted: 'Wird weitervergeben',
  unknown: 'Unbekannt',
};

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export const AVAILABILITY_STATUSES = [
  'available',
  'partially_available',
  'booked',
  'unknown',
] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const AVAILABILITY_STATUS_LABELS: Record<AvailabilityStatus, string> = {
  available: 'Verfügbar',
  partially_available: 'Teilweise verfügbar',
  booked: 'Ausgelastet',
  unknown: 'Unbekannt',
};

// ---------------------------------------------------------------------------
// Credentials and documents
// ---------------------------------------------------------------------------

export const CREDENTIAL_TYPES = [
  'trade_registration',
  'commercial_register',
  'guard_permit',
  'liability_insurance',
  'tax_clearance',
  'certificate',
  'qualification',
  'reference_proof',
  'nda',
  'other',
] as const;

export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  trade_registration: 'Gewerbeanmeldung',
  commercial_register: 'Handelsregisterauszug',
  guard_permit: 'Bewachungserlaubnis (§ 34a GewO)',
  liability_insurance: 'Haftpflichtversicherung',
  tax_clearance: 'Unbedenklichkeitsbescheinigung',
  certificate: 'Zertifikat',
  qualification: 'Qualifikationsnachweis',
  reference_proof: 'Referenznachweis',
  nda: 'Vertraulichkeitsvereinbarung',
  other: 'Sonstiges Dokument',
};

/**
 * Credentials without which we do not put a partner in front of a client.
 *
 * Kept in one place so the gap list on the company page and the match engine
 * cannot drift apart.
 */
export const REQUIRED_CREDENTIAL_TYPES: readonly CredentialType[] = [
  'trade_registration',
  'guard_permit',
  'liability_insurance',
];

export const CREDENTIAL_REVIEW_STATUSES = [
  'pending',
  'reviewed',
  'accepted',
  'rejected',
] as const;

export type CredentialReviewStatus = (typeof CREDENTIAL_REVIEW_STATUSES)[number];

export const CREDENTIAL_REVIEW_STATUS_LABELS: Record<
  CredentialReviewStatus,
  string
> = {
  pending: 'Ungeprüft',
  reviewed: 'Gesichtet',
  accepted: 'Anerkannt',
  rejected: 'Abgelehnt',
};

/**
 * Whether the stored file has been checked for malware.
 *
 * `not_scanned` is the honest default. No scanner is wired up in this phase,
 * and claiming otherwise would be worse than saying nothing.
 */
export const DOCUMENT_SCAN_STATUSES = ['not_scanned', 'clean', 'infected'] as const;
export type DocumentScanStatus = (typeof DOCUMENT_SCAN_STATUSES)[number];

export const DOCUMENT_SCAN_STATUS_LABELS: Record<DocumentScanStatus, string> = {
  not_scanned: 'Nicht auf Schadsoftware geprüft',
  clean: 'Geprüft, unauffällig',
  infected: 'Als schädlich erkannt',
};

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

export const RATE_MODELS = [
  'hourly',
  'daily',
  'monthly',
  'per_shift',
  'per_object',
  'flat',
  'other',
] as const;

export type RateModel = (typeof RATE_MODELS)[number];

export const RATE_MODEL_LABELS: Record<RateModel, string> = {
  hourly: 'Stundensatz',
  daily: 'Tagessatz',
  monthly: 'Monatspauschale',
  per_shift: 'Je Schicht',
  per_object: 'Je Objekt',
  flat: 'Pauschale',
  other: 'Sonstiges Modell',
};

export const NEGOTIATION_STATUSES = [
  'indicative',
  'quoted',
  'negotiated',
  'agreed',
  'expired',
] as const;

export type NegotiationStatus = (typeof NEGOTIATION_STATUSES)[number];

export const NEGOTIATION_STATUS_LABELS: Record<NegotiationStatus, string> = {
  indicative: 'Richtwert',
  quoted: 'Angebot erhalten',
  negotiated: 'Verhandelt',
  agreed: 'Vereinbart',
  expired: 'Abgelaufen',
};

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const ACTIVITY_TYPES = [
  'call',
  'email',
  'meeting',
  'quote_requested',
  'documents_requested',
  'documents_received',
  'review',
  'internal_note',
  'follow_up',
  'status_change',
  'other',
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call: 'Telefonat',
  email: 'E-Mail',
  meeting: 'Besprechung',
  quote_requested: 'Angebot angefragt',
  documents_requested: 'Unterlagen angefordert',
  documents_received: 'Unterlagen erhalten',
  review: 'Prüfung',
  internal_note: 'Interne Notiz',
  follow_up: 'Wiedervorlage',
  status_change: 'Statusänderung',
  other: 'Sonstige Aktivität',
};

export const CONTACT_CHANNELS = ['email', 'phone', 'mobile', 'unknown'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  email: 'E-Mail',
  phone: 'Telefon',
  mobile: 'Mobil',
  unknown: 'Unbekannt',
};

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * An observation about a company — never a fact by itself.
 *
 * A signal always carries where it came from and how confident we are. The
 * screens say "Hinweis", not "Fakt", and a signal never changes the company's
 * relationship direction on its own.
 */
export const SIGNAL_TYPES = [
  'seeks_subcontractor',
  'seeks_further_subcontractor',
  'seeks_security',
  'seeks_construction_support',
  'seeks_cleaning',
  'new_project',
  'new_datacenter',
  'new_location',
  'growing_staff_demand',
  'available_capacity',
  'leadership_change',
  'credential_expiring',
  'other',
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  seeks_subcontractor: 'Sucht Subunternehmer',
  seeks_further_subcontractor: 'Sucht Nachunternehmer',
  seeks_security: 'Sucht Sicherheitsdienst',
  seeks_construction_support: 'Sucht Bauhelfer',
  seeks_cleaning: 'Sucht Reinigung',
  new_project: 'Neues Projekt',
  new_datacenter: 'Neues Rechenzentrum',
  new_location: 'Neuer Standort',
  growing_staff_demand: 'Steigender Personalbedarf',
  available_capacity: 'Verfügbare Kapazität',
  leadership_change: 'Führungswechsel',
  credential_expiring: 'Nachweis läuft ab',
  other: 'Sonstiges Signal',
};

/** Signal types that mean "this company is looking for a subcontractor". */
export const DEMAND_SIGNAL_TYPES: readonly SignalType[] = [
  'seeks_subcontractor',
  'seeks_further_subcontractor',
  'seeks_security',
  'seeks_construction_support',
  'seeks_cleaning',
];

export const SIGNAL_STATUSES = [
  'new',
  'reviewed',
  'relevant',
  'contacted',
  'done',
  'discarded',
  'expired',
] as const;

export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export const SIGNAL_STATUS_LABELS: Record<SignalStatus, string> = {
  new: 'Neu',
  reviewed: 'Geprüft',
  relevant: 'Relevant',
  contacted: 'Kontaktiert',
  done: 'Erledigt',
  discarded: 'Verworfen',
  expired: 'Abgelaufen',
};

/** How sure we are that the observation is true. */
export const SIGNAL_CONFIDENCES = ['low', 'medium', 'high'] as const;
export type SignalConfidence = (typeof SIGNAL_CONFIDENCES)[number];

export const SIGNAL_CONFIDENCE_LABELS: Record<SignalConfidence, string> = {
  low: 'Gering — unbestätigter Hinweis',
  medium: 'Mittel — plausibel, nicht belegt',
  high: 'Hoch — durch die Quelle belegt',
};

/** Where an observation came from. Required: a signal without one is a rumour. */
export const SOURCE_TYPES = [
  'phone_call',
  'email',
  'meeting',
  'website',
  'press',
  'job_posting',
  'tender_portal',
  'trade_fair',
  'referral',
  'other',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  phone_call: 'Telefonat',
  email: 'E-Mail',
  meeting: 'Persönliches Gespräch',
  website: 'Website des Unternehmens',
  press: 'Presse / Fachmedien',
  job_posting: 'Stellenanzeige',
  tender_portal: 'Vergabeportal',
  trade_fair: 'Messe / Veranstaltung',
  referral: 'Empfehlung',
  other: 'Sonstige Quelle',
};

// ---------------------------------------------------------------------------
// Own demand and matches
// ---------------------------------------------------------------------------

export const NEED_STATUSES = [
  'draft',
  'active',
  'in_review',
  'filled',
  'paused',
  'cancelled',
  'archived',
] as const;

export type NeedStatus = (typeof NEED_STATUSES)[number];

export const NEED_STATUS_LABELS: Record<NeedStatus, string> = {
  draft: 'Entwurf',
  active: 'Aktiv',
  in_review: 'In Prüfung',
  filled: 'Besetzt',
  paused: 'Pausiert',
  cancelled: 'Storniert',
  archived: 'Archiviert',
};

export const MATCH_STATUSES = [
  'proposed',
  'reviewed',
  'shortlisted',
  'contacted',
  'rejected',
  'selected',
  'assigned',
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  proposed: 'Vorgeschlagen',
  reviewed: 'Geprüft',
  shortlisted: 'Shortlist',
  contacted: 'Kontaktiert',
  rejected: 'Abgelehnt',
  selected: 'Ausgewählt',
  assigned: 'Zugeordnet',
};

export const SHIFT_MODELS = [
  'day',
  'night',
  'two_shift',
  'three_shift',
  'around_the_clock',
  'on_call',
  'unknown',
] as const;

export type ShiftModel = (typeof SHIFT_MODELS)[number];

export const SHIFT_MODEL_LABELS: Record<ShiftModel, string> = {
  day: 'Tagdienst',
  night: 'Nachtdienst',
  two_shift: 'Zweischicht',
  three_shift: 'Dreischicht',
  around_the_clock: 'Rund um die Uhr',
  on_call: 'Rufbereitschaft',
  unknown: 'Unbekannt',
};

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export const ASSIGNMENT_ROLES = [
  'main_contractor',
  'subcontractor',
  'sub_subcontractor',
  'supplier',
  'other',
] as const;

export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];

export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  main_contractor: 'Hauptunternehmer',
  subcontractor: 'Nachunternehmer',
  sub_subcontractor: 'Subunternehmer',
  supplier: 'Lieferant',
  other: 'Sonstige Rolle',
};

export const ASSIGNMENT_STATUSES = [
  'planned',
  'active',
  'completed',
  'terminated',
  'cancelled',
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  planned: 'Geplant',
  active: 'Laufend',
  completed: 'Abgeschlossen',
  terminated: 'Vorzeitig beendet',
  cancelled: 'Storniert',
};

/**
 * How deep a chain may go.
 *
 * Not a database constraint but a rule the application enforces: a chain
 * deeper than this is almost always a data error, and an unbounded recursive
 * walk over user-supplied parent links is a denial-of-service waiting to
 * happen.
 */
export const MAX_CHAIN_DEPTH = 6;

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface PartnerCompany {
  id: string;
  organizationId: string;
  legalName: string;
  /** Comparison form; also what the unique constraint uses. */
  normalizedName: string;
  tradeName: string | null;
  relationshipDirection: RelationshipDirection;
  partnerLevel: PartnerLevel;
  status: PartnerStatus;
  verificationStatus: VerificationStatus;
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
  staffModel: StaffModel;
  furtherSubcontractingStatus: FurtherSubcontractingStatus;
  datacenterExperienceStatus: DatacenterExperienceStatus;
  isPreferred: boolean;
  isBlocked: boolean;
  blockedReason: string | null;
  /** Subjective internal rating 1–5. Never presented as an objective figure. */
  internalRating: number | null;
  sourceType: SourceType | null;
  sourceName: string | null;
  sourceUrl: string | null;
  firstObservedAt: string | null;
  lastVerifiedAt: string | null;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  internalNotes: string | null;
  /** Optional link to a customer record — reference only, never a merge. */
  linkedBusinessClientId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface PartnerContact {
  id: string;
  partnerCompanyId: string;
  organizationId: string;
  firstName: string | null;
  lastName: string;
  role: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  preferredChannel: ContactChannel;
  sourceType: SourceType | null;
  lastVerifiedAt: string | null;
  internalNote: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerService {
  id: string;
  partnerCompanyId: string;
  organizationId: string;
  serviceCategory: PartnerServiceCategory;
  serviceLabel: string | null;
  confirmation: PartnerServiceConfirmation;
  confirmationSource: PartnerServiceSource;
  /** Free-text capacity statement, e.g. "bis 20 Objekte". */
  capacityNote: string | null;
  availableStaff: number | null;
  deliveryMode: ServiceDeliveryMode;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerServiceRegion {
  id: string;
  partnerCompanyId: string;
  organizationId: string;
  country: string | null;
  region: string | null;
  city: string | null;
  radiusKm: number | null;
  nationwide: boolean;
  willingToTravel: boolean;
  isConfirmed: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerAvailability {
  id: string;
  partnerCompanyId: string;
  organizationId: string;
  serviceCategory: PartnerServiceCategory | null;
  availableFrom: string | null;
  availableUntil: string | null;
  status: AvailabilityStatus;
  availableStaff: number | null;
  shiftModel: ShiftModel;
  nightShift: boolean;
  weekend: boolean;
  aroundTheClock: boolean;
  shortNotice: boolean;
  note: string | null;
  lastConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerQualification {
  id: string;
  partnerCompanyId: string;
  organizationId: string;
  credentialType: CredentialType;
  title: string | null;
  issuer: string | null;
  documentNumber: string | null;
  validFrom: string | null;
  validUntil: string | null;
  reviewStatus: CredentialReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerDocument {
  id: string;
  partnerCompanyId: string;
  organizationId: string;
  partnerQualificationId: string | null;
  credentialType: CredentialType;
  /** Path inside a private bucket. Never a public URL. */
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  checksum: string | null;
  confidentiality: 'internal' | 'confidential';
  scanStatus: DocumentScanStatus;
  validFrom: string | null;
  validUntil: string | null;
  reviewStatus: CredentialReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  note: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerRate {
  id: string;
  partnerCompanyId: string;
  organizationId: string;
  serviceCategory: PartnerServiceCategory | null;
  region: string | null;
  rateModel: RateModel;
  unit: string | null;
  netAmount: number | null;
  currency: string;
  validFrom: string | null;
  validUntil: string | null;
  surcharges: string | null;
  negotiationStatus: NegotiationStatus;
  internalNote: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerActivity {
  id: string;
  partnerCompanyId: string;
  organizationId: string;
  partnerContactId: string | null;
  activityType: ActivityType;
  occurredAt: string;
  summary: string | null;
  outcome: string | null;
  nextAction: string | null;
  followUpAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerSignal {
  id: string;
  organizationId: string;
  partnerCompanyId: string | null;
  /** Kept for a signal observed before the company exists as a record. */
  companyNameRaw: string | null;
  signalType: SignalType;
  serviceCategory: PartnerServiceCategory | null;
  projectName: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  description: string | null;
  sourceType: SourceType;
  sourceName: string | null;
  sourceUrl: string | null;
  observedAt: string;
  validUntil: string | null;
  confidence: SignalConfidence;
  status: SignalStatus;
  assignedTo: string | null;
  nextAction: string | null;
  followUpAt: string | null;
  internalNote: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubcontractorNeed {
  id: string;
  organizationId: string;
  title: string;
  referenceProjectId: string | null;
  tenderId: string | null;
  projectType: string | null;
  serviceCategory: PartnerServiceCategory;
  country: string | null;
  region: string | null;
  city: string | null;
  siteAddress: string | null;
  radiusKm: number | null;
  startDate: string | null;
  endDate: string | null;
  requiredStaff: number | null;
  shiftModel: ShiftModel;
  aroundTheClock: boolean;
  nightWork: boolean;
  weekendWork: boolean;
  requiredQualifications: string[];
  requiredCredentials: CredentialType[];
  furtherSubcontractingAllowed: FurtherSubcontractingStatus;
  targetBudget: number | null;
  currency: string;
  confidentiality: 'internal' | 'confidential';
  status: NeedStatus;
  internalNote: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One weighted component of a match score. */
export interface MatchComponent {
  key: MatchComponentKey;
  label: string;
  /** 0–1 before weighting. */
  ratio: number;
  weight: number;
  /** ratio × weight, rounded to one decimal. */
  points: number;
  /** Plain-language reason, shown to the user. */
  reason: string;
  /** True when the input was missing rather than negative. */
  missingData: boolean;
}

export const MATCH_COMPONENT_KEYS = [
  'service',
  'region',
  'availability',
  'capacity',
  'credentials',
  'datacenter',
] as const;

export type MatchComponentKey = (typeof MATCH_COMPONENT_KEYS)[number];

export interface SubcontractorMatch {
  id: string;
  organizationId: string;
  needId: string;
  partnerCompanyId: string;
  totalScore: number;
  scoreVersion: string;
  serviceScore: number;
  regionScore: number;
  availabilityScore: number;
  capacityScore: number;
  credentialScore: number;
  datacenterScore: number;
  exclusionReason: string | null;
  missingInformation: string[];
  reasoning: MatchComponent[];
  status: MatchStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubcontractorAssignment {
  id: string;
  organizationId: string;
  partnerCompanyId: string;
  referenceProjectId: string | null;
  needId: string | null;
  role: AssignmentRole;
  parentAssignmentId: string | null;
  chainLevel: number;
  /** Who the partner is contractually engaged by. Null = our organisation. */
  contractPartnerCompanyId: string | null;
  scope: string | null;
  staffCount: number | null;
  startDate: string | null;
  endDate: string | null;
  furtherSubcontractingAllowed: FurtherSubcontractingStatus;
  status: AssignmentStatus;
  /** Subjective rating after the engagement, 1–5. */
  internalRating: number | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// List projections
// ---------------------------------------------------------------------------

export interface PartnerCompanyListItem {
  id: string;
  legalName: string;
  tradeName: string | null;
  relationshipDirection: RelationshipDirection;
  partnerLevel: PartnerLevel;
  status: PartnerStatus;
  verificationStatus: VerificationStatus;
  country: string | null;
  region: string | null;
  city: string | null;
  isPreferred: boolean;
  isBlocked: boolean;
  datacenterExperienceStatus: DatacenterExperienceStatus;
  /** Confirmed categories only — a self-declared service is not evidence. */
  confirmedServices: PartnerServiceCategory[];
  declaredServices: PartnerServiceCategory[];
  regions: string[];
  availableStaff: number | null;
  credentialSummary: CredentialSummary;
  /** True when a demand signal is currently open. */
  hasOpenDemandSignal: boolean;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
}

export interface CredentialSummary {
  valid: number;
  expiringSoon: number;
  expired: number;
  pendingReview: number;
  missingRequired: CredentialType[];
}

export interface PartnerSignalListItem extends PartnerSignal {
  companyName: string | null;
  assignedToName: string | null;
}

export interface SubcontractorNeedListItem extends SubcontractorNeed {
  matchCount: number;
  shortlistedCount: number;
}

export interface SubcontractorMatchListItem extends SubcontractorMatch {
  companyName: string;
  companyStatus: PartnerStatus;
  companyIsBlocked: boolean;
}

export interface AssignmentTreeNode {
  assignment: SubcontractorAssignment;
  companyName: string;
  companyIsBlocked: boolean;
  children: AssignmentTreeNode[];
}
