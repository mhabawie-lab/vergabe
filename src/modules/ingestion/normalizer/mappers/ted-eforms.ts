/**
 * Mapper for the TED / EU eForms source.
 *
 * TED publishes eForms business terms, not a tender object: values arrive as
 * parallel arrays (one entry per lot) and free text arrives as a language
 * dictionary. This file is the only place that knows those conventions.
 *
 * Two rules shape every decision below, both from CLAUDE.md:
 *
 *  - **In doubt, leave it empty.** An invented deadline or an invented award
 *    value is worse than a missing one, because a bid gets planned around it.
 *    Where TED's arrays cannot be correlated reliably, the field stays null
 *    and the untouched detail remains in the raw import.
 *  - **Nothing is lost.** Terms with no place in the unified model are kept
 *    in `sourceExtras`; the full payload stays in `raw_imports`.
 */

import { findSectorsForCpvCodes } from '@/config/sectors';
import { alpha3ToAlpha2, nutsToRegionCode } from '@/config/regions';
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
  TenderDraft,
  TenderMapper,
} from '../types';

const MAPPER_VERSION = '1.0.0';

/** Preferred languages for free text, in order. TED keys are ISO 639-2/B. */
const LANGUAGE_PREFERENCE = ['deu', 'eng'] as const;

/**
 * ISO 639-2/B → ISO 639-1, for the 24 official EU languages.
 *
 * TED publishes three-letter codes; `tenders.original_language` is `char(2)`,
 * so an unconverted code would be rejected by the database on every record.
 */
const LANGUAGE_ALPHA2_BY_ALPHA3: Record<string, string> = {
  bul: 'bg',
  ces: 'cs',
  dan: 'da',
  deu: 'de',
  ell: 'el',
  eng: 'en',
  est: 'et',
  fin: 'fi',
  fra: 'fr',
  gle: 'ga',
  hrv: 'hr',
  hun: 'hu',
  ita: 'it',
  lav: 'lv',
  lit: 'lt',
  mlt: 'mt',
  nld: 'nl',
  pol: 'pl',
  por: 'pt',
  ron: 'ro',
  slk: 'sk',
  slv: 'sl',
  spa: 'es',
  swe: 'sv',
};

/**
 * Two-letter language code for the notice.
 *
 * Falls back to the column's own default when TED names a language outside
 * the EU vocabulary — with a warning, so an unmapped code is visible rather
 * than silently recorded as German.
 */
function mapLanguage(
  candidates: readonly (string | null)[],
  context: MapperContext,
  externalId: string,
): string {
  for (const candidate of candidates) {
    if (candidate === null) continue;
    const mapped = LANGUAGE_ALPHA2_BY_ALPHA3[candidate.trim().toLowerCase()];
    if (mapped !== undefined) return mapped;
  }

  const stated = candidates.find((candidate) => candidate !== null);
  if (stated !== undefined) {
    context.logger.warn('Unbekannter TED-Sprachcode, Rückfall auf "de"', {
      externalId,
      language: stated,
    });
  }
  return 'de';
}

/** ISO 4217 is always three letters; anything else would break `char(3)`. */
function readCurrency(...candidates: (string | null)[]): string {
  for (const candidate of candidates) {
    if (candidate !== null && /^[A-Z]{3}$/.test(candidate.trim().toUpperCase())) {
      return candidate.trim().toUpperCase();
    }
  }
  return 'EUR';
}

// --- Value coercion --------------------------------------------------------
// A TED payload is untrusted input, and eForms terms are optional almost
// everywhere. Every read below tolerates a missing or unexpected shape.

function readScalarString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Reads a plain string array, e.g. `classification-cpv`. */
function readArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** First entry of a plain array field, or null when the field is absent. */
function readFirst(payload: Record<string, unknown>, key: string): string | null {
  return readArray(payload, key)[0] ?? null;
}

/**
 * Reads a multilingual field.
 *
 * TED delivers these as `{ deu: "…" }` or `{ deu: ["…", "…"] }` — a string
 * for procedure-level terms, an array with one entry per lot for lot-level
 * terms. Both collapse to a flat list here, in the preferred language.
 */
function readLocalizedArray(
  payload: Record<string, unknown>,
  key: string,
): { values: string[]; language: string | null } {
  const value = payload[key];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return { values: trimmed.length > 0 ? [trimmed] : [], language: null };
  }

  // Not every text term is translated. Place names and party names arrive as
  // a plain array whenever TED holds only one spelling of them.
  if (Array.isArray(value)) {
    return { values: readArray(payload, key), language: null };
  }

  if (value === null || typeof value !== 'object') {
    return { values: [], language: null };
  }

  const dictionary = value as Record<string, unknown>;
  const available = Object.keys(dictionary);
  const language =
    LANGUAGE_PREFERENCE.find((candidate) => available.includes(candidate)) ??
    available[0];

  if (language === undefined) return { values: [], language: null };

  const localized = dictionary[language];
  const values =
    typeof localized === 'string'
      ? [localized]
      : Array.isArray(localized)
        ? localized.filter((entry): entry is string => typeof entry === 'string')
        : [];

  return {
    values: values.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
    language,
  };
}

function readLocalizedFirst(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  return readLocalizedArray(payload, key).values[0] ?? null;
}

/**
 * Parses a monetary amount TED publishes as a string, e.g. `"320649.86"`.
 *
 * Always dot-separated in the API, so no locale handling is needed — and no
 * locale guessing either, which could silently move a decimal point.
 *
 * A negative amount is never a price. TED uses `-1` as a marker for "value
 * not disclosed", and roughly one award notice in twenty carries it; taking
 * it literally would show a contract worth minus one euro.
 */
function parseMoney(value: string | null): number | null {
  if (value === null) return null;
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// --- Dates -----------------------------------------------------------------

/** `2026-07-13+02:00` → `2026-07-13`, dropping the offset a date cannot carry. */
function parseDateOnly(value: string | null): string | null {
  if (value === null) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

/**
 * `2026-07-13+02:00` → an ISO-8601 timestamp at that day's start of day.
 *
 * TED publishes plain dates with the notice's UTC offset appended, a form
 * `new Date` cannot read. The implicit `T00:00:00` is spelled out first, in
 * the notice's own offset — start of day where the buyer sits, not in UTC.
 */
function parseTimestamp(value: string | null): string | null {
  if (value === null) return null;

  const dateOnly = /^(\d{4}-\d{2}-\d{2})([+-]\d{2}:\d{2}|Z)?$/.exec(value.trim());
  const normalized =
    dateOnly === null ? value : `${dateOnly[1]}T00:00:00${dateOnly[2] ?? 'Z'}`;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Combines an eForms date and time term into one timestamp.
 *
 * The time carries the notice's own UTC offset (`10:00:00+02:00`), which is
 * what makes a deadline comparable across time zones. Without a time the
 * date alone is returned — never padded to a made-up hour, because
 * "23:59" and "10:00" are a working day apart for a bid.
 */
function parseDateTime(date: string | null, time: string | null): string | null {
  const day = parseDateOnly(date);
  if (day === null) return null;
  if (time === null) return parseTimestamp(date);

  const combined = new Date(`${day}T${time}`);
  return Number.isNaN(combined.getTime()) ? parseTimestamp(date) : combined.toISOString();
}

/** Earliest of the values a lot-level date term carries — the binding one. */
function earliestDateTime(
  payload: Record<string, unknown>,
  dateKey: string,
  timeKey: string,
): string | null {
  const dates = readArray(payload, dateKey);
  const times = readArray(payload, timeKey);
  if (dates.length === 0) return null;

  const timestamps = dates
    .map((date, index) =>
      // Times are published in the same lot order as the dates; a shorter
      // time array means the remaining lots stated only a date.
      parseDateTime(date, times.length === dates.length ? (times[index] ?? null) : null),
    )
    .filter((value): value is string => value !== null);

  if (timestamps.length === 0) return null;
  return timestamps.reduce((earliest, current) =>
    current < earliest ? current : earliest,
  );
}

// --- Enum translation ------------------------------------------------------

/** eForms procedure types (BT-105). */
const PROCEDURE_TYPE_BY_TED_VALUE: Record<string, ProcedureType> = {
  open: 'open',
  restricted: 'restricted',
  'neg-w-call': 'negotiated',
  'neg-wo-call': 'negotiated',
  negotiated: 'negotiated',
  'comp-dial': 'competitive_dialogue',
  'comp-tend': 'negotiated',
  innovation: 'negotiated',
  'oth-mult': 'negotiated',
  'oth-single': 'direct_award',
};

/** eForms contract nature (BT-23). */
const PROCUREMENT_TYPE_BY_TED_VALUE: Record<string, ProcurementType> = {
  services: 'services',
  works: 'works',
  supplies: 'supplies',
};

/** eForms duration units (BT-36), converted to whole months. */
const MONTHS_PER_UNIT: Record<string, number> = {
  YEAR: 12,
  MONTH: 1,
};

function mapProcedureType(
  payload: Record<string, unknown>,
  context: MapperContext,
  externalId: string,
): ProcedureType | null {
  const raw = readScalarString(payload, 'procedure-type') ?? readFirst(payload, 'procedure-type');
  if (raw === null) return null;

  const mapped = PROCEDURE_TYPE_BY_TED_VALUE[raw];
  if (mapped === undefined) {
    context.logger.warn('Unbekannte TED-Verfahrensart, Feld bleibt leer', {
      externalId,
      procedureType: raw,
    });
    return null;
  }
  return mapped;
}

/**
 * Contract nature.
 *
 * A notice may mix natures across lots. The procedure-level term wins when
 * present; otherwise the most frequent lot value decides, which is what a
 * reader of the notice would call the contract.
 */
function mapProcurementType(payload: Record<string, unknown>): ProcurementType {
  const main =
    readScalarString(payload, 'contract-nature-main-proc') ??
    readFirst(payload, 'contract-nature-main-proc');

  if (main !== null && PROCUREMENT_TYPE_BY_TED_VALUE[main] !== undefined) {
    return PROCUREMENT_TYPE_BY_TED_VALUE[main];
  }

  const counts = new Map<ProcurementType, number>();
  for (const value of readArray(payload, 'contract-nature')) {
    const mapped = PROCUREMENT_TYPE_BY_TED_VALUE[value];
    if (mapped !== undefined) counts.set(mapped, (counts.get(mapped) ?? 0) + 1);
  }

  let winner: ProcurementType = 'services';
  let best = 0;
  for (const [type, count] of counts) {
    if (count > best) {
      winner = type;
      best = count;
    }
  }
  return winner;
}

/**
 * True when the notice is a corrected republication.
 *
 * eForms versions a notice as `<uuid>-01`, `-02`, …; anything past `-01` is a
 * change notice. Presence of the term alone means nothing — every eForms
 * notice carries it.
 */
function isAmendment(payload: Record<string, unknown>): boolean {
  // `readArray` already folds a scalar string into a one-element list.
  return readArray(payload, 'change-notice-version-identifier').some((identifier) => {
    const version = /-(\d+)$/.exec(identifier)?.[1];
    return version !== undefined && Number.parseInt(version, 10) > 1;
  });
}

/**
 * Lifecycle status.
 *
 * Derived only from what the notice itself states. Nothing is inferred from
 * the current date: a deadline that has passed does not make this mapper
 * write `closed`, because the payload would not change and the record would
 * then never be corrected.
 */
function mapStatus(payload: Record<string, unknown>): TenderStatus {
  const formType = readScalarString(payload, 'form-type') ?? readFirst(payload, 'form-type');
  const noticeType = readScalarString(payload, 'notice-type') ?? readFirst(payload, 'notice-type');

  if (formType === 'result' || noticeType?.startsWith('can') === true) {
    return 'awarded';
  }
  if (isAmendment(payload)) return 'amended';
  return 'published';
}

// --- Sub-object mapping ----------------------------------------------------

function mapAuthority(payload: Record<string, unknown>): AuthorityDraft | null {
  const name = readLocalizedFirst(payload, 'buyer-name');
  if (name === null) return null;

  const countryAlpha3 = readFirst(payload, 'buyer-country');

  return {
    externalId: readFirst(payload, 'buyer-identifier'),
    name,
    // eForms buyer legal type (BT-11), e.g. `la` for a local authority. Kept
    // as the source code; translating it into a label is a UI concern.
    authorityType: readFirst(payload, 'buyer-legal-type'),
    street: readLocalizedFirst(payload, 'organisation-street-buyer'),
    postalCode: readFirst(payload, 'buyer-post-code'),
    city: readLocalizedFirst(payload, 'buyer-city'),
    // TED states the buyer's country but not its region; deriving a federal
    // state from a postcode would be a guess.
    regionCode: null,
    countryCode: alpha3ToAlpha2(countryAlpha3),
    email: readFirst(payload, 'buyer-email'),
    phone: null,
    website: readFirst(payload, 'buyer-internet-address'),
  };
}

/**
 * Lots.
 *
 * eForms publishes lots as parallel arrays keyed by `identifier-lot`. Titles,
 * descriptions and values are only zipped onto a lot when their array has the
 * same length as the identifier array — a shorter one means TED omitted the
 * term for some lots, and position no longer identifies which.
 */
function mapLots(payload: Record<string, unknown>, cpvCodes: string[]): LotDraft[] {
  const identifiers = readArray(payload, 'identifier-lot');
  if (identifiers.length === 0) return [];

  const titles = readLocalizedArray(payload, 'title-lot').values;
  const descriptions = readLocalizedArray(payload, 'description-lot').values;
  const values = readArray(payload, 'estimated-value-lot');

  const aligned = (list: string[]): boolean => list.length === identifiers.length;

  // TED repeats entries in its parallel arrays. A lot number is unique per
  // tender in the data model, so a repeated identifier keeps its first
  // occurrence — the one whose position still lines up with the other terms.
  const seen = new Set<string>();

  return identifiers.flatMap((identifier, index) => {
    if (seen.has(identifier)) return [];
    seen.add(identifier);

    return [
      {
        lotNumber: identifier,
        title: (aligned(titles) ? titles[index] : undefined) ?? identifier,
        description: (aligned(descriptions) ? descriptions[index] : undefined) ?? null,
        estimatedValueNet: aligned(values) ? parseMoney(values[index] ?? null) : null,
        // TED reports CPV codes per notice, not per lot, in the search
        // response. Repeating the notice-level list on every lot would fake a
        // precision the source does not provide.
        cpvCodes: identifiers.length === 1 ? cpvCodes : [],
      },
    ];
  });
}

/**
 * Documents.
 *
 * The only files TED itself serves are the notice renditions. Procurement
 * documents live on the buyer's own portal behind `submission-url-lot`, which
 * is recorded as the tender's source link rather than as a downloadable file:
 * calling it a document would promise a download that phase 3 cannot deliver.
 */
function mapDocuments(payload: Record<string, unknown>): DocumentDraft[] {
  const links = payload['links'];
  if (links === null || typeof links !== 'object' || Array.isArray(links)) return [];

  const documents: DocumentDraft[] = [];
  const byFormat = links as Record<string, unknown>;

  for (const [format, title] of [
    ['pdf', 'Bekanntmachung (PDF)'],
    ['xml', 'Bekanntmachung (eForms-XML)'],
  ] as const) {
    const byLanguage = byFormat[format];
    if (byLanguage === null || typeof byLanguage !== 'object' || Array.isArray(byLanguage)) {
      continue;
    }

    const dictionary = byLanguage as Record<string, unknown>;
    // `MUL` is the multilingual original; `DEU` the German rendition.
    const language = ['DEU', 'MUL', 'ENG'].find(
      (candidate) => typeof dictionary[candidate] === 'string',
    );
    const url = language === undefined ? undefined : dictionary[language];
    if (typeof url !== 'string') continue;

    documents.push({
      title,
      fileType: format,
      // TED does not report a size, and estimating one would be a fiction.
      fileSizeBytes: null,
      sourceUrl: url,
    });
  }

  return documents;
}

/**
 * Award data from a result notice.
 *
 * TED lists winners, cities and values as separate arrays that are not
 * reliably index-aligned — a notice with three awarded lots and two distinct
 * winners publishes three names and two cities. Anything that cannot be tied
 * to the first winner with certainty is therefore left null, and the full
 * winner list is preserved in `sourceExtras`.
 */
function mapAward(
  payload: Record<string, unknown>,
  externalId: string,
  sourceUrl: string | null,
): AwardDraft | null {
  const winners = readLocalizedArray(payload, 'winner-name').values;
  const winnerName = winners[0];
  if (winnerName === undefined) return null;

  const cities = readArray(payload, 'winner-city');
  const values = readArray(payload, 'tender-value');
  const decisionDates = readArray(payload, 'winner-decision-date');

  const aligned = (list: string[]): boolean => list.length === winners.length;

  return {
    // TED publishes no award identifier. The publication number is the
    // source's own id for this award and is unique per notice — the winner's
    // company id is not, and would collide across every contract that
    // company wins (awards are unique per source and external id).
    externalId,
    winnerName,
    winnerCity: aligned(cities) ? (cities[0] ?? null) : null,
    // A single value is unambiguous; several belong to several lots and
    // picking one would misstate the contract.
    awardValueNet: values.length === 1 ? parseMoney(values[0] ?? null) : null,
    currency: readCurrency(readFirst(payload, 'tender-value-cur')),
    awardDate: parseDateOnly(decisionDates[0] ?? null),
    bidderCount: readBidderCount(payload),
    sourceUrl,
  };
}

/**
 * Number of tenders received.
 *
 * eForms publishes counts as code/value pairs (`tenders`, `t-sme`, …), one
 * set per lot. Only a notice with exactly one `tenders` entry gives an
 * unambiguous figure; with several lots the counts differ per lot and no
 * single number is correct.
 */
function readBidderCount(payload: Record<string, unknown>): number | null {
  const codes = readArray(payload, 'received-submissions-type-code');
  const values = readArray(payload, 'received-submissions-type-val');
  if (codes.length === 0 || codes.length !== values.length) return null;

  const totals = codes
    .map((code, index) => (code === 'tenders' ? (values[index] ?? null) : null))
    .filter((value): value is string => value !== null);

  if (totals.length !== 1) return null;

  // Zero is not a bidder count the model can hold: `awards` requires a
  // positive number, and "no tenders received" is not what this field means.
  const parsed = Number.parseInt(totals[0] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Contract duration in whole months, when TED states one unambiguously. */
function readDurationMonths(payload: Record<string, unknown>): number | null {
  const values = readArray(payload, 'duration-period-value-lot');
  const units = readArray(payload, 'duration-period-unit-lot');
  if (values.length !== 1 || units.length !== 1) return null;

  const factor = MONTHS_PER_UNIT[(units[0] ?? '').toUpperCase()];
  if (factor === undefined) return null;

  const amount = Number.parseInt(values[0] ?? '', 10);
  return Number.isFinite(amount) && amount > 0 ? amount * factor : null;
}

/** The first German NUTS code stated, which fixes the federal state. */
function readRegionCode(payload: Record<string, unknown>): string | null {
  for (const code of readArray(payload, 'place-of-performance')) {
    const region = nutsToRegionCode(code);
    if (region !== null) return region;
  }
  return null;
}

/**
 * Place of performance, preferring the lot level TED actually populates.
 *
 * Read through the localized reader in both cases: TED publishes these terms
 * as a plain array for most notices and as a language dictionary for the
 * older, translated ones, and the reader handles either.
 */
function readPerformanceValue(
  payload: Record<string, unknown>,
  lotKey: string,
  procKey: string,
): string | null {
  return readLocalizedFirst(payload, lotKey) ?? readLocalizedFirst(payload, procKey);
}

// --- Mapper ----------------------------------------------------------------

export const tedEformsMapper: TenderMapper = {
  sourceKey: 'ted-eforms',
  version: MAPPER_VERSION,

  map(payload: Record<string, unknown>, context: MapperContext): TenderDraft {
    const externalId = readScalarString(payload, 'publication-number');
    if (externalId === null) {
      throw new Error('Pflichtfeld "publication-number" fehlt oder ist leer');
    }

    // `title-proc` is the buyer's own wording; `notice-title` is TED's
    // generated headline ("Deutschland – Bewachungsdienste – …"). Prefer the
    // buyer's, fall back to TED's rather than dropping the record.
    const title =
      readLocalizedFirst(payload, 'title-proc') ??
      readLocalizedFirst(payload, 'notice-title');
    if (title === null) {
      throw new Error('Bekanntmachung ohne Titel (title-proc und notice-title fehlen)');
    }

    const cpvCodes = [...new Set(readArray(payload, 'classification-cpv'))];
    const status = mapStatus(payload);

    const noticeLanguage =
      readLocalizedArray(payload, 'title-proc').language ??
      readLocalizedArray(payload, 'notice-title').language;
    const officialLanguage = readFirst(payload, 'official-language');

    // The buyer's own submission portal is the link a bidder needs; the TED
    // notice page is the fallback when the notice does not name one.
    const submissionUrl = readFirst(payload, 'submission-url-lot');
    const noticeUrl = `https://ted.europa.eu/de/notice/-/detail/${externalId}`;

    const countryAlpha3 = readPerformanceValue(
      payload,
      'place-of-performance-country-lot',
      'place-of-performance-country-proc',
    );

    const description = readLocalizedFirst(payload, 'description-proc');
    const lotDescriptions = readLocalizedArray(payload, 'description-lot').values;

    return {
      externalId,
      title,
      // eForms has no teaser field. The lot description is the closest thing
      // to one when the procedure-level description is only a repeated title.
      summary: description ?? lotDescriptions[0] ?? null,
      description: description ?? (lotDescriptions.length > 0 ? lotDescriptions.join('\n\n') : null),
      // TED's publication number is the reference a buyer quotes back.
      referenceNumber: readScalarString(payload, 'notice-identifier'),
      procurementType: mapProcurementType(payload),
      procedureType: mapProcedureType(payload, context, externalId),
      cpvCodes,
      sectors: findSectorsForCpvCodes(cpvCodes),
      nutsCodes: [...new Set(readArray(payload, 'place-of-performance'))],
      countryCode: alpha3ToAlpha2(countryAlpha3),
      regionCode: readRegionCode(payload),
      city: readPerformanceValue(
        payload,
        'place-of-performance-city-lot',
        'place-of-performance-city-proc',
      ),
      postalCode: readPerformanceValue(
        payload,
        'place-of-performance-post-code-lot',
        'place-of-performance-post-code-proc',
      ),
      publicationDate: parseTimestamp(readScalarString(payload, 'publication-date')),
      submissionDeadline: earliestDateTime(
        payload,
        'deadline-receipt-tender-date-lot',
        'deadline-receipt-tender-time-lot',
      ),
      // eForms has no question deadline term, and the tender validity period
      // is stated as a duration without a start date — neither can be filled
      // without inventing a date. Both stay empty.
      questionDeadline: null,
      bindingPeriodEnd: null,
      contractStart: parseDateOnly(readFirst(payload, 'contract-duration-start-date-lot')),
      contractEnd: parseDateOnly(readFirst(payload, 'contract-duration-end-date-lot')),
      durationMonths: readDurationMonths(payload),
      estimatedValueNet: parseMoney(
        readScalarString(payload, 'estimated-value-proc') ??
          readFirst(payload, 'estimated-value-proc'),
      ),
      currency: readCurrency(
        readFirst(payload, 'estimated-value-cur-proc'),
        readFirst(payload, 'estimated-value-cur-lot'),
      ),
      status,
      sourceUrl: submissionUrl ?? noticeUrl,
      originalLanguage: mapLanguage(
        [noticeLanguage, officialLanguage],
        context,
        externalId,
      ),
      // Terms with no home in the unified model. Kept so the detail view and
      // later phases can use them without re-reading the raw import.
      sourceExtras: {
        tedNoticeType: readScalarString(payload, 'notice-type'),
        tedFormType: readScalarString(payload, 'form-type'),
        tedProcedureType: readScalarString(payload, 'procedure-type'),
        tedNoticeUrl: noticeUrl,
        tedSubmissionUrl: submissionUrl,
        tedOfficialLanguages: readArray(payload, 'official-language'),
        tedBuyerLegalTypes: readArray(payload, 'buyer-legal-type'),
        tedRequestDeadline: earliestDateTime(
          payload,
          'deadline-receipt-request-date-lot',
          'deadline-receipt-request-time-lot',
        ),
        tedExpressionDeadline: earliestDateTime(
          payload,
          'deadline-receipt-expressions-date-lot',
          'deadline-receipt-expressions-time-lot',
        ),
        tedWinners: readLocalizedArray(payload, 'winner-name').values,
        tedWinnerIdentifiers: readArray(payload, 'winner-identifier'),
        tedTenderValues: readArray(payload, 'tender-value'),
      },
      authority: mapAuthority(payload),
      lots: mapLots(payload, cpvCodes),
      // eForms exclusion and selection criteria are not part of the search
      // response; extracting them from the notice XML belongs to phase 3.
      requirements: [],
      documents: mapDocuments(payload),
      award: status === 'awarded' ? mapAward(payload, externalId, noticeUrl) : null,
    };
  },
};
