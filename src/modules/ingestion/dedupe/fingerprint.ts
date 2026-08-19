/**
 * Hashing for change detection and cross-source duplicate detection.
 *
 * Two different hashes serve two different jobs:
 *
 *  - `hashPayload` fingerprints the *raw* payload. An identical hash means
 *    the source redelivered a record unchanged, so the runner skips it.
 *  - `buildTenderFingerprint` fingerprints the *normalised* content. Two
 *    tenders from different portals describing the same procurement produce
 *    the same fingerprint, which is what makes them findable as duplicates
 *    (CLAUDE.md § Rohdaten & Normalisierung).
 *
 * Server-only: uses node:crypto.
 */

import { createHash } from 'node:crypto';

/** Stable JSON: object keys are sorted so key order cannot change the hash. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }
  return value;
}

export function hashPayload(payload: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex');
}

/**
 * Normalises free text for comparison: lowercased, accent-folded,
 * punctuation removed, whitespace collapsed.
 */
export function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface FingerprintInput {
  title: string;
  authorityName: string | null;
  submissionDeadline: string | null;
  estimatedValueNet: number | null;
}

/**
 * Content fingerprint of a normalised tender.
 *
 * Only the deadline's calendar day is used: portals routinely differ on the
 * exact cut-off time for the same procurement, and including it would hide
 * genuine duplicates.
 */
export function buildTenderFingerprint(input: FingerprintInput): string {
  const deadlineDay =
    input.submissionDeadline === null
      ? ''
      : (input.submissionDeadline.split('T')[0] ?? '');

  const parts = [
    normalizeForComparison(input.title),
    input.authorityName === null ? '' : normalizeForComparison(input.authorityName),
    deadlineDay,
    input.estimatedValueNet === null ? '' : input.estimatedValueNet.toFixed(2),
  ];

  return createHash('sha256').update(parts.join('|')).digest('hex');
}

/**
 * Dedupe key for a contracting authority: normalised name plus city, so the
 * same body arriving from two portals maps onto one record.
 */
export function buildAuthorityDedupeKey(
  name: string,
  city: string | null,
): string {
  const normalizedName = normalizeForComparison(name);
  const normalizedCity = city === null ? '' : normalizeForComparison(city);
  return `${normalizedName}|${normalizedCity}`;
}
