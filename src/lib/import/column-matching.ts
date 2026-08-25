/**
 * Header-to-field matching, shared by every import in the application.
 *
 * Extracted from the phase-2 reference import when the partner import needed
 * exactly the same behaviour. One implementation means one set of rules to
 * reason about — and the rules matter: an auto-mapping that silently picks the
 * wrong column corrupts data quietly, which is the worst way for it to fail.
 *
 * The algorithm is deliberately conservative:
 *
 *   * A field is assigned at most once. If two columns both look like "Ort",
 *     the first wins and the second is left for the user to resolve. Guessing
 *     which of two candidates is right is not something this code can do.
 *   * Exact matches are resolved before partial ones across *all* columns, so
 *     an exact hit on a later column is never displaced by an earlier
 *     column's partial hit.
 *   * Everything it produces is a proposal shown for correction, never an
 *     applied decision.
 */

import { normalizeForComparison } from '@/modules/references/normalize';

export interface FieldMatcher<TField extends string> {
  field: TField;
  /** Normalised header forms that identify the field. */
  aliases: readonly string[];
}

export interface ColumnAssignment<TField extends string> {
  /** Index into the parsed table's headers. */
  columnIndex: number;
  header: string;
  /** null means: column is ignored. */
  field: TField | null;
  /** How the proposal came about. */
  matchType: 'exact' | 'partial' | 'none';
}

export type GenericColumnMapping<TField extends string> = ColumnAssignment<TField>[];

/** Shortest alias worth comparing by prefix; below this, noise dominates. */
const MIN_PARTIAL_LENGTH = 3;

export function proposeMappingFor<TField extends string>(
  headers: readonly string[],
  matchers: readonly FieldMatcher<TField>[],
): GenericColumnMapping<TField> {
  const taken = new Set<TField>();

  const exactMatch = (normalized: string): TField | null => {
    for (const matcher of matchers) {
      if (taken.has(matcher.field)) continue;
      if (matcher.aliases.includes(normalized)) return matcher.field;
    }
    return null;
  };

  const partialMatch = (normalized: string): TField | null => {
    if (normalized.length < MIN_PARTIAL_LENGTH) return null;
    for (const matcher of matchers) {
      if (taken.has(matcher.field)) continue;
      for (const alias of matcher.aliases) {
        if (alias.length < MIN_PARTIAL_LENGTH) continue;
        if (normalized.startsWith(alias) || alias.startsWith(normalized)) {
          return matcher.field;
        }
      }
    }
    return null;
  };

  const normalizedHeaders = headers.map((header) => normalizeForComparison(header));
  const assignments: GenericColumnMapping<TField> = headers.map((header, columnIndex) => ({
    columnIndex,
    header,
    field: null,
    matchType: 'none',
  }));

  normalizedHeaders.forEach((normalized, index) => {
    const field = exactMatch(normalized);
    if (field === null) return;
    taken.add(field);
    const assignment = assignments[index];
    if (assignment !== undefined) {
      assignment.field = field;
      assignment.matchType = 'exact';
    }
  });

  normalizedHeaders.forEach((normalized, index) => {
    const assignment = assignments[index];
    if (assignment === undefined || assignment.field !== null) return;
    const field = partialMatch(normalized);
    if (field === null) return;
    taken.add(field);
    assignment.field = field;
    assignment.matchType = 'partial';
  });

  return assignments;
}

/** Required fields the mapping does not cover. */
export function findMissingFields<TField extends string>(
  mapping: GenericColumnMapping<TField>,
  required: readonly TField[],
): TField[] {
  const assigned = new Set(
    mapping
      .map((assignment) => assignment.field)
      .filter((field): field is TField => field !== null),
  );
  return required.filter((field) => !assigned.has(field));
}

/** Reads one source row into a field-keyed record, following the mapping. */
export function applyMappingFor<TField extends string>(
  mapping: GenericColumnMapping<TField>,
  row: readonly string[],
): Partial<Record<TField, string>> {
  const result: Partial<Record<TField, string>> = {};

  for (const assignment of mapping) {
    if (assignment.field === null) continue;
    const value = row[assignment.columnIndex];
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) result[assignment.field] = trimmed;
  }

  return result;
}

/**
 * Keeps the full source row keyed by header, for immutable storage.
 *
 * This is what goes into `raw_data`: the row exactly as it arrived, never
 * overwritten, so the normalisation can change later without losing what the
 * source actually said.
 */
export function toRawRecord(
  headers: readonly string[],
  row: readonly string[],
): Record<string, string> {
  const raw: Record<string, string> = {};
  headers.forEach((header, index) => {
    raw[header] = row[index] ?? '';
  });
  return raw;
}
