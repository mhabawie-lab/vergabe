/**
 * Credential expiry and what counts as verified.
 *
 * The rule that drives everything here: a credential only counts when somebody
 * accepted it *and* it has not expired. An unreviewed document and an
 * undated one are both "not proof" — presenting either as valid would put a
 * partner in front of a client on paperwork nobody checked.
 *
 * Expiry dates are never estimated. A missing `validUntil` stays missing and
 * is reported as such, rather than being derived from the issue date.
 */

import {
  REQUIRED_CREDENTIAL_TYPES,
  type CredentialSummary,
  type CredentialType,
  type PartnerDocument,
  type PartnerQualification,
  type VerificationStatus,
} from '@/types/partner';

/** Warning horizons, in days. Ordered widest first. */
export const EXPIRY_HORIZONS = [90, 60, 30] as const;
export type ExpiryHorizon = (typeof EXPIRY_HORIZONS)[number];

export const CREDENTIAL_STATES = [
  'valid',
  'expiring',
  'expired',
  'pending',
  'rejected',
  'undated',
] as const;

export type CredentialState = (typeof CREDENTIAL_STATES)[number];

export const CREDENTIAL_STATE_LABELS: Record<CredentialState, string> = {
  valid: 'Gültig',
  expiring: 'Läuft bald ab',
  expired: 'Abgelaufen',
  pending: 'Ungeprüft',
  rejected: 'Abgelehnt',
  undated: 'Ohne Ablaufdatum',
};

export const CREDENTIAL_STATE_DESCRIPTIONS: Record<CredentialState, string> = {
  valid: 'Anerkannt und innerhalb der Gültigkeit.',
  expiring: 'Anerkannt, läuft aber innerhalb von 90 Tagen ab.',
  expired: 'Die Gültigkeit ist überschritten. Zählt nicht mehr als Nachweis.',
  pending: 'Noch niemand hat das Dokument geprüft. Zählt nicht als Nachweis.',
  rejected: 'Bei der Prüfung abgelehnt.',
  undated:
    'Es ist kein Ablaufdatum hinterlegt. Es wird keines geschätzt — der Nachweis gilt als nicht datiert.',
};

/** A credential in the shape both qualifications and documents share. */
export interface CredentialLike {
  credentialType: CredentialType;
  validUntil: string | null;
  reviewStatus: PartnerQualification['reviewStatus'];
}

function toDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

/** Whole days from `today` until the date. Negative once it has passed. */
export function daysUntil(value: string, today: Date): number {
  const target = toDate(value).getTime();
  const start = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.round((target - start) / 86_400_000);
}

/**
 * Classifies one credential.
 *
 * Review status is checked before the date: a document that expires next year
 * but that nobody looked at is `pending`, not `valid`.
 */
export function classifyCredential(
  credential: CredentialLike,
  today: Date = new Date(),
): CredentialState {
  if (credential.reviewStatus === 'rejected') return 'rejected';
  if (credential.reviewStatus === 'pending' || credential.reviewStatus === 'reviewed') {
    return 'pending';
  }

  if (credential.validUntil === null) return 'undated';

  const remaining = daysUntil(credential.validUntil, today);
  if (remaining < 0) return 'expired';
  if (remaining <= EXPIRY_HORIZONS[0]) return 'expiring';
  return 'valid';
}

/** True only for a credential that is accepted and not past its date. */
export function countsAsProof(
  credential: CredentialLike,
  today: Date = new Date(),
): boolean {
  const state = classifyCredential(credential, today);
  return state === 'valid' || state === 'expiring';
}

/** The narrowest horizon a credential falls into, or null. */
export function expiryHorizonOf(
  credential: CredentialLike,
  today: Date = new Date(),
): ExpiryHorizon | null {
  if (credential.validUntil === null) return null;
  if (credential.reviewStatus !== 'accepted') return null;

  const remaining = daysUntil(credential.validUntil, today);
  if (remaining < 0) return null;

  // Narrowest first, so a credential 20 days out reports 30 rather than 90.
  for (const horizon of [...EXPIRY_HORIZONS].reverse()) {
    if (remaining <= horizon) return horizon;
  }
  return null;
}

/**
 * Rolls a partner's credentials up for the list view.
 *
 * `missingRequired` names the credential types we insist on before putting a
 * partner in front of a client, so the gap is visible without opening the
 * company.
 */
export function summarizeCredentials(
  credentials: readonly CredentialLike[],
  today: Date = new Date(),
): CredentialSummary {
  let valid = 0;
  let expiringSoon = 0;
  let expired = 0;
  let pendingReview = 0;

  for (const credential of credentials) {
    switch (classifyCredential(credential, today)) {
      case 'valid':
        valid += 1;
        break;
      case 'expiring':
        expiringSoon += 1;
        break;
      case 'expired':
        expired += 1;
        break;
      case 'pending':
        pendingReview += 1;
        break;
      default:
        break;
    }
  }

  const proven = new Set(
    credentials
      .filter((credential) => countsAsProof(credential, today))
      .map((credential) => credential.credentialType),
  );

  return {
    valid,
    expiringSoon,
    expired,
    pendingReview,
    missingRequired: REQUIRED_CREDENTIAL_TYPES.filter((type) => !proven.has(type)),
  };
}

/**
 * What the verification status *would* be, given the credentials on file.
 *
 * Returned as a suggestion, never written automatically: whether a partner
 * counts as verified is a human judgement, and this function cannot see the
 * conversation that went with the paperwork. The UI shows it next to the
 * stored value when the two disagree.
 */
export function suggestVerificationStatus(
  credentials: readonly CredentialLike[],
  today: Date = new Date(),
): { suggested: VerificationStatus; reason: string } {
  if (credentials.length === 0) {
    return {
      suggested: 'unverified',
      reason: 'Es liegen keine Nachweise vor.',
    };
  }

  const summary = summarizeCredentials(credentials, today);

  if (summary.expired > 0 && summary.valid + summary.expiringSoon === 0) {
    return {
      suggested: 'expired',
      reason: 'Alle hinterlegten Nachweise sind abgelaufen.',
    };
  }

  if (summary.missingRequired.length > 0) {
    return {
      suggested: 'documents_reviewed',
      reason: `Es fehlen ${summary.missingRequired.length} Pflichtnachweise.`,
    };
  }

  if (summary.pendingReview > 0) {
    return {
      suggested: 'documents_reviewed',
      reason: `${summary.pendingReview} Dokumente sind noch ungeprüft.`,
    };
  }

  return {
    suggested: 'verified',
    reason: 'Alle Pflichtnachweise liegen anerkannt und gültig vor.',
  };
}

/** Groups credentials into the horizons the monitoring screen shows. */
export interface ExpiryBuckets<T> {
  expired: T[];
  within30: T[];
  within60: T[];
  within90: T[];
  pendingReview: T[];
  undated: T[];
}

export function bucketByExpiry<T extends CredentialLike>(
  credentials: readonly T[],
  today: Date = new Date(),
): ExpiryBuckets<T> {
  const buckets: ExpiryBuckets<T> = {
    expired: [],
    within30: [],
    within60: [],
    within90: [],
    pendingReview: [],
    undated: [],
  };

  for (const credential of credentials) {
    const state = classifyCredential(credential, today);

    if (state === 'pending') {
      buckets.pendingReview.push(credential);
      continue;
    }
    if (state === 'undated') {
      buckets.undated.push(credential);
      continue;
    }
    if (state === 'expired') {
      buckets.expired.push(credential);
      continue;
    }
    if (state !== 'expiring') continue;

    const horizon = expiryHorizonOf(credential, today);
    if (horizon === 30) buckets.within30.push(credential);
    else if (horizon === 60) buckets.within60.push(credential);
    else if (horizon === 90) buckets.within90.push(credential);
  }

  return buckets;
}

/** Adapts a stored qualification to the shared shape. */
export function qualificationAsCredential(
  qualification: PartnerQualification,
): CredentialLike {
  return {
    credentialType: qualification.credentialType,
    validUntil: qualification.validUntil,
    reviewStatus: qualification.reviewStatus,
  };
}

export function documentAsCredential(document: PartnerDocument): CredentialLike {
  return {
    credentialType: document.credentialType,
    validUntil: document.validUntil,
    reviewStatus: document.reviewStatus,
  };
}
