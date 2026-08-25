/**
 * Search-profile suggestions derived from reference data.
 *
 * This is **not** the match engine. It prepares the structure the engine will
 * later consume, and it produces suggestions a user can accept — nothing here
 * creates an active search profile.
 *
 * The governing rule is that a suggestion may only rest on **confirmed** data:
 *
 *  - a service category counts only once a user has confirmed it;
 *  - regions and cities come from stored project records, not from guesses;
 *  - a project whose service is still `unknown` contributes its location but
 *    never a service claim.
 *
 * Suggesting "you can do security work in Hamburg" on the strength of an
 * unconfirmed name rule would put the company in front of a tender it cannot
 * evidence. The threshold is therefore deliberately conservative.
 */

import type {
  ReferenceProjectListItem,
  ReferenceServiceCategory,
} from '@/types/reference';
import { REFERENCE_SERVICE_CATEGORY_LABELS } from '@/types/reference';

/** What the suggestion builder needs to know about one confirmed service. */
export interface ConfirmedServiceRecord {
  projectId: string;
  serviceCategory: ReferenceServiceCategory;
}

export interface SuggestionInput {
  projects: readonly ReferenceProjectListItem[];
  /** Only user-confirmed services. Proposals must not be passed in. */
  confirmedServices: readonly ConfirmedServiceRecord[];
}

export interface SearchProfileSuggestion {
  /** Stable id so the UI can track accept/dismiss without a database row. */
  key: string;
  title: string;
  /** Why this is being suggested, in plain language. */
  rationale: string;
  /** Filters a search profile would carry. */
  filters: {
    sectors: string[];
    regions: string[];
    cities: string[];
  };
  /** How many confirmed reference projects back this suggestion. */
  evidenceCount: number;
  /**
   * Always true. A suggestion is never stored as an active search profile —
   * the user creates one from it explicitly.
   */
  isProposal: true;
}

/**
 * Maps a reference service category onto the tender sector taxonomy.
 *
 * Only unambiguous pairs are listed. A category with no clear counterpart —
 * `other`, `unknown` — maps to nothing and therefore yields no suggestion.
 */
const SECTOR_BY_SERVICE: Partial<Record<ReferenceServiceCategory, string[]>> = {
  security: ['security_services', 'property_protection'],
  cleaning: ['cleaning'],
  facility_management: ['facility_management'],
  warehouse: [],
  paramedic: [],
  construction_support: ['construction_site_security'],
};

/** Minimum number of confirmed projects before a suggestion is offered. */
const MIN_EVIDENCE = 1;

/**
 * Builds suggestions from confirmed reference data.
 *
 * Returns an empty list when nothing is confirmed yet — which is the correct
 * answer, not a failure.
 */
export function buildSearchProfileSuggestions(
  input: SuggestionInput,
): SearchProfileSuggestion[] {
  const projectById = new Map(
    input.projects.map((project) => [project.id, project] as const),
  );

  // Group confirmed services by category, collecting the places they cover.
  const byCategory = new Map<
    ReferenceServiceCategory,
    { projectIds: Set<string>; regions: Set<string>; cities: Set<string> }
  >();

  for (const record of input.confirmedServices) {
    if (record.serviceCategory === 'unknown') continue;

    const project = projectById.get(record.projectId);
    if (project === undefined) continue;

    const entry = byCategory.get(record.serviceCategory) ?? {
      projectIds: new Set<string>(),
      regions: new Set<string>(),
      cities: new Set<string>(),
    };

    entry.projectIds.add(project.id);
    if (project.region !== null) entry.regions.add(project.region);
    if (project.city !== null) entry.cities.add(project.city);
    byCategory.set(record.serviceCategory, entry);
  }

  const suggestions: SearchProfileSuggestion[] = [];

  for (const [category, entry] of byCategory) {
    if (entry.projectIds.size < MIN_EVIDENCE) continue;

    const sectors = SECTOR_BY_SERVICE[category] ?? [];
    if (sectors.length === 0) {
      // No unambiguous sector counterpart — better no suggestion than a wrong
      // one.
      continue;
    }

    const label = REFERENCE_SERVICE_CATEGORY_LABELS[category];
    const cities = [...entry.cities].sort((a, b) => a.localeCompare(b, 'de'));
    const regions = [...entry.regions].sort((a, b) => a.localeCompare(b, 'de'));

    const placePhrase =
      cities.length > 0
        ? ` in ${cities.slice(0, 3).join(', ')}${cities.length > 3 ? ' und weiteren Orten' : ''}`
        : '';

    suggestions.push({
      key: `service:${category}`,
      title: `${label}${placePhrase}`,
      rationale: `${entry.projectIds.size} bestätigte Referenz${
        entry.projectIds.size === 1 ? '' : 'en'
      } mit der Leistungsart „${label}".`,
      filters: { sectors, regions, cities },
      evidenceCount: entry.projectIds.size,
      isProposal: true,
    });
  }

  return suggestions.sort((a, b) => b.evidenceCount - a.evidenceCount);
}

/** Standing note for the UI wherever suggestions are displayed. */
export const SUGGESTION_NOTE =
  'Vorschläge entstehen ausschließlich aus bestätigten Referenzdaten. Sie sind noch kein aktives Suchprofil — Sie entscheiden, ob daraus eines wird.';
