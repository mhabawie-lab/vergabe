/**
 * Validation for manually entered business clients.
 *
 * Shared by the form and the API route so both judge the same input the same
 * way — a client-side-only rule would be no rule at all.
 *
 * The duplicate check is deliberately a *warning*: two records with similar
 * names may well be two genuinely different companies, and merging customer
 * records on a guess is not reversible in any useful sense. The user decides.
 */

import { looksLikeSameValue, normalizeClientName } from './normalize';
import type { ValidationMessage } from '@/types/reference';

/** Enough for a long legal name, short enough to reject pasted junk. */
export const CLIENT_NAME_MAX_LENGTH = 200;
export const CLIENT_NOTES_MAX_LENGTH = 4000;
export const CLIENT_WEBSITE_MAX_LENGTH = 300;

export interface ClientFormInput {
  name: string;
  country: string | null;
  website: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface NormalizedClientInput {
  name: string;
  /** Comparison form; also what the unique constraint uses. */
  normalizedName: string;
  country: string | null;
  website: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface ClientValidationResult {
  normalized: NormalizedClientInput;
  messages: ValidationMessage[];
  /** True when nothing blocks saving. Warnings do not block. */
  valid: boolean;
}

/**
 * Collapses inner whitespace and trims.
 *
 * Case is deliberately *not* changed: "IBM" and "GmbH" carry meaning that
 * title-casing would destroy. Only the comparison form is case-folded.
 */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Normalises a website entry.
 *
 * Accepts a bare domain and prefixes `https://`, because that is what people
 * type. Returns null for an unusable value; the caller reports it.
 */
export function normalizeWebsite(
  value: string | null,
): { url: string | null; problem: string | null } {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return { url: null, problem: null };

  if (trimmed.length > CLIENT_WEBSITE_MAX_LENGTH) {
    return {
      url: null,
      problem: `Die Website darf höchstens ${CLIENT_WEBSITE_MAX_LENGTH} Zeichen lang sein.`,
    };
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { url: null, problem: 'Die Website ist keine gültige Adresse.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { url: null, problem: 'Nur http- und https-Adressen sind zulässig.' };
  }

  // A hostname without a dot is not reachable on the public internet and is
  // almost always a typo rather than an intranet host.
  if (!parsed.hostname.includes('.') || parsed.hostname.startsWith('.')) {
    return { url: null, problem: 'Der Hostname der Website sieht unvollständig aus.' };
  }

  return { url: parsed.toString(), problem: null };
}

/** An existing client, for the duplicate comparison. */
export interface ExistingClient {
  id: string;
  name: string;
  normalizedName: string;
}

/**
 * Validates a client form.
 *
 * @param existing other clients of the same organisation. Pass the record
 *        being edited too — it is skipped via `currentId`.
 */
export function validateClientInput(
  input: ClientFormInput,
  existing: readonly ExistingClient[],
  currentId: string | null = null,
): ClientValidationResult {
  const messages: ValidationMessage[] = [];

  const name = normalizeWhitespace(input.name);

  if (name.length === 0) {
    messages.push({
      severity: 'error',
      code: 'missing_name',
      field: 'name',
      message: 'Der Firmenname ist ein Pflichtfeld.',
      suggestion: null,
    });
  } else if (name.length > CLIENT_NAME_MAX_LENGTH) {
    messages.push({
      severity: 'error',
      code: 'name_too_long',
      field: 'name',
      message: `Der Firmenname darf höchstens ${CLIENT_NAME_MAX_LENGTH} Zeichen lang sein.`,
      suggestion: null,
    });
  }

  const normalizedName = name.length > 0 ? normalizeClientName(name) : '';

  const website = normalizeWebsite(input.website);
  if (website.problem !== null) {
    messages.push({
      severity: 'error',
      code: 'invalid_website',
      field: 'website',
      message: website.problem,
      suggestion: null,
    });
  }

  const country = input.country?.trim().toUpperCase() ?? '';
  if (country.length > 0 && !/^[A-Z]{2}$/.test(country)) {
    messages.push({
      severity: 'error',
      code: 'invalid_country',
      field: 'country',
      message: 'Das Land wird als zweistelliger Ländercode erwartet, z. B. DE.',
      suggestion: null,
    });
  }

  const notes = input.notes?.trim() ?? '';
  if (notes.length > CLIENT_NOTES_MAX_LENGTH) {
    messages.push({
      severity: 'error',
      code: 'notes_too_long',
      field: 'notes',
      message: `Die Notizen dürfen höchstens ${CLIENT_NOTES_MAX_LENGTH} Zeichen lang sein.`,
      suggestion: null,
    });
  }

  // --- Duplicates ---------------------------------------------------------
  if (normalizedName.length > 0) {
    const others = existing.filter((entry) => entry.id !== currentId);

    const exact = others.find((entry) => entry.normalizedName === normalizedName);
    if (exact !== undefined) {
      // The database unique constraint would reject this anyway, so it is an
      // error rather than a warning — but the message names the record so the
      // user can go and edit it instead.
      messages.push({
        severity: 'error',
        code: 'duplicate_client',
        field: 'name',
        message: `„${exact.name}" ist bereits als Kunde erfasst.`,
        suggestion: exact.name,
      });
    } else {
      const similar = others.find((entry) =>
        looksLikeSameValue(entry.normalizedName, normalizedName),
      );
      if (similar !== undefined) {
        messages.push({
          severity: 'warning',
          code: 'possible_duplicate_client',
          field: 'name',
          message: `Möglicherweise derselbe Kunde wie „${similar.name}". Bitte prüfen — es wird nichts automatisch zusammengeführt.`,
          suggestion: similar.name,
        });
      }
    }
  }

  return {
    normalized: {
      name,
      normalizedName,
      country: country.length > 0 ? country : null,
      website: website.url,
      notes: notes.length > 0 ? notes : null,
      isActive: input.isActive,
    },
    messages,
    valid: !messages.some((message) => message.severity === 'error'),
  };
}

/**
 * Which fields changed between two versions.
 *
 * Drives the audit entries: a status change and a note change are separate,
 * auditable events, not one undifferentiated "updated".
 */
export function diffClient(
  before: {
    name: string;
    country: string | null;
    website: string | null;
    notes: string | null;
    isActive: boolean;
  },
  after: NormalizedClientInput,
): {
  changedFields: string[];
  statusChanged: boolean;
  notesChanged: boolean;
} {
  const changedFields: string[] = [];

  if (before.name !== after.name) changedFields.push('name');
  if (before.country !== after.country) changedFields.push('country');
  if (before.website !== after.website) changedFields.push('website');
  if (before.notes !== after.notes) changedFields.push('notes');
  if (before.isActive !== after.isActive) changedFields.push('isActive');

  return {
    changedFields,
    statusChanged: before.isActive !== after.isActive,
    notesChanged: before.notes !== after.notes,
  };
}

/** Audit action names for customer changes. */
export const CLIENT_AUDIT_ACTIONS = {
  created: 'client_created',
  updated: 'client_updated',
  statusChanged: 'client_status_changed',
  notesChanged: 'client_notes_changed',
} as const;
