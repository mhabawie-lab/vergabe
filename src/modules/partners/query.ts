/**
 * Filters for the Subunternehmer-Radar screens.
 *
 * Same approach as the tender and reference queries: one schema shared by the
 * UI and both storage adapters, parsed leniently so a bad URL parameter falls
 * back to its default instead of breaking the page.
 */

import { z } from 'zod';
import {
  MATCH_STATUSES,
  NEED_STATUSES,
  PARTNER_SERVICE_CATEGORIES,
  PARTNER_STATUSES,
  RELATIONSHIP_DIRECTIONS,
  SIGNAL_STATUSES,
  SIGNAL_TYPES,
  VERIFICATION_STATUSES,
} from '@/types/partner';

export const DEFAULT_PARTNER_PAGE_SIZE = 25;
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

const optionalPositiveInt = z.coerce
  .number()
  .int()
  .min(0)
  .optional()
  .catch(undefined);

const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')
  .optional()
  .catch(undefined);

/** What state a partner's credentials are in — drives the list filter. */
export const CREDENTIAL_FILTER_STATES = [
  'valid',
  'expiring',
  'expired',
  'pending',
  'missing',
] as const;

export type CredentialFilterState = (typeof CREDENTIAL_FILTER_STATES)[number];

export const CREDENTIAL_FILTER_LABELS: Record<CredentialFilterState, string> = {
  valid: 'Gültige Nachweise',
  expiring: 'Läuft in 90 Tagen ab',
  expired: 'Abgelaufen',
  pending: 'Ungeprüfte Dokumente',
  missing: 'Kein anerkannter Nachweis',
};

export const partnerQuerySchema = z.object({
  q: optionalTrimmed,
  directions: csvArray,
  statuses: csvArray,
  services: csvArray,
  verifications: csvArray,
  country: optionalTrimmed,
  region: optionalTrimmed,
  city: optionalTrimmed,
  minRadiusKm: optionalPositiveInt,
  datacenter: z
    .enum(['confirmed', 'claimed', 'none', 'unknown'])
    .optional()
    .catch(undefined),
  minAvailableStaff: optionalPositiveInt,
  availableOn: optionalIsoDate,
  credentialState: z.enum(CREDENTIAL_FILTER_STATES).optional().catch(undefined),
  /** `demand` = currently looking for a subcontractor, judged by open signals. */
  demand: booleanFlag,
  preferred: booleanFlag,
  blocked: booleanFlag,
  includeArchived: booleanFlag,
  lastContactBefore: optionalIsoDate,
  followUpBefore: optionalIsoDate,
  sort: z
    .enum(['legal_name', 'status', 'last_contact', 'follow_up', 'created_at'])
    .catch('legal_name'),
  direction: z.enum(['asc', 'desc']).catch('asc'),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .catch(DEFAULT_PARTNER_PAGE_SIZE),
});

export type PartnerQuery = z.infer<typeof partnerQuerySchema>;

export const PARTNER_SORT_LABELS: Record<PartnerQuery['sort'], string> = {
  legal_name: 'Firmenname',
  status: 'Status',
  last_contact: 'Letzter Kontakt',
  follow_up: 'Nächste Wiedervorlage',
  created_at: 'Zuletzt angelegt',
};

export const signalQuerySchema = z.object({
  q: optionalTrimmed,
  types: csvArray,
  statuses: csvArray,
  services: csvArray,
  /** Only the "company is looking for a subcontractor" family. */
  demandOnly: booleanFlag,
  includeExpired: booleanFlag,
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .catch(DEFAULT_PARTNER_PAGE_SIZE),
});

export type SignalQuery = z.infer<typeof signalQuerySchema>;

export const needQuerySchema = z.object({
  q: optionalTrimmed,
  statuses: csvArray,
  services: csvArray,
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .catch(DEFAULT_PARTNER_PAGE_SIZE),
});

export type NeedQuery = z.infer<typeof needQuerySchema>;

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function parsePartnerQuery(params: RawSearchParams): PartnerQuery {
  return partnerQuerySchema.parse(params);
}

export function parseSignalQuery(params: RawSearchParams): SignalQuery {
  return signalQuerySchema.parse(params);
}

export function parseNeedQuery(params: RawSearchParams): NeedQuery {
  return needQuerySchema.parse(params);
}

export function countActivePartnerFilters(query: PartnerQuery): number {
  return [
    query.q,
    query.directions?.length ? query.directions : undefined,
    query.statuses?.length ? query.statuses : undefined,
    query.services?.length ? query.services : undefined,
    query.verifications?.length ? query.verifications : undefined,
    query.country,
    query.region,
    query.city,
    query.minRadiusKm,
    query.datacenter,
    query.minAvailableStaff,
    query.availableOn,
    query.credentialState,
    query.demand,
    query.preferred,
    query.blocked,
    query.lastContactBefore,
    query.followUpBefore,
  ].filter((value) => value !== undefined).length;
}

/** Serialises a partner query back into URL parameters, dropping defaults. */
export function partnerQueryToParams(query: Partial<PartnerQuery>): URLSearchParams {
  const params = new URLSearchParams();
  const setValue = (key: string, value: string | undefined): void => {
    if (value !== undefined && value.length > 0) params.set(key, value);
  };
  const setList = (key: string, value: string[] | undefined): void => {
    if (value !== undefined && value.length > 0) params.set(key, value.join(','));
  };
  const setFlag = (key: string, value: boolean | undefined): void => {
    if (value !== undefined) params.set(key, value ? 'true' : 'false');
  };
  const setNumber = (key: string, value: number | undefined): void => {
    if (value !== undefined) params.set(key, String(value));
  };

  setValue('q', query.q);
  setList('directions', query.directions);
  setList('statuses', query.statuses);
  setList('services', query.services);
  setList('verifications', query.verifications);
  setValue('country', query.country);
  setValue('region', query.region);
  setValue('city', query.city);
  setNumber('minRadiusKm', query.minRadiusKm);
  setValue('datacenter', query.datacenter);
  setNumber('minAvailableStaff', query.minAvailableStaff);
  setValue('availableOn', query.availableOn);
  setValue('credentialState', query.credentialState);
  setFlag('demand', query.demand);
  setFlag('preferred', query.preferred);
  setFlag('blocked', query.blocked);
  setFlag('includeArchived', query.includeArchived);
  setValue('lastContactBefore', query.lastContactBefore);
  setValue('followUpBefore', query.followUpBefore);

  if (query.sort !== undefined && query.sort !== 'legal_name') {
    params.set('sort', query.sort);
  }
  if (query.direction !== undefined && query.direction !== 'asc') {
    params.set('direction', query.direction);
  }
  if (query.page !== undefined && query.page > 1) params.set('page', String(query.page));
  return params;
}

export function signalQueryToParams(query: Partial<SignalQuery>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q !== undefined) params.set('q', query.q);
  if (query.types?.length) params.set('types', query.types.join(','));
  if (query.statuses?.length) params.set('statuses', query.statuses.join(','));
  if (query.services?.length) params.set('services', query.services.join(','));
  if (query.demandOnly !== undefined) {
    params.set('demandOnly', query.demandOnly ? 'true' : 'false');
  }
  if (query.includeExpired !== undefined) {
    params.set('includeExpired', query.includeExpired ? 'true' : 'false');
  }
  if (query.page !== undefined && query.page > 1) params.set('page', String(query.page));
  return params;
}

export function needQueryToParams(query: Partial<NeedQuery>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q !== undefined) params.set('q', query.q);
  if (query.statuses?.length) params.set('statuses', query.statuses.join(','));
  if (query.services?.length) params.set('services', query.services.join(','));
  if (query.page !== undefined && query.page > 1) params.set('page', String(query.page));
  return params;
}

export function isPartnerServiceCategory(value: string): boolean {
  return (PARTNER_SERVICE_CATEGORIES as readonly string[]).includes(value);
}

export function isPartnerStatus(value: string): boolean {
  return (PARTNER_STATUSES as readonly string[]).includes(value);
}

export function isRelationshipDirection(value: string): boolean {
  return (RELATIONSHIP_DIRECTIONS as readonly string[]).includes(value);
}

export function isVerificationStatus(value: string): boolean {
  return (VERIFICATION_STATUSES as readonly string[]).includes(value);
}

export function isSignalType(value: string): boolean {
  return (SIGNAL_TYPES as readonly string[]).includes(value);
}

export function isSignalStatus(value: string): boolean {
  return (SIGNAL_STATUSES as readonly string[]).includes(value);
}

export function isNeedStatus(value: string): boolean {
  return (NEED_STATUSES as readonly string[]).includes(value);
}

export function isMatchStatus(value: string): boolean {
  return (MATCH_STATUSES as readonly string[]).includes(value);
}
