/**
 * Validating one imported partner row.
 *
 * Same discipline as the phase-2 reference import: the raw row is never
 * changed, a suspected typo produces a *suggestion* rather than a correction,
 * and a missing value stays missing instead of being derived from something
 * else. Rows with errors are never imported; rows with warnings only when the
 * user asks for it.
 */

import { normalizeCityName, normalizeClientName, looksLikeSameValue } from '@/modules/references/normalize';
import { normalizeWebsite } from '@/modules/references/client-validation';
import type { ValidationMessage } from '@/types/reference';
import {
  PARTNER_SERVICE_CATEGORIES,
  PARTNER_SERVICE_CATEGORY_LABELS,
  type DatacenterExperienceStatus,
  type FurtherSubcontractingStatus,
  type PartnerLevel,
  type PartnerServiceCategory,
  type PartnerStatus,
  type RelationshipDirection,
  type SignalType,
  type StaffModel,
  type VerificationStatus,
} from '@/types/partner';
import { normalizePhone } from './validation';
import type { PartnerImportField } from './column-mapping';

export interface NormalizedPartnerRow {
  legalName: string | null;
  tradeName: string | null;
  relationshipDirection: RelationshipDirection;
  partnerLevel: PartnerLevel;
  serviceCategory: PartnerServiceCategory | null;
  country: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  radiusKm: number | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  availableStaff: number | null;
  availableFrom: string | null;
  staffModel: StaffModel;
  furtherSubcontracting: FurtherSubcontractingStatus;
  datacenterExperience: DatacenterExperienceStatus;
  status: PartnerStatus;
  verificationStatus: VerificationStatus;
  seeksSubcontractor: boolean | null;
  signalType: SignalType | null;
  projectName: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  lastContactAt: string | null;
  followUpAt: string | null;
  note: string | null;
}

type RawRow = Partial<Record<PartnerImportField, string>>;

function text(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** German and ISO dates. Anything else is reported, never guessed at. */
export function parseImportDate(value: string | null): string | null {
  if (value === null) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso !== null) return value;

  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  if (german !== null) {
    const [, day, month, year] = german;
    if (day !== undefined && month !== undefined && year !== undefined) {
      const padded = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      // Reject 31.02. rather than silently rolling it into March.
      const parsed = new Date(`${padded}T00:00:00Z`);
      if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(padded)) {
        return padded;
      }
    }
  }

  return null;
}

export function parseImportInteger(value: string | null): number | null {
  if (value === null) return null;
  const digits = value.replace(/[^\d-]/g, '');
  if (digits.length === 0) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * German yes/no answers.
 *
 * Returns null for anything it does not recognise. An unrecognised answer is
 * reported as a warning and stays unknown — reading "vielleicht" as "ja"
 * would be worse than leaving the field empty.
 */
export function parseGermanBoolean(value: string | null): boolean | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (['ja', 'j', 'yes', 'y', 'true', '1', 'wahr'].includes(normalized)) return true;
  if (['nein', 'n', 'no', 'false', '0', 'falsch'].includes(normalized)) return false;
  return null;
}

const DIRECTION_TERMS: Record<string, RelationshipDirection> = {
  'kann fur uns arbeiten': 'can_work_for_us',
  'kann fuer uns arbeiten': 'can_work_for_us',
  subunternehmer: 'can_work_for_us',
  nachunternehmer: 'can_work_for_us',
  can_work_for_us: 'can_work_for_us',
  'sucht subunternehmer': 'may_hire_us',
  auftraggeber: 'may_hire_us',
  hauptunternehmer: 'may_hire_us',
  may_hire_us: 'may_hire_us',
  beide: 'both',
  beides: 'both',
  both: 'both',
};

const LEVEL_TERMS: Record<string, PartnerLevel> = {
  hauptunternehmer: 'main_contractor',
  main_contractor: 'main_contractor',
  nachunternehmer: 'subcontractor',
  subcontractor: 'subcontractor',
  subunternehmer: 'sub_subcontractor',
  sub_subcontractor: 'sub_subcontractor',
  'weiterer subunternehmer': 'further_subcontractor',
  further_subcontractor: 'further_subcontractor',
};

const STATUS_TERMS: Record<string, PartnerStatus> = {
  interessent: 'prospect',
  prospect: 'prospect',
  kontaktiert: 'contacted',
  contacted: 'contacted',
  'in prufung': 'in_review',
  'in pruefung': 'in_review',
  in_review: 'in_review',
  qualifiziert: 'qualified',
  qualified: 'qualified',
  bevorzugt: 'preferred',
  preferred: 'preferred',
  gesperrt: 'blocked',
  blocked: 'blocked',
  inaktiv: 'inactive',
  inactive: 'inactive',
};

const VERIFICATION_TERMS: Record<string, VerificationStatus> = {
  ungepruft: 'unverified',
  ungeprueft: 'unverified',
  unverified: 'unverified',
  'selbst angegeben': 'self_declared',
  self_declared: 'self_declared',
  'unterlagen gepruft': 'documents_reviewed',
  'unterlagen geprueft': 'documents_reviewed',
  documents_reviewed: 'documents_reviewed',
  verifiziert: 'verified',
  verified: 'verified',
  abgelaufen: 'expired',
  expired: 'expired',
};

const STAFF_MODEL_TERMS: Record<string, StaffModel> = {
  'eigene mitarbeiter': 'own_staff',
  eigene: 'own_staff',
  own_staff: 'own_staff',
  gemischt: 'mixed',
  mixed: 'mixed',
  'weitere subunternehmer': 'further_subcontractors',
  further_subcontractors: 'further_subcontractors',
};

const SERVICE_TERMS: Record<string, PartnerServiceCategory> = {
  sicherheitsdienst: 'security',
  security: 'security',
  baustellenbewachung: 'construction_site_security',
  objektschutz: 'property_protection',
  empfang: 'reception',
  pforte: 'reception',
  'empfang pforte': 'reception',
  rechenzentrum: 'datacenter_security',
  datacenter: 'datacenter_security',
  'datacenter security': 'datacenter_security',
  sanitatsdienst: 'paramedic',
  sanitaetsdienst: 'paramedic',
  paramedic: 'paramedic',
  reinigung: 'cleaning',
  cleaning: 'cleaning',
  bauunterstutzung: 'construction_support',
  bauhelfer: 'construction_support',
  lager: 'warehouse_logistics',
  logistik: 'warehouse_logistics',
  'lager logistik': 'warehouse_logistics',
  'facility management': 'facility_management',
  facility: 'facility_management',
  brandwache: 'fire_watch',
  sonstige: 'other',
};

const SIGNAL_TERMS: Record<string, SignalType> = {
  'sucht subunternehmer': 'seeks_subcontractor',
  'sucht nachunternehmer': 'seeks_further_subcontractor',
  'sucht sicherheitsdienst': 'seeks_security',
  'sucht bauhelfer': 'seeks_construction_support',
  'sucht reinigung': 'seeks_cleaning',
  'neues projekt': 'new_project',
  'neues rechenzentrum': 'new_datacenter',
  'neuer standort': 'new_location',
};

function lookup<T>(table: Record<string, T>, value: string | null): T | null {
  if (value === null) return null;
  const key = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return table[key] ?? null;
}

export interface KnownPartnerValues {
  /** Comparison forms of company names already seen, for the typo hint. */
  companyNames: Map<string, string>;
  cityNames: Map<string, string>;
}

export function createKnownPartnerValues(): KnownPartnerValues {
  return { companyNames: new Map(), cityNames: new Map() };
}

export interface PartnerRowValidation {
  normalized: NormalizedPartnerRow;
  messages: ValidationMessage[];
  status: 'valid' | 'warning' | 'error';
}

export interface ExistingPartnerRef {
  id: string;
  legalName: string;
  normalizedName: string;
  registryNumber: string | null;
  city: string | null;
}

/**
 * Validates and normalises one row.
 *
 * @param seenNames comparison forms already used *in this file*, so a
 *        duplicate inside the upload is caught as well as one against stock.
 */
export function validatePartnerRow(
  raw: RawRow,
  existing: readonly ExistingPartnerRef[],
  known: KnownPartnerValues,
  seenNames: Set<string>,
): PartnerRowValidation {
  const messages: ValidationMessage[] = [];

  const legalName = text(raw.legalName);
  if (legalName === null) {
    messages.push({
      severity: 'error',
      code: 'missing_company_name',
      field: 'legalName',
      message: 'Der Firmenname fehlt. Ohne ihn lässt sich kein Partner anlegen.',
      suggestion: null,
    });
  }

  const normalizedName = legalName === null ? '' : normalizeClientName(legalName);

  if (normalizedName.length > 0) {
    if (seenNames.has(normalizedName)) {
      messages.push({
        severity: 'error',
        code: 'duplicate_in_file',
        field: 'legalName',
        message: 'Dieser Firmenname kommt in der Datei mehrfach vor.',
        suggestion: null,
      });
    }

    const inStock = existing.find((entry) => entry.normalizedName === normalizedName);
    if (inStock !== undefined) {
      messages.push({
        severity: 'error',
        code: 'duplicate_in_stock',
        field: 'legalName',
        message: `„${inStock.legalName}" ist bereits erfasst.`,
        suggestion: inStock.legalName,
      });
    } else {
      const similar =
        existing.find((entry) => looksLikeSameValue(entry.normalizedName, normalizedName)) ??
        null;
      if (similar !== null) {
        messages.push({
          severity: 'warning',
          code: 'possible_duplicate',
          field: 'legalName',
          message: `Möglicherweise dasselbe Unternehmen wie „${similar.legalName}".`,
          suggestion: similar.legalName,
        });
      }

      // Typo hint against names seen earlier in the same file.
      const knownMatch = [...known.companyNames.entries()].find(
        ([key]) => key !== normalizedName && looksLikeSameValue(key, normalizedName),
      );
      if (knownMatch !== undefined) {
        messages.push({
          severity: 'warning',
          code: 'similar_name_in_file',
          field: 'legalName',
          message: `Ähnlich geschrieben wie „${knownMatch[1]}" weiter oben in der Datei. Es wird nichts automatisch vereinheitlicht.`,
          suggestion: knownMatch[1],
        });
      }
    }
  }

  const website = normalizeWebsite(text(raw.website));
  if (website.problem !== null) {
    messages.push({
      severity: 'warning',
      code: 'invalid_website',
      field: 'website',
      message: `${website.problem} Das Feld bleibt leer.`,
      suggestion: null,
    });
  }

  const sourceUrl = normalizeWebsite(text(raw.sourceUrl));

  const city = text(raw.city);
  if (city !== null) {
    const normalizedCity = normalizeCityName(city);
    const knownCity = [...known.cityNames.entries()].find(
      ([key]) => key !== normalizedCity && looksLikeSameValue(key, normalizedCity),
    );
    if (knownCity !== undefined) {
      messages.push({
        severity: 'warning',
        code: 'similar_city',
        field: 'city',
        message: `Ort ähnlich geschrieben wie „${knownCity[1]}". Der Originalwert bleibt erhalten.`,
        suggestion: knownCity[1],
      });
    }
    known.cityNames.set(normalizedCity, city);
  }

  const serviceRaw = text(raw.serviceCategory);
  const serviceCategory = lookup(SERVICE_TERMS, serviceRaw);
  if (serviceRaw !== null && serviceCategory === null) {
    messages.push({
      severity: 'warning',
      code: 'unknown_service',
      field: 'serviceCategory',
      message: `Die Leistung „${serviceRaw}" ist keiner Kategorie zuzuordnen und bleibt unbestimmt.`,
      suggestion: null,
    });
  }

  const availableFromRaw = text(raw.availableFrom);
  const availableFrom = parseImportDate(availableFromRaw);
  if (availableFromRaw !== null && availableFrom === null) {
    messages.push({
      severity: 'warning',
      code: 'unreadable_date',
      field: 'availableFrom',
      message: `„${availableFromRaw}" ist kein lesbares Datum. Das Feld bleibt leer.`,
      suggestion: null,
    });
  }

  const lastContactRaw = text(raw.lastContactAt);
  const lastContactAt = parseImportDate(lastContactRaw);
  if (lastContactRaw !== null && lastContactAt === null) {
    messages.push({
      severity: 'warning',
      code: 'unreadable_date',
      field: 'lastContactAt',
      message: `„${lastContactRaw}" ist kein lesbares Datum. Das Feld bleibt leer.`,
      suggestion: null,
    });
  }

  const followUpRaw = text(raw.followUpAt);
  const followUpAt = parseImportDate(followUpRaw);
  if (followUpRaw !== null && followUpAt === null) {
    messages.push({
      severity: 'warning',
      code: 'unreadable_date',
      field: 'followUpAt',
      message: `„${followUpRaw}" ist kein lesbares Datum. Das Feld bleibt leer.`,
      suggestion: null,
    });
  }

  const seeksRaw = text(raw.seeksSubcontractor);
  const seeksSubcontractor = parseGermanBoolean(seeksRaw);
  if (seeksRaw !== null && seeksSubcontractor === null) {
    messages.push({
      severity: 'warning',
      code: 'unclear_yes_no',
      field: 'seeksSubcontractor',
      message: `„${seeksRaw}" wurde nicht als Ja oder Nein verstanden und bleibt unbestimmt.`,
      suggestion: null,
    });
  }

  const signalTypeRaw = text(raw.signalType);
  let signalType = lookup(SIGNAL_TERMS, signalTypeRaw);
  if (signalTypeRaw !== null && signalType === null) {
    messages.push({
      severity: 'warning',
      code: 'unknown_signal_type',
      field: 'signalType',
      message: `Der Signaltyp „${signalTypeRaw}" ist unbekannt. Es wird kein Signal angelegt.`,
      suggestion: null,
    });
  }
  // A plain "yes" in the "sucht Subunternehmer" column is itself a signal.
  if (signalType === null && seeksSubcontractor === true) {
    signalType = 'seeks_subcontractor';
  }

  // A signal without a source is a rumour and is not created.
  const sourceName = text(raw.sourceName);
  if (signalType !== null && sourceName === null && sourceUrl.url === null) {
    messages.push({
      severity: 'warning',
      code: 'signal_without_source',
      field: 'sourceName',
      message:
        'Für das Signal fehlt eine Quelle. Der Partner wird angelegt, das Signal nicht.',
      suggestion: null,
    });
    signalType = null;
  }

  const email = text(raw.email);
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    messages.push({
      severity: 'warning',
      code: 'invalid_email',
      field: 'email',
      message: `„${email}" ist keine gültige E-Mail-Adresse. Das Feld bleibt leer.`,
      suggestion: null,
    });
  }

  const direction = lookup(DIRECTION_TERMS, text(raw.relationshipDirection));

  const normalized: NormalizedPartnerRow = {
    legalName,
    tradeName: text(raw.tradeName),
    // A yes in "sucht Subunternehmer" does not silently override an explicit
    // direction column; it only fills the gap when none was given.
    relationshipDirection:
      direction ?? (seeksSubcontractor === true ? 'may_hire_us' : 'unknown'),
    partnerLevel: lookup(LEVEL_TERMS, text(raw.partnerLevel)) ?? 'unknown',
    serviceCategory,
    country: text(raw.country)?.toUpperCase().slice(0, 2) ?? null,
    region: text(raw.region),
    city,
    postalCode: text(raw.postalCode),
    radiusKm: parseImportInteger(text(raw.radiusKm)),
    contactName: text(raw.contactName),
    email: email !== null && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null,
    phone: normalizePhone(text(raw.phone)) === null ? null : text(raw.phone),
    website: website.url,
    availableStaff: parseImportInteger(text(raw.availableStaff)),
    availableFrom,
    staffModel: lookup(STAFF_MODEL_TERMS, text(raw.staffModel)) ?? 'unknown',
    furtherSubcontracting:
      parseGermanBoolean(text(raw.furtherSubcontracting)) === true
        ? 'allowed'
        : parseGermanBoolean(text(raw.furtherSubcontracting)) === false
          ? 'not_allowed'
          : 'unknown',
    datacenterExperience:
      parseGermanBoolean(text(raw.datacenterExperience)) === true
        ? // Never `confirmed` from an import: a spreadsheet cell is a claim,
          // not a verified fact.
          'claimed'
        : parseGermanBoolean(text(raw.datacenterExperience)) === false
          ? 'none'
          : 'unknown',
    status: lookup(STATUS_TERMS, text(raw.status)) ?? 'prospect',
    verificationStatus:
      lookup(VERIFICATION_TERMS, text(raw.verificationStatus)) ?? 'unverified',
    seeksSubcontractor,
    signalType,
    projectName: text(raw.projectName),
    sourceName,
    sourceUrl: sourceUrl.url,
    lastContactAt,
    followUpAt,
    note: text(raw.note),
  };

  if (normalizedName.length > 0 && legalName !== null) {
    known.companyNames.set(normalizedName, legalName);
  }

  const hasError = messages.some((message) => message.severity === 'error');
  const hasWarning = messages.some((message) => message.severity === 'warning');

  return {
    normalized,
    messages,
    status: hasError ? 'error' : hasWarning ? 'warning' : 'valid',
  };
}

/** Label for a recognised service, for the preview table. */
export function serviceLabel(category: PartnerServiceCategory | null): string {
  if (category === null) return '—';
  return PARTNER_SERVICE_CATEGORY_LABELS[category];
}

export { PARTNER_SERVICE_CATEGORIES };
