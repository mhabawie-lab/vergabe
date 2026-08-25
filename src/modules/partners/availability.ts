/**
 * Availability and how quickly it goes stale.
 *
 * A partner who said "twelve people free" in March is not evidence of twelve
 * people free in September. Availability therefore carries the moment it was
 * last confirmed, and everything downstream — the list, the filters, the match
 * engine — treats an old entry as *unknown* rather than as current.
 */

import {
  type AvailabilityStatus,
  type PartnerAvailability,
  type PartnerServiceCategory,
} from '@/types/partner';

/**
 * After this many days an availability entry is no longer treated as current.
 *
 * Six weeks is the operational rhythm of this business: staffing plans are
 * made monthly, so anything older than that has usually been overtaken.
 */
export const AVAILABILITY_STALE_AFTER_DAYS = 42;

/** Warn before it goes stale, so somebody can call and re-confirm. */
export const AVAILABILITY_AGEING_AFTER_DAYS = 28;

export const AVAILABILITY_FRESHNESS = ['fresh', 'ageing', 'stale', 'never'] as const;
export type AvailabilityFreshness = (typeof AVAILABILITY_FRESHNESS)[number];

export const AVAILABILITY_FRESHNESS_LABELS: Record<AvailabilityFreshness, string> = {
  fresh: 'Aktuell bestätigt',
  ageing: 'Bestätigung wird älter',
  stale: 'Seit Langem nicht bestätigt',
  never: 'Nie bestätigt',
};

export const AVAILABILITY_FRESHNESS_DESCRIPTIONS: Record<
  AvailabilityFreshness,
  string
> = {
  fresh: 'Die Angabe wurde in den letzten vier Wochen bestätigt.',
  ageing:
    'Die Bestätigung liegt mehr als vier Wochen zurück. Bitte nachfassen.',
  stale:
    'Die Bestätigung liegt mehr als sechs Wochen zurück. Die Angabe gilt nicht mehr als aktuell.',
  never:
    'Die Angabe wurde nie bestätigt. Sie gilt nicht als aktuelle Verfügbarkeit.',
};

function daysBetween(from: string, today: Date): number {
  const then = new Date(from).getTime();
  return Math.floor((today.getTime() - then) / 86_400_000);
}

export function availabilityFreshness(
  availability: Pick<PartnerAvailability, 'lastConfirmedAt'>,
  today: Date = new Date(),
): AvailabilityFreshness {
  if (availability.lastConfirmedAt === null) return 'never';

  const age = daysBetween(availability.lastConfirmedAt, today);
  if (age <= AVAILABILITY_AGEING_AFTER_DAYS) return 'fresh';
  if (age <= AVAILABILITY_STALE_AFTER_DAYS) return 'ageing';
  return 'stale';
}

/**
 * Whether an entry may be treated as a current statement.
 *
 * Stale and never-confirmed entries stay visible — they are still the last
 * thing we know — but they do not count as availability.
 */
export function countsAsCurrent(
  availability: Pick<PartnerAvailability, 'lastConfirmedAt'>,
  today: Date = new Date(),
): boolean {
  const freshness = availabilityFreshness(availability, today);
  return freshness === 'fresh' || freshness === 'ageing';
}

/** True when the stated window contains the day. Open ends match everything. */
export function coversDate(
  availability: Pick<PartnerAvailability, 'availableFrom' | 'availableUntil'>,
  day: string,
): boolean {
  if (availability.availableFrom !== null && availability.availableFrom > day) {
    return false;
  }
  if (availability.availableUntil !== null && availability.availableUntil < day) {
    return false;
  }
  return true;
}

export interface AvailabilityAssessment {
  /** The entry that applies, or null when nothing usable was found. */
  entry: PartnerAvailability | null;
  freshness: AvailabilityFreshness;
  status: AvailabilityStatus;
  /** Staff the entry states, only when it still counts as current. */
  availableStaff: number | null;
  /** Human-readable reason, used verbatim in the match explanation. */
  reason: string;
}

/**
 * Picks the availability entry that applies to a service on a day.
 *
 * Prefers an entry for the exact service over a general one, and a fresher
 * entry over an older one. Returns why, so the match explanation can quote it
 * instead of inventing its own wording.
 */
export function assessAvailability(
  entries: readonly PartnerAvailability[],
  options: {
    serviceCategory: PartnerServiceCategory | null;
    day: string | null;
    today?: Date;
  },
): AvailabilityAssessment {
  const today = options.today ?? new Date();

  const candidates = entries
    .filter((entry) => options.day === null || coversDate(entry, options.day))
    .filter(
      (entry) =>
        options.serviceCategory === null ||
        entry.serviceCategory === null ||
        entry.serviceCategory === options.serviceCategory,
    );

  if (candidates.length === 0) {
    return {
      entry: null,
      freshness: 'never',
      status: 'unknown',
      availableStaff: null,
      reason: 'Keine Verfügbarkeitsangabe für diesen Zeitraum hinterlegt.',
    };
  }

  const ranked = [...candidates].sort((a, b) => {
    const exactA = a.serviceCategory === options.serviceCategory ? 0 : 1;
    const exactB = b.serviceCategory === options.serviceCategory ? 0 : 1;
    if (exactA !== exactB) return exactA - exactB;
    return (b.lastConfirmedAt ?? '').localeCompare(a.lastConfirmedAt ?? '');
  });

  const entry = ranked[0];
  if (entry === undefined) {
    return {
      entry: null,
      freshness: 'never',
      status: 'unknown',
      availableStaff: null,
      reason: 'Keine Verfügbarkeitsangabe für diesen Zeitraum hinterlegt.',
    };
  }

  const freshness = availabilityFreshness(entry, today);
  const current = countsAsCurrent(entry, today);

  return {
    entry,
    freshness,
    // An outdated statement is reported as unknown, not as its old value.
    status: current ? entry.status : 'unknown',
    availableStaff: current ? entry.availableStaff : null,
    reason: current
      ? `Verfügbarkeit „${entry.status}" — ${AVAILABILITY_FRESHNESS_LABELS[freshness].toLowerCase()}.`
      : `Die Angabe wurde zuletzt vor über ${AVAILABILITY_STALE_AFTER_DAYS} Tagen bestätigt und gilt nicht mehr als aktuell.`,
  };
}
