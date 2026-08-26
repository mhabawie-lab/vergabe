/**
 * Mapping source columns onto the internal fields.
 *
 * The detection produces a *proposal*. The import screen shows it and lets the
 * user correct every assignment before anything is read — an auto-mapping that
 * silently picks the wrong column would corrupt customer data quietly.
 */

import {
  applyMappingFor,
  findMissingFields,
  proposeMappingFor,
  toRawRecord as toRawRecordShared,
  type ColumnAssignment as GenericColumnAssignment,
} from '@/lib/import/column-matching';

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

export type ColumnAssignment = GenericColumnAssignment<ImportField>;

export type ColumnMapping = ColumnAssignment[];

/**
 * Proposes an assignment for every source column.
 *
 * The matching itself lives in `@/lib/import/column-matching`, shared with the
 * partner import — the rules are identical and must stay that way.
 */
export function proposeColumnMapping(headers: readonly string[]): ColumnMapping {
  return proposeMappingFor(headers, FIELD_MATCHERS);
}

/** Fields the mapping does not cover, out of the required set. */
export function findMissingRequiredFields(mapping: ColumnMapping): ImportField[] {
  return findMissingFields(mapping, REQUIRED_IMPORT_FIELDS);
}

/** Reads one source row into a field-keyed record, following the mapping. */
export function applyMapping(
  mapping: ColumnMapping,
  row: readonly string[],
): Partial<Record<ImportField, string>> {
  return applyMappingFor(mapping, row);
}

/** Keeps the full source row keyed by header, for immutable storage. */
export function toRawRecord(
  headers: readonly string[],
  row: readonly string[],
): Record<string, string> {
  return toRawRecordShared(headers, row);
}
