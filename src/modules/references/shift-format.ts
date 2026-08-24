/**
 * The shift column.
 *
 * Source lists carry values such as `218/146/0`. **What the three numbers
 * mean is not established.** Nothing in this module names them, and no caller
 * may derive a meaning from their position until the user has confirmed one.
 *
 * The contract is therefore narrow on purpose:
 *  - the original string is always preserved verbatim (`raw`);
 *  - the numbers are additionally exposed as a plain array for arithmetic;
 *  - a value that does not parse is reported, never silently repaired.
 */

export interface ShiftFormatResult {
  /** The source value, unchanged. */
  raw: string;
  /**
   * The numbers in source order. Position carries no confirmed meaning —
   * do not label these.
   */
  values: number[];
  /** True when the value matched the expected `n/n/n` shape. */
  isValid: boolean;
  /** Set when `isValid` is false; describes what was wrong. */
  problem: string | null;
}

/** One or more non-negative integers separated by slashes. */
const SHIFT_PATTERN = /^\d+(?:\s*\/\s*\d+)*$/;

/**
 * Parses the shift column.
 *
 * An empty value is not an error — many rows simply carry no shift data.
 * It yields `isValid: true` with an empty `values` array.
 */
export function parseShiftSummary(input: string | null | undefined): ShiftFormatResult {
  const raw = input ?? '';
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { raw, values: [], isValid: true, problem: null };
  }

  if (!SHIFT_PATTERN.test(trimmed)) {
    return {
      raw,
      values: [],
      isValid: false,
      problem:
        'Erwartet werden Zahlen, getrennt durch Schrägstriche (z. B. 218/146/0).',
    };
  }

  const values = trimmed.split('/').map((part) => Number.parseInt(part.trim(), 10));

  if (values.some((value) => !Number.isFinite(value))) {
    return {
      raw,
      values: [],
      isValid: false,
      problem: 'Der Wert enthält Zahlen, die nicht gelesen werden konnten.',
    };
  }

  return { raw, values, isValid: true, problem: null };
}

/**
 * Display form of a parsed shift value.
 *
 * Returns the original string. Formatting the numbers separately would imply
 * a reading of the positions that has not been confirmed.
 */
export function formatShiftSummary(raw: string | null): string {
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : '—';
}

/**
 * Standing note for the UI wherever a shift value is shown.
 *
 * Kept here so the wording stays identical across screens.
 */
export const SHIFT_MEANING_NOTE =
  'Die Bedeutung der einzelnen Zahlen ist noch nicht bestätigt. Der Wert wird unverändert aus der Quelle übernommen.';
