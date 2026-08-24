/**
 * Mapping source columns onto the internal fields.
 *
 * The detection produces a *proposal*. The import screen shows it and lets the
 * user correct every assignment before anything is read — an auto-mapping that
 * silently picks the wrong column would corrupt customer data quietly.
 */

import { normalizeForComparison } from './normalize';

/** The fields an import can fill. */
export const IMPORT_FIELDS = [
  'externalObjectNumber',
  'projectName',
  'objectType',
  'city',
  'clientName',
  'shiftSummary',
  'invoiceStatus',
  'region',
  'country',
  'postalCode',
  'startDate',
  'endDate',
  'description',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  externalObjectNumber: 'Objekt-Nr.',
  projectName: 'Objektname',
  objectType: 'Objektart',
  city: 'Ort',
  clientName: 'Kunde',
  shiftSummary: 'Schichten',
  invoiceStatus: 'Rechnung?',
  region: 'Region / Bundesland',
  country: 'Land',
  postalCode: 'PLZ',
  startDate: 'Projektbeginn',
  endDate: 'Projektende',
  description: 'Beschreibung',
};

/** Fields an import cannot do without. */
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = [
  'projectName',
  'clientName',
] as const;

interface FieldMatcher {
  field: ImportField;
  /** Normalised header forms that identify the field. */
  aliases: readonly string[];
}

/**
 * Header aliases, in normalised form (lowercase, no punctuation).
 *
 * "Objekt-Nr." normalises to "objekt nr", so that is what is listed.
 */
const FIELD_MATCHERS: readonly FieldMatcher[] = [
  {
    field: 'externalObjectNumber',
    aliases: ['objekt nr', 'objektnr', 'objektnummer', 'objekt nummer', 'nr', 'nummer'],
  },
  {
    field: 'projectName',
    aliases: ['objektname', 'objekt name', 'objekt', 'projektname', 'projekt', 'bezeichnung'],
  },
  {
    field: 'objectType',
    aliases: ['objektart', 'objekt art', 'art', 'typ', 'objekttyp', 'kategorie'],
  },
  {
    field: 'city',
    aliases: ['ort', 'stadt', 'standort', 'einsatzort'],
  },
  {
    field: 'clientName',
    aliases: ['kunde', 'kundenname', 'auftraggeber', 'kunde name', 'firma'],
  },
  {
    field: 'shiftSummary',
    aliases: ['schichten', 'schicht', 'schichtwerte', 'einsatze', 'einsatze schichten'],
  },
  {
    field: 'invoiceStatus',
    aliases: ['rechnung', 'rechnung gestellt', 'abgerechnet', 'rechnungsstatus', 'fakturiert'],
  },
  {
    field: 'region',
    aliases: ['region', 'bundesland', 'kanton', 'bezirk'],
  },
  {
    field: 'country',
    aliases: ['land', 'staat', 'country'],
  },
  {
    field: 'postalCode',
    aliases: ['plz', 'postleitzahl'],
  },
  {
    field: 'startDate',
    aliases: ['beginn', 'projektbeginn', 'start', 'startdatum', 'von', 'einsatzbeginn'],
  },
  {
    field: 'endDate',
    aliases: ['ende', 'projektende', 'enddatum', 'bis', 'einsatzende'],
  },
  {
    field: 'description',
    aliases: ['beschreibung', 'bemerkung', 'bemerkungen', 'notiz', 'notizen', 'hinweis'],
  },
] as const;

export interface ColumnAssignment {
  /** Index into `ParsedTable.headers`. */
  columnIndex: number;
  header: string;
  /** null means: column is ignored. */
  field: ImportField | null;
  /** How the proposal came about. */
  matchType: 'exact' | 'partial' | 'none';
}

export type ColumnMapping = ColumnAssignment[];

/**
 * Proposes an assignment for every source column.
 *
 * A field is assigned at most once: if two columns look like "Ort", the first
 * wins and the second is left unassigned for the user to resolve. Guessing
 * which of two candidates is right is not something this code can do safely.
 */
export function proposeColumnMapping(headers: readonly string[]): ColumnMapping {
  const taken = new Set<ImportField>();

  const exactMatch = (normalized: string): ImportField | null => {
    for (const matcher of FIELD_MATCHERS) {
      if (taken.has(matcher.field)) continue;
      if (matcher.aliases.includes(normalized)) return matcher.field;
    }
    return null;
  };

  const partialMatch = (normalized: string): ImportField | null => {
    if (normalized.length < 3) return null;
    for (const matcher of FIELD_MATCHERS) {
      if (taken.has(matcher.field)) continue;
      for (const alias of matcher.aliases) {
        if (alias.length < 3) continue;
        if (normalized.startsWith(alias) || alias.startsWith(normalized)) {
          return matcher.field;
        }
      }
    }
    return null;
  };

  // Two passes so an exact hit on a later column is never displaced by an
  // earlier column's partial hit.
  const normalizedHeaders = headers.map((header) => normalizeForComparison(header));
  const assignments: ColumnMapping = headers.map((header, columnIndex) => ({
    columnIndex,
    header,
    field: null,
    matchType: 'none',
  }));

  normalizedHeaders.forEach((normalized, index) => {
    const field = exactMatch(normalized);
    if (field === null) return;
    taken.add(field);
    const assignment = assignments[index];
    if (assignment !== undefined) {
      assignment.field = field;
      assignment.matchType = 'exact';
    }
  });

  normalizedHeaders.forEach((normalized, index) => {
    const assignment = assignments[index];
    if (assignment === undefined || assignment.field !== null) return;
    const field = partialMatch(normalized);
    if (field === null) return;
    taken.add(field);
    assignment.field = field;
    assignment.matchType = 'partial';
  });

  return assignments;
}

/** Fields the mapping does not cover, out of the required set. */
export function findMissingRequiredFields(mapping: ColumnMapping): ImportField[] {
  const assigned = new Set(
    mapping
      .map((assignment) => assignment.field)
      .filter((field): field is ImportField => field !== null),
  );
  return REQUIRED_IMPORT_FIELDS.filter((field) => !assigned.has(field));
}

/** Reads one source row into a field-keyed record, following the mapping. */
export function applyMapping(
  mapping: ColumnMapping,
  row: readonly string[],
): Partial<Record<ImportField, string>> {
  const result: Partial<Record<ImportField, string>> = {};

  for (const assignment of mapping) {
    if (assignment.field === null) continue;
    const value = row[assignment.columnIndex];
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) result[assignment.field] = trimmed;
  }

  return result;
}

/** Keeps the full source row keyed by header, for immutable storage. */
export function toRawRecord(
  headers: readonly string[],
  row: readonly string[],
): Record<string, string> {
  const raw: Record<string, string> = {};
  headers.forEach((header, index) => {
    raw[header] = row[index] ?? '';
  });
  return raw;
}
