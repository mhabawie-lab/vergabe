/**
 * Mapper for the DEMO source.
 *
 * Converts the portal-style payload — German field names, `DD.MM.YYYY` dates,
 * `1.250.000,00 EUR` money strings, German enum values — into the unified
 * model. This is the only place that knows the demo source's format.
 *
 * Adding a source means adding a sibling file here; nothing downstream
 * changes (CLAUDE.md § Architektur-Pipeline).
 */

import { isSectorKey } from '@/config/sectors';
import type {
  ProcedureType,
  ProcurementType,
  TenderStatus,
} from '@/types/tender';
import type {
  AuthorityDraft,
  AwardDraft,
  DocumentDraft,
  LotDraft,
  MapperContext,
  RequirementDraft,
  TenderDraft,
  TenderMapper,
} from '../types';

const MAPPER_VERSION = '1.0.0';

// --- Value coercion --------------------------------------------------------
// Raw payloads are untrusted input: every read is defensive.

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRequiredString(
  source: Record<string, unknown>,
  key: string,
): string {
  const value = readString(source, key);
  if (value === null) {
    throw new Error(`Pflichtfeld "${key}" fehlt oder ist leer`);
  }
  return value;
}

function readObject(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = source[key];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readStringArray(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function readObjectArray(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === 'object' && !Array.isArray(entry),
  );
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// --- Format conversion -----------------------------------------------------

/** `DD.MM.YYYY` or `DD.MM.YYYY HH:mm` → ISO-8601 timestamp. */
function parseGermanDateTime(value: string | null): string | null {
  if (value === null) return null;

  const match = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?$/.exec(value.trim());
  if (match === null) return null;

  const [, day, month, year, hour, minute] = match;
  if (day === undefined || month === undefined || year === undefined) return null;

  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      hour === undefined ? 0 : Number(hour),
      minute === undefined ? 0 : Number(minute),
    ),
  );

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** `DD.MM.YYYY` → `YYYY-MM-DD`. */
function parseGermanDate(value: string | null): string | null {
  const iso = parseGermanDateTime(value);
  return iso === null ? null : (iso.split('T')[0] ?? null);
}

/** `1.250.000,00 EUR` → `1250000`. */
function parseGermanMoney(value: string | null): number | null {
  if (value === null) return null;

  const numeric = value
    .replace(/[^\d.,-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const parsed = Number.parseFloat(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

// --- Enum translation ------------------------------------------------------

const PROCUREMENT_TYPE_BY_SOURCE_VALUE: Record<string, ProcurementType> = {
  dienstleistung: 'services',
  bauleistung: 'works',
  lieferleistung: 'supplies',
};

const PROCEDURE_TYPE_BY_SOURCE_VALUE: Record<string, ProcedureType> = {
  offenes_verfahren: 'open',
  oeffentliche_ausschreibung: 'open',
  nichtoffenes_verfahren: 'restricted',
  beschraenkte_ausschreibung: 'restricted',
  verhandlungsverfahren: 'negotiated',
  wettbewerblicher_dialog: 'competitive_dialogue',
  direktvergabe: 'direct_award',
  rahmenvereinbarung: 'framework',
};

const STATUS_BY_SOURCE_VALUE: Record<string, TenderStatus> = {
  veroeffentlicht: 'published',
  geaendert: 'amended',
  frist_abgelaufen: 'closed',
  vergeben: 'awarded',
  aufgehoben: 'cancelled',
};

// --- Sub-object mapping ----------------------------------------------------

function mapAuthority(payload: Record<string, unknown>): AuthorityDraft | null {
  const raw = readObject(payload, 'auftraggeber');
  if (raw === null) return null;

  const name = readString(raw, 'name');
  if (name === null) return null;

  return {
    externalId: readString(raw, 'id'),
    name,
    authorityType: readString(raw, 'typ'),
    street: readString(raw, 'strasse'),
    postalCode: readString(raw, 'plz'),
    city: readString(raw, 'ort'),
    regionCode: readString(raw, 'bundesland'),
    countryCode: readString(raw, 'land'),
    email: readString(raw, 'email'),
    phone: readString(raw, 'telefon'),
    website: null,
  };
}

function mapLots(payload: Record<string, unknown>): LotDraft[] {
  return readObjectArray(payload, 'lose').flatMap((raw, index) => {
    const title = readString(raw, 'titel');
    if (title === null) return [];

    return [
      {
        lotNumber: readString(raw, 'los_nr') ?? String(index + 1),
        title,
        description: readString(raw, 'beschreibung'),
        estimatedValueNet: parseGermanMoney(readString(raw, 'wert')),
        cpvCodes: readStringArray(raw, 'cpv'),
      },
    ];
  });
}

function mapRequirements(payload: Record<string, unknown>): RequirementDraft[] {
  const eligibility: RequirementDraft[] = readStringArray(
    payload,
    'eignungskriterien',
  ).map((label) => ({
    category: 'eligibility' as const,
    label,
    description: null,
    mandatory: true,
  }));

  const staff: RequirementDraft[] = readStringArray(
    payload,
    'personalanforderungen',
  ).map((label) => ({
    category: 'staff' as const,
    label,
    description: null,
    mandatory: true,
  }));

  return [...eligibility, ...staff];
}

function mapDocuments(payload: Record<string, unknown>): DocumentDraft[] {
  return readObjectArray(payload, 'unterlagen').flatMap((raw) => {
    const title = readString(raw, 'titel');
    if (title === null) return [];

    const sizeKb = readNumber(raw, 'groesse_kb');

    return [
      {
        title,
        fileType: readString(raw, 'typ'),
        fileSizeBytes: sizeKb === null ? null : Math.round(sizeKb * 1024),
        // Phase 3 resolves and downloads the real file.
        sourceUrl: null,
      },
    ];
  });
}

function mapAward(payload: Record<string, unknown>): AwardDraft | null {
  const raw = readObject(payload, 'zuschlag');
  if (raw === null) return null;

  const winnerName = readString(raw, 'auftragnehmer');
  if (winnerName === null) return null;

  return {
    externalId: readString(raw, 'zuschlag_id'),
    winnerName,
    winnerCity: readString(raw, 'auftragnehmer_ort'),
    awardValueNet: parseGermanMoney(readString(raw, 'zuschlagswert')),
    currency: 'EUR',
    awardDate: parseGermanDate(readString(raw, 'zuschlag_am')),
    bidderCount: readNumber(raw, 'anzahl_bieter'),
    sourceUrl: readString(payload, 'quelle_url'),
  };
}

// --- Mapper ----------------------------------------------------------------

export const demoMapper: TenderMapper = {
  sourceKey: 'demo',
  version: MAPPER_VERSION,

  map(payload: Record<string, unknown>, context: MapperContext): TenderDraft {
    const externalId = readRequiredString(payload, 'vergabe_id');
    const title = readRequiredString(payload, 'bezeichnung');

    const performanceLocation = readObject(payload, 'erfuellungsort');
    const authority = mapAuthority(payload);

    const rawProcurementType = readString(payload, 'leistungsart');
    const rawProcedureType = readString(payload, 'vergabeart');
    const rawStatus = readString(payload, 'status');

    const procurementType =
      rawProcurementType === null
        ? 'services'
        : (PROCUREMENT_TYPE_BY_SOURCE_VALUE[rawProcurementType] ?? 'services');

    const procedureType =
      rawProcedureType === null
        ? null
        : (PROCEDURE_TYPE_BY_SOURCE_VALUE[rawProcedureType] ?? null);

    const status =
      rawStatus === null
        ? 'published'
        : (STATUS_BY_SOURCE_VALUE[rawStatus] ?? 'published');

    if (rawStatus !== null && STATUS_BY_SOURCE_VALUE[rawStatus] === undefined) {
      context.logger.warn('Unbekannter Quellstatus, Fallback auf "published"', {
        externalId,
        rawStatus,
      });
    }

    // Only keys the unified model recognises survive; the rest is dropped
    // here and remains available in the untouched raw import.
    const sectors = readStringArray(payload, 'branchen').filter(isSectorKey);

    return {
      externalId,
      title,
      summary: readString(payload, 'kurzbeschreibung'),
      description: readString(payload, 'leistungsbeschreibung'),
      referenceNumber: readString(payload, 'aktenzeichen'),
      procurementType,
      procedureType,
      cpvCodes: readStringArray(payload, 'cpv'),
      sectors,
      nutsCodes:
        performanceLocation === null ? [] : readStringArray(performanceLocation, 'nuts'),
      countryCode:
        performanceLocation === null ? null : readString(performanceLocation, 'land'),
      regionCode:
        performanceLocation === null
          ? null
          : readString(performanceLocation, 'bundesland'),
      city: performanceLocation === null ? null : readString(performanceLocation, 'ort'),
      postalCode:
        performanceLocation === null ? null : readString(performanceLocation, 'plz'),
      publicationDate: parseGermanDateTime(readString(payload, 'veroeffentlicht_am')),
      submissionDeadline: parseGermanDateTime(readString(payload, 'angebotsfrist')),
      questionDeadline: parseGermanDateTime(readString(payload, 'bieterfragen_bis')),
      bindingPeriodEnd: parseGermanDateTime(readString(payload, 'bindefrist')),
      contractStart: parseGermanDate(readString(payload, 'vertragsbeginn')),
      contractEnd: parseGermanDate(readString(payload, 'vertragsende')),
      durationMonths: readNumber(payload, 'laufzeit_monate'),
      estimatedValueNet: parseGermanMoney(
        readString(payload, 'geschaetzter_auftragswert'),
      ),
      currency: 'EUR',
      status,
      sourceUrl: readString(payload, 'quelle_url'),
      originalLanguage: 'de',
      sourceExtras: {
        vergabeart: rawProcedureType,
        quellstatus: rawStatus,
      },
      authority,
      lots: mapLots(payload),
      requirements: mapRequirements(payload),
      documents: mapDocuments(payload),
      award: mapAward(payload),
    };
  },
};
