/**
 * Validation for partner companies, contacts and signals.
 *
 * Reuses the phase-2 comparison forms (`modules/references/normalize`) and the
 * website normaliser (`modules/references/client-validation`) rather than
 * growing a second set: two implementations of "is this the same company"
 * would drift apart, and the answer has to be the same wherever it is asked.
 */

import { normalizeWebsite, normalizeWhitespace } from '@/modules/references/client-validation';
import { looksLikeSameValue, normalizeClientName } from '@/modules/references/normalize';
import type { ValidationMessage } from '@/types/reference';
import {
  type FurtherSubcontractingStatus,
  type PartnerLevel,
  type PartnerStatus,
  type RelationshipDirection,
  type SourceType,
  type StaffModel,
  type VerificationStatus,
  type DatacenterExperienceStatus,
} from '@/types/partner';

export const PARTNER_NAME_MAX_LENGTH = 200;
export const PARTNER_NOTES_MAX_LENGTH = 4000;
export const PARTNER_WEBSITE_MAX_LENGTH = 300;
export const PARTNER_BLOCK_REASON_MAX_LENGTH = 500;

export interface PartnerFormInput {
  legalName: string;
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
  internalRating: number | null;
  sourceType: SourceType | null;
  sourceName: string | null;
  sourceUrl: string | null;
  internalNotes: string | null;
}

export interface NormalizedPartnerInput extends PartnerFormInput {
  normalizedName: string;
}

export interface PartnerValidationResult {
  normalized: NormalizedPartnerInput;
  messages: ValidationMessage[];
  valid: boolean;
}

/** An existing company, for the duplicate comparison. */
export interface ExistingPartner {
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

function error(
  code: string,
  field: string,
  message: string,
  suggestion: string | null = null,
): ValidationMessage {
  return { severity: 'error', code, field, message, suggestion };
}

function warning(
  code: string,
  field: string,
  message: string,
  suggestion: string | null = null,
): ValidationMessage {
  return { severity: 'warning', code, field, message, suggestion };
}

/**
 * Digits only, so "+49 (0)30 1234" and "0049 30 1234" compare equal.
 *
 * The parenthesised trunk prefix is dropped first: German numbers are written
 * both with and without it, and treating the two spellings as different
 * numbers would let exactly the duplicate this check exists to catch slip
 * through.
 */
export function normalizePhone(value: string | null): string | null {
  if (value === null) return null;
  const withoutTrunkPrefix = value.replace(/\(0\)/g, '');
  const digits = withoutTrunkPrefix.replace(/\D+/g, '').replace(/^00/, '');
  return digits.length >= 6 ? digits : null;
}

/** Host without a leading www., used to spot two records of one company. */
export function websiteDomain(value: string | null): string | null {
  if (value === null || value.trim().length === 0) return null;
  const normalized = normalizeWebsite(value);
  if (normalized.url === null) return null;
  try {
    return new URL(normalized.url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export function emailDomain(value: string | null): string | null {
  if (value === null) return null;
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return null;
  return value.slice(at + 1).trim().toLowerCase();
}

/**
 * Free-mail providers are not evidence that two companies are the same.
 *
 * Without this list every partner using a gmail address would warn against
 * every other one, and a warning that fires constantly gets ignored.
 */
const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'web.de',
  'gmx.de',
  'gmx.net',
  't-online.de',
  'outlook.com',
  'outlook.de',
  'hotmail.com',
  'hotmail.de',
  'yahoo.com',
  'yahoo.de',
  'icloud.com',
  'mail.de',
  'freenet.de',
  'aol.com',
  'protonmail.com',
]);

export function isGenericEmailDomain(domain: string | null): boolean {
  return domain !== null && GENERIC_EMAIL_DOMAINS.has(domain);
}

/** German commercial register numbers, e.g. "HRB 12345" or "HRA 98 B". */
const REGISTRY_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .\-/]{1,48}[A-Za-z0-9]$/;

/** EU VAT identifier: two letters plus 2–13 alphanumerics. */
const VAT_ID_PATTERN = /^[A-Z]{2}[A-Z0-9]{2,13}$/;

/** Legal Entity Identifier: exactly 20 alphanumerics. */
const LEI_PATTERN = /^[A-Z0-9]{20}$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validatePartnerInput(
  input: PartnerFormInput,
  existing: readonly ExistingPartner[],
  currentId: string | null = null,
): PartnerValidationResult {
  const messages: ValidationMessage[] = [];

  const legalName = normalizeWhitespace(input.legalName);
  if (legalName.length === 0) {
    messages.push(error('missing_name', 'legalName', 'Der Firmenname ist ein Pflichtfeld.'));
  } else if (legalName.length > PARTNER_NAME_MAX_LENGTH) {
    messages.push(
      error(
        'name_too_long',
        'legalName',
        `Der Firmenname darf höchstens ${PARTNER_NAME_MAX_LENGTH} Zeichen lang sein.`,
      ),
    );
  }

  const normalizedName = legalName.length > 0 ? normalizeClientName(legalName) : '';
  const tradeName =
    input.tradeName === null ? null : normalizeWhitespace(input.tradeName) || null;

  const website = normalizeWebsite(input.website);
  if (website.problem !== null) {
    messages.push(error('invalid_website', 'website', website.problem));
  }

  const sourceUrl = normalizeWebsite(input.sourceUrl);
  if (sourceUrl.problem !== null) {
    messages.push(error('invalid_source_url', 'sourceUrl', sourceUrl.problem));
  }

  const country = input.country?.trim().toUpperCase() ?? '';
  if (country.length > 0 && !/^[A-Z]{2}$/.test(country)) {
    messages.push(
      error(
        'invalid_country',
        'country',
        'Das Land wird als zweistelliger Ländercode erwartet, z. B. DE.',
      ),
    );
  }

  const email = input.email?.trim() ?? '';
  if (email.length > 0 && !EMAIL_PATTERN.test(email)) {
    messages.push(error('invalid_email', 'email', 'Die E-Mail-Adresse ist ungültig.'));
  }

  const registryNumber = input.registryNumber?.trim() ?? '';
  if (registryNumber.length > 0 && !REGISTRY_NUMBER_PATTERN.test(registryNumber)) {
    messages.push(
      error(
        'invalid_registry_number',
        'registryNumber',
        'Die Registernummer enthält unerwartete Zeichen, z. B. „HRB 12345".',
      ),
    );
  }

  const vatId = input.vatId?.trim().toUpperCase().replace(/\s+/g, '') ?? '';
  if (vatId.length > 0 && !VAT_ID_PATTERN.test(vatId)) {
    messages.push(
      error(
        'invalid_vat_id',
        'vatId',
        'Die Umsatzsteuer-ID hat ein ungültiges Format, z. B. „DE123456789".',
      ),
    );
  }

  const lei = input.lei?.trim().toUpperCase().replace(/\s+/g, '') ?? '';
  if (lei.length > 0 && !LEI_PATTERN.test(lei)) {
    messages.push(
      error('invalid_lei', 'lei', 'Ein LEI besteht aus genau 20 Zeichen.'),
    );
  }

  const internalNotes = input.internalNotes?.trim() ?? '';
  if (internalNotes.length > PARTNER_NOTES_MAX_LENGTH) {
    messages.push(
      error(
        'notes_too_long',
        'internalNotes',
        `Die Notizen dürfen höchstens ${PARTNER_NOTES_MAX_LENGTH} Zeichen lang sein.`,
      ),
    );
  }

  const blockedReason = input.blockedReason?.trim() ?? '';
  if (input.isBlocked && blockedReason.length === 0) {
    messages.push(
      error(
        'missing_block_reason',
        'blockedReason',
        'Eine Sperrung benötigt eine Begründung — sonst ist sie später nicht nachvollziehbar.',
      ),
    );
  }
  if (blockedReason.length > PARTNER_BLOCK_REASON_MAX_LENGTH) {
    messages.push(
      error(
        'block_reason_too_long',
        'blockedReason',
        `Die Begründung darf höchstens ${PARTNER_BLOCK_REASON_MAX_LENGTH} Zeichen lang sein.`,
      ),
    );
  }

  if (input.isBlocked && input.isPreferred) {
    messages.push(
      error(
        'blocked_and_preferred',
        'isPreferred',
        'Ein gesperrter Partner kann nicht zugleich bevorzugt sein.',
      ),
    );
  }

  if (
    input.internalRating !== null &&
    (!Number.isInteger(input.internalRating) ||
      input.internalRating < 1 ||
      input.internalRating > 5)
  ) {
    messages.push(
      error('invalid_rating', 'internalRating', 'Die interne Bewertung liegt zwischen 1 und 5.'),
    );
  }

  messages.push(
    ...findDuplicateMessages(
      {
        normalizedName,
        legalName,
        country: country.length > 0 ? country : null,
        registryNumber: registryNumber.length > 0 ? registryNumber : null,
        vatId: vatId.length > 0 ? vatId : null,
        website: website.url,
        email: email.length > 0 ? email : null,
        phone: input.phone,
        city: input.city,
        address: input.address,
      },
      existing,
      currentId,
    ),
  );

  return {
    normalized: {
      ...input,
      legalName,
      normalizedName,
      tradeName,
      country: country.length > 0 ? country : null,
      region: input.region?.trim() || null,
      city: input.city?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      address: input.address?.trim() || null,
      website: website.url,
      email: email.length > 0 ? email : null,
      phone: input.phone?.trim() || null,
      registryName: input.registryName?.trim() || null,
      registryNumber: registryNumber.length > 0 ? registryNumber : null,
      vatId: vatId.length > 0 ? vatId : null,
      lei: lei.length > 0 ? lei : null,
      blockedReason: blockedReason.length > 0 ? blockedReason : null,
      sourceName: input.sourceName?.trim() || null,
      sourceUrl: sourceUrl.url,
      internalNotes: internalNotes.length > 0 ? internalNotes : null,
    },
    messages,
    valid: !messages.some((message) => message.severity === 'error'),
  };
}

interface DuplicateSubject {
  normalizedName: string;
  legalName: string;
  country: string | null;
  registryNumber: string | null;
  vatId: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
}

/**
 * Duplicate rules.
 *
 * Hard blocks — the record is provably the same company:
 *   * same registry number in the same country
 *   * same VAT identifier
 *   * same comparison form of the name (also the unique constraint)
 *
 * Warnings — it *might* be the same company, and only a human can say:
 *   * similar name, same website domain, same phone number,
 *     same company email domain, same address
 *
 * Nothing is ever merged automatically. Merging two partner files is not
 * reversible in any useful sense, so the decision stays with the user.
 */
export function findDuplicateMessages(
  subject: DuplicateSubject,
  existing: readonly ExistingPartner[],
  currentId: string | null,
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const others = existing.filter((entry) => entry.id !== currentId);

  if (subject.registryNumber !== null) {
    const hit = others.find(
      (entry) =>
        entry.registryNumber !== null &&
        entry.registryNumber.toUpperCase() === subject.registryNumber?.toUpperCase() &&
        entry.country === subject.country,
    );
    if (hit !== undefined) {
      return [
        error(
          'duplicate_registry_number',
          'registryNumber',
          `Diese Registernummer ist bereits für „${hit.legalName}" erfasst.`,
          hit.legalName,
        ),
      ];
    }
  }

  if (subject.vatId !== null) {
    const hit = others.find(
      (entry) => entry.vatId !== null && entry.vatId.toUpperCase() === subject.vatId,
    );
    if (hit !== undefined) {
      return [
        error(
          'duplicate_vat_id',
          'vatId',
          `Diese Umsatzsteuer-ID ist bereits für „${hit.legalName}" erfasst.`,
          hit.legalName,
        ),
      ];
    }
  }

  if (subject.normalizedName.length > 0) {
    const exact = others.find(
      (entry) => entry.normalizedName === subject.normalizedName,
    );
    if (exact !== undefined) {
      return [
        error(
          'duplicate_partner',
          'legalName',
          `„${exact.legalName}" ist bereits erfasst.`,
          exact.legalName,
        ),
      ];
    }

    const similar = others.find((entry) =>
      looksLikeSameValue(entry.normalizedName, subject.normalizedName),
    );
    if (similar !== undefined) {
      messages.push(
        warning(
          'possible_duplicate_name',
          'legalName',
          `Möglicherweise dasselbe Unternehmen wie „${similar.legalName}". Bitte prüfen — es wird nichts automatisch zusammengeführt.`,
          similar.legalName,
        ),
      );
    }
  }

  const domain = websiteDomain(subject.website);
  if (domain !== null) {
    const hit = others.find((entry) => websiteDomain(entry.website) === domain);
    if (hit !== undefined) {
      messages.push(
        warning(
          'possible_duplicate_website',
          'website',
          `„${hit.legalName}" nutzt dieselbe Website-Domain (${domain}).`,
          hit.legalName,
        ),
      );
    }
  }

  const phone = normalizePhone(subject.phone);
  if (phone !== null) {
    const hit = others.find((entry) => normalizePhone(entry.phone) === phone);
    if (hit !== undefined) {
      messages.push(
        warning(
          'possible_duplicate_phone',
          'phone',
          `„${hit.legalName}" hat dieselbe Telefonnummer hinterlegt.`,
          hit.legalName,
        ),
      );
    }
  }

  const mailDomain = emailDomain(subject.email);
  if (mailDomain !== null && !isGenericEmailDomain(mailDomain)) {
    const hit = others.find((entry) => emailDomain(entry.email) === mailDomain);
    if (hit !== undefined) {
      messages.push(
        warning(
          'possible_duplicate_email_domain',
          'email',
          `„${hit.legalName}" nutzt dieselbe E-Mail-Domain (${mailDomain}).`,
          hit.legalName,
        ),
      );
    }
  }

  if (subject.address !== null && subject.address.trim().length > 0) {
    const key = `${subject.address} ${subject.city ?? ''}`.trim().toLowerCase();
    const hit = others.find(
      (entry) =>
        entry.address !== null &&
        `${entry.address} ${entry.city ?? ''}`.trim().toLowerCase() === key,
    );
    if (hit !== undefined) {
      messages.push(
        warning(
          'possible_duplicate_address',
          'address',
          `„${hit.legalName}" ist unter derselben Anschrift erfasst.`,
          hit.legalName,
        ),
      );
    }
  }

  return messages;
}

/** Which fields changed — drives the separate audit entries. */
export function diffPartner(
  before: Partial<NormalizedPartnerInput>,
  after: NormalizedPartnerInput,
): {
  changedFields: string[];
  statusChanged: boolean;
  blockChanged: boolean;
  preferredChanged: boolean;
  notesChanged: boolean;
} {
  const fields: Array<keyof NormalizedPartnerInput> = [
    'legalName',
    'tradeName',
    'relationshipDirection',
    'partnerLevel',
    'status',
    'verificationStatus',
    'country',
    'region',
    'city',
    'postalCode',
    'address',
    'website',
    'email',
    'phone',
    'registryName',
    'registryNumber',
    'vatId',
    'lei',
    'staffModel',
    'furtherSubcontractingStatus',
    'datacenterExperienceStatus',
    'isPreferred',
    'isBlocked',
    'blockedReason',
    'internalRating',
    'sourceType',
    'sourceName',
    'sourceUrl',
    'internalNotes',
  ];

  const changedFields = fields.filter((field) => before[field] !== after[field]);

  return {
    changedFields: changedFields.map(String),
    statusChanged: before.status !== after.status,
    blockChanged: before.isBlocked !== after.isBlocked,
    preferredChanged: before.isPreferred !== after.isPreferred,
    notesChanged: before.internalNotes !== after.internalNotes,
  };
}

export const PARTNER_AUDIT_ACTIONS = {
  created: 'partner_created',
  updated: 'partner_updated',
  statusChanged: 'partner_status_changed',
  blocked: 'partner_blocked',
  unblocked: 'partner_unblocked',
  preferredChanged: 'partner_preferred_changed',
  notesChanged: 'partner_notes_changed',
  contactSaved: 'partner_contact_saved',
  serviceConfirmed: 'partner_service_confirmed',
  availabilityChanged: 'partner_availability_changed',
  documentUploaded: 'partner_document_uploaded',
  documentReviewed: 'partner_document_reviewed',
  rateSaved: 'partner_rate_saved',
  signalCreated: 'partner_signal_created',
  signalUpdated: 'partner_signal_updated',
  needCreated: 'subcontractor_need_created',
  needUpdated: 'subcontractor_need_updated',
  matchReviewed: 'subcontractor_match_reviewed',
  assignmentCreated: 'subcontractor_assignment_created',
  assignmentUpdated: 'subcontractor_assignment_updated',
} as const;
