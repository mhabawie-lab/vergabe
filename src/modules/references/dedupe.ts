/**
 * Duplicate detection for reference projects.
 *
 * Two questions are answered separately, because they have different
 * consequences:
 *
 *  - **Same object number in the same organisation** → a hard conflict. The
 *    database enforces it too, so importing would fail; the row is reported as
 *    an error before anything is written.
 *  - **Same project by content** → a suspicion. Reported as a warning with the
 *    record it resembles, for the user to judge. Never resolved automatically.
 */

import type { ValidationMessage } from '@/types/reference';
import { looksLikeSameValue, normalizeCityName, normalizeClientName } from './normalize';
import type { NormalizedRow } from './validation';

/** The minimum an existing project must expose to be compared. */
export interface DuplicateCandidateSource {
  id: string;
  externalObjectNumber: string | null;
  projectName: string;
  businessClientName: string | null;
  city: string | null;
}

export interface DuplicateFinding {
  /** Existing project the row resembles. */
  candidateId: string;
  candidateLabel: string;
  /** `object_number` is a conflict, `content` a suspicion. */
  kind: 'object_number' | 'content';
  message: ValidationMessage;
}

/** Comparison key over client, project name and city. */
function contentKey(input: {
  projectName: string | null;
  clientName: string | null;
  city: string | null;
}): string {
  return [
    input.clientName === null ? '' : normalizeClientName(input.clientName),
    input.projectName === null ? '' : normalizeClientName(input.projectName),
    input.city === null ? '' : normalizeCityName(input.city),
  ].join('|');
}

function describe(candidate: DuplicateCandidateSource): string {
  const parts = [candidate.projectName];
  if (candidate.businessClientName !== null) parts.push(candidate.businessClientName);
  if (candidate.city !== null) parts.push(candidate.city);
  return parts.join(' · ');
}

/**
 * Compares one normalised row against the existing stock.
 *
 * Returns every finding; the caller decides how they affect the row status.
 */
export function findDuplicates(
  row: NormalizedRow,
  existing: readonly DuplicateCandidateSource[],
): DuplicateFinding[] {
  const findings: DuplicateFinding[] = [];

  if (row.externalObjectNumber !== null) {
    const conflict = existing.find(
      (candidate) => candidate.externalObjectNumber === row.externalObjectNumber,
    );
    if (conflict !== undefined) {
      findings.push({
        candidateId: conflict.id,
        candidateLabel: describe(conflict),
        kind: 'object_number',
        message: {
          severity: 'error',
          code: 'existing_object_number',
          field: 'externalObjectNumber',
          message: `Die Objekt-Nr. „${row.externalObjectNumber}" ist bereits vergeben an „${describe(conflict)}".`,
          suggestion: null,
        },
      });
    }
  }

  const rowKey = contentKey(row);
  // A key made only of separators carries no information.
  if (rowKey.replace(/\|/g, '').length > 0) {
    for (const candidate of existing) {
      // The object-number conflict is already reported; do not repeat it.
      if (
        row.externalObjectNumber !== null &&
        candidate.externalObjectNumber === row.externalObjectNumber
      ) {
        continue;
      }

      const candidateKey = contentKey({
        projectName: candidate.projectName,
        clientName: candidate.businessClientName,
        city: candidate.city,
      });

      if (candidateKey === rowKey || looksLikeSameValue(rowKey, candidateKey, 0.92)) {
        findings.push({
          candidateId: candidate.id,
          candidateLabel: describe(candidate),
          kind: 'content',
          message: {
            severity: 'warning',
            code: 'possible_duplicate',
            field: 'projectName',
            message: `Möglicherweise bereits erfasst als „${describe(candidate)}". Bitte prüfen.`,
            suggestion: null,
          },
        });
        break;
      }
    }
  }

  return findings;
}
