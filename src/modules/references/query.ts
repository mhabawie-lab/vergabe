/**
 * Filters for the customer and reference screens.
 *
 * Same approach as the tender search: one schema shared by the UI and both
 * storage adapters, parsed leniently so a bad URL parameter falls back to its
 * default instead of breaking the page.
 */

import { z } from 'zod';
import {
  REFERENCE_PROJECT_STATUSES,
  REFERENCE_SERVICE_CATEGORIES,
} from '@/types/reference';

export const DEFAULT_REFERENCE_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const optionalTrimmed = z.string().trim().min(1).optional().catch(undefined);

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
  })
  .optional()
  .catch(undefined);

const optionalIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export const clientQuerySchema = z.object({
  q: optionalTrimmed,
  /** `active` | `inactive`; anything else means "all". */
  status: z.enum(['active', 'inactive']).optional().catch(undefined),
  city: optionalTrimmed,
  services: csvArray,
  sort: z.enum(['name', 'projects', 'last_project']).catch('name'),
  direction: z.enum(['asc', 'desc']).catch('asc'),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .catch(DEFAULT_REFERENCE_PAGE_SIZE),
});

export type ClientQuery = z.infer<typeof clientQuerySchema>;

export const CLIENT_SORT_LABELS: Record<ClientQuery['sort'], string> = {
  name: 'Name',
  projects: 'Anzahl Projekte',
  last_project: 'Letzter Projektzeitraum',
};

// ---------------------------------------------------------------------------
// Reference projects
// ---------------------------------------------------------------------------

export const referenceQuerySchema = z.object({
  q: optionalTrimmed,
  clientId: optionalTrimmed,
  city: optionalTrimmed,
  region: optionalTrimmed,
  objectType: optionalTrimmed,
  services: csvArray,
  statuses: csvArray,
  /** `confirmed` = every service decided, `open` = at least one proposal. */
  referenceStatus: z.enum(['confirmed', 'open']).optional().catch(undefined),
  /**
   * Confirmation state of the services.
   * `evidence` = at least one confirmed service, `proposed` = only untouched
   * proposals, `undecided` = at least one open proposal.
   */
  confirmationStatus: z
    .enum(['evidence', 'proposed', 'undecided'])
    .optional()
    .catch(undefined),
  periodFrom: optionalIsoDate,
  periodTo: optionalIsoDate,
  sort: z.enum(['project_name', 'start_date', 'client']).catch('start_date'),
  direction: z.enum(['asc', 'desc']).catch('desc'),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .catch(DEFAULT_REFERENCE_PAGE_SIZE),
});

export type ReferenceQuery = z.infer<typeof referenceQuerySchema>;

export const REFERENCE_SORT_LABELS: Record<ReferenceQuery['sort'], string> = {
  project_name: 'Projektname',
  start_date: 'Projektbeginn',
  client: 'Kunde',
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseClientQuery(params: RawSearchParams): ClientQuery {
  return clientQuerySchema.parse(params);
}

export function parseReferenceQuery(params: RawSearchParams): ReferenceQuery {
  return referenceQuerySchema.parse(params);
}

export function countActiveClientFilters(query: ClientQuery): number {
  return [
    query.q,
    query.status,
    query.city,
    query.services?.length ? query.services : undefined,
  ].filter((value) => value !== undefined).length;
}

export function countActiveReferenceFilters(query: ReferenceQuery): number {
  return [
    query.q,
    query.clientId,
    query.city,
    query.region,
    query.objectType,
    query.services?.length ? query.services : undefined,
    query.statuses?.length ? query.statuses : undefined,
    query.referenceStatus,
    query.confirmationStatus,
    query.periodFrom,
    query.periodTo,
  ].filter((value) => value !== undefined).length;
}

/** Serialises a client query back into URL parameters, dropping defaults. */
export function clientQueryToParams(query: Partial<ClientQuery>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q !== undefined) params.set('q', query.q);
  if (query.status !== undefined) params.set('status', query.status);
  if (query.city !== undefined) params.set('city', query.city);
  if (query.services !== undefined && query.services.length > 0) {
    params.set('services', query.services.join(','));
  }
  if (query.sort !== undefined && query.sort !== 'name') params.set('sort', query.sort);
  if (query.direction !== undefined && query.direction !== 'asc') {
    params.set('direction', query.direction);
  }
  if (query.page !== undefined && query.page > 1) params.set('page', String(query.page));
  return params;
}

/** Serialises a reference query back into URL parameters, dropping defaults. */
export function referenceQueryToParams(
  query: Partial<ReferenceQuery>,
): URLSearchParams {
  const params = new URLSearchParams();
  const setValue = (key: string, value: string | undefined): void => {
    if (value !== undefined && value.length > 0) params.set(key, value);
  };

  setValue('q', query.q);
  setValue('clientId', query.clientId);
  setValue('city', query.city);
  setValue('region', query.region);
  setValue('objectType', query.objectType);
  setValue('referenceStatus', query.referenceStatus);
  setValue('confirmationStatus', query.confirmationStatus);
  setValue('periodFrom', query.periodFrom);
  setValue('periodTo', query.periodTo);
  if (query.services !== undefined && query.services.length > 0) {
    params.set('services', query.services.join(','));
  }
  if (query.statuses !== undefined && query.statuses.length > 0) {
    params.set('statuses', query.statuses.join(','));
  }
  if (query.sort !== undefined && query.sort !== 'start_date') {
    params.set('sort', query.sort);
  }
  if (query.direction !== undefined && query.direction !== 'desc') {
    params.set('direction', query.direction);
  }
  if (query.page !== undefined && query.page > 1) params.set('page', String(query.page));
  return params;
}

export function isServiceCategory(value: string): boolean {
  return (REFERENCE_SERVICE_CATEGORIES as readonly string[]).includes(value);
}

export function isProjectStatus(value: string): boolean {
  return (REFERENCE_PROJECT_STATUSES as readonly string[]).includes(value);
}

export const CONFIRMATION_FILTER_LABELS: Record<
  NonNullable<ReferenceQuery['confirmationStatus']>,
  string
> = {
  evidence: 'Mit bestätigter Leistung',
  proposed: 'Nur Vorschläge',
  undecided: 'Offene Vorschläge vorhanden',
};
