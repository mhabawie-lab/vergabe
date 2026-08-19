/**
 * Tender search query.
 *
 * One schema shared by the search UI, the API route and both storage
 * adapters, so a filter cannot drift between them. Parsing is lenient by
 * design: an unusable URL parameter falls back to its default instead of
 * failing the page.
 */

import { z } from 'zod';
import { TENDER_STATUSES } from '@/types/tender';

export const TENDER_SORT_FIELDS = [
  'publication_date',
  'submission_deadline',
  'estimated_value',
  'relevance',
] as const;

export type TenderSortField = (typeof TENDER_SORT_FIELDS)[number];

export const TENDER_SORT_LABELS: Record<TenderSortField, string> = {
  publication_date: 'Veröffentlichung',
  submission_deadline: 'Angebotsfrist',
  estimated_value: 'Auftragswert',
  relevance: 'Relevanz',
};

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Splits a repeatable, comma-separated parameter into distinct values. */
const csvArray = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => {
    const raw = Array.isArray(value) ? value : [value];
    return [
      ...new Set(
        raw
          .flatMap((entry) => entry.split(','))
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ),
    ];
  });

const optionalCsvArray = csvArray.optional().catch(undefined);

const optionalTrimmedString = z
  .string()
  .trim()
  .min(1)
  .optional()
  .catch(undefined);

const optionalPositiveNumber = z.coerce
  .number()
  .nonnegative()
  .optional()
  .catch(undefined);

/** ISO date (YYYY-MM-DD) as delivered by `<input type="date">`. */
const optionalIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

export const tenderSearchQuerySchema = z.object({
  /** Full-text query across title, reference number, summary and description. */
  q: optionalTrimmedString,
  sectors: optionalCsvArray,
  cpv: optionalCsvArray,
  countries: optionalCsvArray,
  regions: optionalCsvArray,
  city: optionalTrimmedString,
  authorityId: optionalTrimmedString,
  sources: optionalCsvArray,
  statuses: optionalCsvArray,
  valueMin: optionalPositiveNumber,
  valueMax: optionalPositiveNumber,
  publishedFrom: optionalIsoDate,
  publishedTo: optionalIsoDate,
  deadlineFrom: optionalIsoDate,
  deadlineTo: optionalIsoDate,
  durationMinMonths: optionalPositiveNumber,
  durationMaxMonths: optionalPositiveNumber,
  /** Restrict to tenders whose deadline has not passed. */
  openOnly: z.coerce.boolean().optional().catch(undefined),
  sort: z.enum(TENDER_SORT_FIELDS).catch('publication_date'),
  direction: z.enum(['asc', 'desc']).catch('desc'),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).catch(DEFAULT_PAGE_SIZE),
});

export type TenderSearchQuery = z.infer<typeof tenderSearchQuerySchema>;

/** Query parameters as delivered by a Next.js server page. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseTenderSearchQuery(params: RawSearchParams): TenderSearchQuery {
  return tenderSearchQuerySchema.parse(params);
}

/** Number of active filters, used for the "Filter zurücksetzen" affordance. */
export function countActiveFilters(query: TenderSearchQuery): number {
  const filters: Array<unknown> = [
    query.q,
    query.sectors?.length ? query.sectors : undefined,
    query.cpv?.length ? query.cpv : undefined,
    query.countries?.length ? query.countries : undefined,
    query.regions?.length ? query.regions : undefined,
    query.city,
    query.authorityId,
    query.sources?.length ? query.sources : undefined,
    query.statuses?.length ? query.statuses : undefined,
    query.valueMin,
    query.valueMax,
    query.publishedFrom,
    query.publishedTo,
    query.deadlineFrom,
    query.deadlineTo,
    query.durationMinMonths,
    query.durationMaxMonths,
    query.openOnly === true ? true : undefined,
  ];

  return filters.filter((value) => value !== undefined).length;
}

/** Serialises a query back into URL parameters, dropping defaults. */
export function toSearchParams(query: Partial<TenderSearchQuery>): URLSearchParams {
  const params = new URLSearchParams();

  const setValue = (key: string, value: string | undefined): void => {
    if (value !== undefined && value.length > 0) params.set(key, value);
  };

  const setList = (key: string, value: string[] | undefined): void => {
    if (value !== undefined && value.length > 0) params.set(key, value.join(','));
  };

  setValue('q', query.q);
  setList('sectors', query.sectors);
  setList('cpv', query.cpv);
  setList('countries', query.countries);
  setList('regions', query.regions);
  setValue('city', query.city);
  setValue('authorityId', query.authorityId);
  setList('sources', query.sources);
  setList('statuses', query.statuses);
  setValue('valueMin', query.valueMin?.toString());
  setValue('valueMax', query.valueMax?.toString());
  setValue('publishedFrom', query.publishedFrom);
  setValue('publishedTo', query.publishedTo);
  setValue('deadlineFrom', query.deadlineFrom);
  setValue('deadlineTo', query.deadlineTo);
  setValue('durationMinMonths', query.durationMinMonths?.toString());
  setValue('durationMaxMonths', query.durationMaxMonths?.toString());
  if (query.openOnly === true) params.set('openOnly', 'true');
  if (query.sort !== undefined && query.sort !== 'publication_date') {
    params.set('sort', query.sort);
  }
  if (query.direction !== undefined && query.direction !== 'desc') {
    params.set('direction', query.direction);
  }
  if (query.page !== undefined && query.page > 1) {
    params.set('page', String(query.page));
  }
  if (query.pageSize !== undefined && query.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set('pageSize', String(query.pageSize));
  }

  return params;
}

export function isTenderStatus(value: string): boolean {
  return (TENDER_STATUSES as readonly string[]).includes(value);
}
