/**
 * The eForms business terms this connector requests from TED.
 *
 * TED returns only the fields a request asks for, so this list defines what
 * ends up in `raw_imports.payload`. Two consequences worth knowing:
 *
 *  - Adding a field here changes the payload and therefore its hash, so the
 *    next run re-imports every notice once. That is intended: the raw record
 *    is meant to hold what the source delivered at that point in time.
 *  - Nothing here is interpreted. Which term becomes which internal field is
 *    decided in the mapper (CLAUDE.md § Architektur-Pipeline).
 *
 * Field names follow TED's own vocabulary; `-lot`, `-part` and `-proc`
 * suffixes mark the level a term is published at.
 */
export const TED_NOTICE_FIELDS: readonly string[] = [
  // --- Identity and provenance ---------------------------------------
  'publication-number',
  'notice-identifier',
  'notice-type',
  'form-type',
  'publication-date',
  'official-language',
  'change-notice-version-identifier',
  'links',

  // --- Content --------------------------------------------------------
  'notice-title',
  'title-proc',
  'description-proc',
  'identifier-lot',
  'title-lot',
  'description-lot',
  'classification-cpv',
  'contract-nature',
  'contract-nature-main-proc',
  'procedure-type',

  // --- Buyer ----------------------------------------------------------
  'buyer-name',
  'organisation-street-buyer',
  'buyer-city',
  'buyer-post-code',
  'buyer-country',
  'buyer-email',
  'buyer-internet-address',
  'buyer-legal-type',
  'buyer-identifier',

  // --- Place of performance -------------------------------------------
  'place-of-performance',
  'place-of-performance-city-lot',
  'place-of-performance-post-code-lot',
  'place-of-performance-country-lot',
  'place-of-performance-city-proc',
  'place-of-performance-post-code-proc',
  'place-of-performance-country-proc',

  // --- Dates and deadlines --------------------------------------------
  'deadline-receipt-tender-date-lot',
  'deadline-receipt-tender-time-lot',
  'deadline-receipt-request-date-lot',
  'deadline-receipt-request-time-lot',
  'deadline-receipt-expressions-date-lot',
  'deadline-receipt-expressions-time-lot',
  'contract-duration-start-date-lot',
  'contract-duration-end-date-lot',
  'duration-period-value-lot',
  'duration-period-unit-lot',
  'tender-validity-deadline-value-lot',
  'tender-validity-deadline-unit-lot',

  // --- Value ----------------------------------------------------------
  'estimated-value-proc',
  'estimated-value-cur-proc',
  'estimated-value-lot',
  'estimated-value-cur-lot',

  // --- Submission ------------------------------------------------------
  'submission-url-lot',
  'submission-language',

  // --- Result (award notices) ------------------------------------------
  'winner-name',
  'winner-city',
  'winner-country',
  'winner-identifier',
  'winner-decision-date',
  'tender-value',
  'tender-value-cur',
  'received-submissions-type-code',
  'received-submissions-type-val',
];
