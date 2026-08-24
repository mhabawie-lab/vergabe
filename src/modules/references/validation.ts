/**
 * Row validation for reference imports.
 *
 * Three principles run through this module:
 *
 *  1. **Raw data is never touched.** Validation reads the mapped values and
 *     produces a normalised proposal *beside* them.
 *  2. **A suspected typo is a suggestion, not a correction.** Anything the
 *     validator considers a likely misspelling is reported with the value it
 *     would propose — applying it is the user's decision.
 *  3. **Missing information is not filled in.** An incomplete place name stays
 *     incomplete; no city, region or country is inferred.
 */

import type {
  ReferenceInvoiceStatus,
  ValidationMessage,
} from '@/types/reference';
import type { ImportField } from './column-mapping';
import { IMPORT_FIELD_LABELS } from './column-mapping';
import { looksLikeSameValue, normalizeCityName, normalizeClientName } from './normalize';
import { parseShiftSummary } from './shift-format';

/** The normalised proposal for a row. Stored separately from the raw data. */
export interface NormalizedRow {
  externalObjectNumber: string | null;
  projectName: string | null;
  objectType: string | null;
  city: string | null;
  /** Comparison form of `city`. Only for matching, never displayed as truth. */
  cityKey: string | null;
  clientName: string | null;
  /** Comparison form of `clientName`. */
  clientKey: string | null;
  shiftSummaryRaw: string | null;
  shiftValues: number[];
  invoiceStatus: ReferenceInvoiceStatus;
  region: string | null;
  country: string | null;
  postalCode: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}

/** Known spellings of the invoice column, in normalised form. */
const INVOICE_STATUS_VALUES: Record<string, ReferenceInvoiceStatus> = {
  ja: 'invoiced',
  j: 'invoiced',
  yes: 'invoiced',
  x: 'invoiced',
  berechnet: 'invoiced',
  abgerechnet: 'invoiced',
  fakturiert: 'invoiced',
  nein: 'not_invoiced',
  n: 'not_invoiced',
  no: 'not_invoiced',
  offen: 'not_invoiced',
  'nicht berechnet': 'not_invoiced',
  teilweise: 'partially_invoiced',
  teil: 'partially_invoiced',
  anteilig: 'partially_invoiced',
};

/** Object numbers are letters, digits, dash, slash, underscore and dot. */
const OBJECT_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GERMAN_DATE_PATTERN = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Accepts ISO and `DD.MM.YYYY`; anything else is reported, not guessed. */
function parseDate(value: string): { iso: string | null; problem: string | null } {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { iso: null, problem: null };

  if (ISO_DATE_PATTERN.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return { iso: null, problem: 'Datum ist ungültig.' };
    }
    return { iso: trimmed, problem: null };
  }

  const german = GERMAN_DATE_PATTERN.exec(trimmed);
  if (german !== null) {
    const [, day, month, year] = german;
    if (day === undefined || month === undefined || year === undefined) {
      return { iso: null, problem: 'Datum ist ungültig.' };
    }
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return { iso: null, problem: 'Datum ist ungültig.' };
    }
    return { iso, problem: null };
  }

  return {
    iso: null,
    problem: 'Erwartet wird TT.MM.JJJJ oder JJJJ-MM-TT.',
  };
}

/** Values seen in earlier rows, used to spot inconsistent spellings. */
export interface KnownValues {
  /** comparison key → first spelling encountered. */
  clientNames: Map<string, string>;
  cityNames: Map<string, string>;
  /** Object numbers already used, from earlier rows or the database. */
  objectNumbers: Set<string>;
}

export function createKnownValues(): KnownValues {
  return {
    clientNames: new Map(),
    cityNames: new Map(),
    objectNumbers: new Set(),
  };
}

export interface RowValidationResult {
  normalized: NormalizedRow;
  messages: ValidationMessage[];
  /** Worst severity found. */
  status: 'valid' | 'warning' | 'error';
}

function missing(field: ImportField, code: string): ValidationMessage {
  return {
    severity: 'error',
    code,
    field,
    message: `${IMPORT_FIELD_LABELS[field]} fehlt.`,
    suggestion: null,
  };
}

/**
 * Validates one mapped row.
 *
 * `known` accumulates across the file so later rows can be compared with
 * earlier ones. It is updated in place.
 */
export function validateRow(
  mapped: Partial<Record<ImportField, string>>,
  known: KnownValues,
): RowValidationResult {
  const messages: ValidationMessage[] = [];

  // --- Client ------------------------------------------------------------
  const clientName = mapped.clientName?.trim() ?? '';
  let clientKey: string | null = null;

  if (clientName.length === 0) {
    messages.push(missing('clientName', 'missing_client'));
  } else {
    clientKey = normalizeClientName(clientName);
    const seen = known.clientNames.get(clientKey);
    if (seen !== undefined && seen !== clientName) {
      messages.push({
        severity: 'warning',
        code: 'client_spelling_variant',
        field: 'clientName',
        message: `Der Kunde wurde in dieser Datei bereits als „${seen}" geschrieben.`,
        suggestion: seen,
      });
    } else if (seen === undefined) {
      // Look for a near miss among the clients already seen.
      for (const [otherKey, otherName] of known.clientNames) {
        if (looksLikeSameValue(clientKey, otherKey)) {
          messages.push({
            severity: 'warning',
            code: 'client_possible_typo',
            field: 'clientName',
            message: `Möglicherweise derselbe Kunde wie „${otherName}". Bitte prüfen.`,
            suggestion: otherName,
          });
          break;
        }
      }
      known.clientNames.set(clientKey, clientName);
    }
  }

  // --- Project name ------------------------------------------------------
  const projectName = mapped.projectName?.trim() ?? '';
  if (projectName.length === 0) {
    messages.push(missing('projectName', 'missing_project_name'));
  }

  // --- Object number -----------------------------------------------------
  const externalObjectNumber = mapped.externalObjectNumber?.trim() ?? '';
  if (externalObjectNumber.length > 0) {
    if (!OBJECT_NUMBER_PATTERN.test(externalObjectNumber)) {
      messages.push({
        severity: 'error',
        code: 'invalid_object_number',
        field: 'externalObjectNumber',
        message:
          'Die Objekt-Nr. enthält unerwartete Zeichen. Erlaubt sind Buchstaben, Ziffern, Punkt, Bindestrich, Schrägstrich und Unterstrich.',
        suggestion: null,
      });
    } else if (known.objectNumbers.has(externalObjectNumber)) {
      messages.push({
        severity: 'error',
        code: 'duplicate_object_number',
        field: 'externalObjectNumber',
        message: `Die Objekt-Nr. „${externalObjectNumber}" ist innerhalb dieser Organisation bereits vergeben.`,
        suggestion: null,
      });
    } else {
      known.objectNumbers.add(externalObjectNumber);
    }
  }

  // --- City --------------------------------------------------------------
  const city = mapped.city?.trim() ?? '';
  let cityKey: string | null = null;

  if (city.length === 0) {
    messages.push({
      severity: 'error',
      code: 'missing_city',
      field: 'city',
      message: 'Ort fehlt.',
      suggestion: null,
    });
  } else {
    cityKey = normalizeCityName(city);
    const seen = known.cityNames.get(cityKey);
    if (seen !== undefined && seen !== city) {
      messages.push({
        severity: 'warning',
        code: 'city_spelling_variant',
        field: 'city',
        message: `Der Ort wurde in dieser Datei bereits als „${seen}" geschrieben.`,
        suggestion: seen,
      });
    } else if (seen === undefined) {
      for (const [otherKey, otherName] of known.cityNames) {
        if (looksLikeSameValue(cityKey, otherKey)) {
          messages.push({
            severity: 'warning',
            code: 'city_possible_typo',
            field: 'city',
            message: `Möglicherweise derselbe Ort wie „${otherName}". Bitte prüfen.`,
            suggestion: otherName,
          });
          break;
        }
      }
      known.cityNames.set(cityKey, city);
    }
  }

  // --- Shift column ------------------------------------------------------
  const shiftInput = mapped.shiftSummary ?? '';
  const shift = parseShiftSummary(shiftInput);
  if (!shift.isValid) {
    messages.push({
      severity: 'warning',
      code: 'invalid_shift_format',
      field: 'shiftSummary',
      message: `Schichtwert „${shift.raw.trim()}" konnte nicht gelesen werden. ${shift.problem ?? ''}`.trim(),
      // The original is kept regardless; only the numeric split is skipped.
      suggestion: null,
    });
  }

  // --- Invoice status ----------------------------------------------------
  const invoiceInput = mapped.invoiceStatus?.trim() ?? '';
  let invoiceStatus: ReferenceInvoiceStatus = 'unknown';
  if (invoiceInput.length > 0) {
    const resolved = INVOICE_STATUS_VALUES[normalizeKey(invoiceInput)];
    if (resolved === undefined) {
      messages.push({
        severity: 'warning',
        code: 'unknown_invoice_status',
        field: 'invoiceStatus',
        message: `Rechnungsstatus „${invoiceInput}" ist unbekannt und wird als „Unbekannt" übernommen.`,
        suggestion: null,
      });
    } else {
      invoiceStatus = resolved;
    }
  }

  // --- Dates -------------------------------------------------------------
  const start = parseDate(mapped.startDate ?? '');
  if (start.problem !== null) {
    messages.push({
      severity: 'warning',
      code: 'invalid_start_date',
      field: 'startDate',
      message: `Projektbeginn konnte nicht gelesen werden. ${start.problem}`,
      suggestion: null,
    });
  }

  const end = parseDate(mapped.endDate ?? '');
  if (end.problem !== null) {
    messages.push({
      severity: 'warning',
      code: 'invalid_end_date',
      field: 'endDate',
      message: `Projektende konnte nicht gelesen werden. ${end.problem}`,
      suggestion: null,
    });
  }

  if (start.iso !== null && end.iso !== null && start.iso > end.iso) {
    messages.push({
      severity: 'error',
      code: 'date_order',
      field: 'endDate',
      message: 'Das Projektende liegt vor dem Projektbeginn.',
      suggestion: null,
    });
  }

  const normalized: NormalizedRow = {
    externalObjectNumber: externalObjectNumber.length > 0 ? externalObjectNumber : null,
    projectName: projectName.length > 0 ? projectName : null,
    objectType: mapped.objectType?.trim() ?? null,
    city: city.length > 0 ? city : null,
    cityKey,
    clientName: clientName.length > 0 ? clientName : null,
    clientKey,
    // The original is kept even when it failed to parse — nothing is discarded.
    shiftSummaryRaw: shiftInput.trim().length > 0 ? shiftInput.trim() : null,
    shiftValues: shift.values,
    invoiceStatus,
    region: mapped.region?.trim() ?? null,
    country: mapped.country?.trim() ?? null,
    postalCode: mapped.postalCode?.trim() ?? null,
    startDate: start.iso,
    endDate: end.iso,
    description: mapped.description?.trim() ?? null,
  };

  const status = messages.some((message) => message.severity === 'error')
    ? 'error'
    : messages.some((message) => message.severity === 'warning')
      ? 'warning'
      : 'valid';

  return { normalized, messages, status };
}
