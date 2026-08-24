/**
 * Comparison forms for client names and places.
 *
 * These produce a *proposal* for matching two spellings. The original value is
 * always kept alongside — nothing here ever overwrites source data
 * (phase-2 rule: raw and normalised stay separate).
 */

/** Lowercased, accent-folded, punctuation-stripped, whitespace-collapsed. */
export function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Legal-form suffixes that carry no distinguishing information. */
const LEGAL_FORM_TOKENS = new Set([
  'gmbh',
  'mbh',
  'ag',
  'kg',
  'ohg',
  'gbr',
  'ug',
  'se',
  'co',
  'ltd',
  'plc',
  'inc',
  'bv',
  'nv',
  'sa',
  'srl',
  'gemeinnutzige',
  'ggmbh',
  'aor',
  'kgaa',
]);

/**
 * Comparison form of a company name.
 *
 * Drops legal-form suffixes so "Muster Sicherheit GmbH" and
 * "Muster Sicherheit GmbH & Co. KG" compare equal. Used for the unique
 * constraint per organisation and for duplicate warnings.
 */
export function normalizeClientName(name: string): string {
  const tokens = normalizeForComparison(name)
    .split(' ')
    .filter((token) => token.length > 0 && !LEGAL_FORM_TOKENS.has(token));

  // Never return an empty key: a name consisting only of a legal form is
  // unusual but must still be storable and comparable.
  return tokens.length > 0 ? tokens.join(' ') : normalizeForComparison(name);
}

/**
 * Comparison form of a place name.
 *
 * Handles the common German variants — "Frankfurt a. M." vs
 * "Frankfurt am Main", "St." vs "Sankt" — without changing the stored value.
 */
export function normalizeCityName(city: string): string {
  return normalizeForComparison(city)
    .replace(/\ba\s*m\b/g, 'am')
    .replace(/\bst\b/g, 'sankt')
    .replace(/\bstr\b/g, 'strasse')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance, capped for early exit.
 *
 * Only used on short strings (names, places), so the O(n·m) table is fine.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = (current[j - 1] ?? 0) + 1;
      const deletion = (previous[j] ?? 0) + 1;
      current[j] = Math.min(substitution, insertion, deletion);
    }
    previous = current;
  }

  return previous[b.length] ?? 0;
}

/** 0..1 similarity derived from the edit distance. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * True when two values look like different spellings of the same thing.
 *
 * Deliberately conservative: a hit is only ever surfaced as a suggestion for
 * the user to confirm, never applied automatically.
 */
export function looksLikeSameValue(a: string, b: string, threshold = 0.86): boolean {
  if (a.length === 0 || b.length === 0) return false;
  if (a === b) return true;
  // Very short strings reach a high similarity too easily.
  if (Math.min(a.length, b.length) < 4) return false;
  return similarity(a, b) >= threshold;
}
