/**
 * Cautious service classification from the object name.
 *
 * A service is only ever *proposed*, and only when the object name contains an
 * unambiguous term. Everything else stays `unknown`.
 *
 * Two rules matter more than coverage here:
 *
 *  1. **Never invent a service.** An object called "Objekt 12" or
 *     "Halle Nord" yields `unknown` — not "Sicherheitsdienst", not
 *     "Bauhelfer". A wrong reference is worse than a missing one, because it
 *     would later be offered as proof of experience the company cannot show.
 *
 *  2. **The object type is not the service.** "Datacenter" says what the site
 *     is, not what was delivered there. It never produces a service proposal.
 *
 * Every proposal carries its source, the rule that fired and a confidence, and
 * must be confirmed by a user before it counts as a fact.
 */

import type {
  ClassificationSource,
  ReferenceServiceCategory,
} from '@/types/reference';

export interface ServiceProposal {
  serviceCategory: ReferenceServiceCategory;
  classificationSource: ClassificationSource;
  /** 0..1. */
  classificationConfidence: number;
  /** Human-readable reason, shown in the UI next to the proposal. */
  reason: string;
  /** Identifier of the rule that fired, for auditing. */
  ruleId: string;
  /** Always false here — a proposal is never pre-confirmed. */
  confirmedByUser: false;
}

interface NameRule {
  id: string;
  /** Term searched for in the object name, case-insensitively. */
  term: string;
  category: ReferenceServiceCategory;
  confidence: number;
}

/**
 * The complete rule set.
 *
 * Deliberately short. Extending it needs evidence that the term is
 * unambiguous in the customer's own naming, not merely plausible.
 */
const NAME_RULES: readonly NameRule[] = [
  { id: 'name:paramedic', term: 'paramedic', category: 'paramedic', confidence: 0.7 },
  { id: 'name:security', term: 'security', category: 'security', confidence: 0.7 },
  { id: 'name:clean', term: 'clean', category: 'cleaning', confidence: 0.7 },
  { id: 'name:lager', term: 'lager', category: 'warehouse', confidence: 0.7 },
] as const;

/**
 * Terms that describe the *site*, never the service.
 *
 * Listed explicitly so a future reader sees that leaving them out was a
 * decision rather than an oversight.
 */
export const OBJECT_TYPE_TERMS_WITHOUT_SERVICE_MEANING: readonly string[] = [
  'datacenter',
  'rechenzentrum',
  'halle',
  'lagerhalle',
  'objekt',
  'baustelle',
  'campus',
] as const;

/**
 * Derives service proposals from an object name.
 *
 * Returns an empty array when no rule matches — the caller then records
 * `unknown` rather than guessing.
 */
export function proposeServicesFromName(objectName: string): ServiceProposal[] {
  const haystack = objectName.toLowerCase();

  const proposals: ServiceProposal[] = [];
  for (const rule of NAME_RULES) {
    if (!haystack.includes(rule.term)) continue;

    proposals.push({
      serviceCategory: rule.category,
      classificationSource: 'name_rule',
      classificationConfidence: rule.confidence,
      reason: `Objektname enthält „${rule.term}".`,
      ruleId: rule.id,
      confirmedByUser: false,
    });
  }

  return proposals;
}

/**
 * The service entry for a project, including the `unknown` fallback.
 *
 * Always returns at least one entry, so every project carries an explicit
 * statement about its service — including the explicit "not determined".
 */
export function classifyReferenceProject(input: {
  projectName: string;
  objectType: string | null;
}): ServiceProposal[] {
  const proposals = proposeServicesFromName(input.projectName);

  if (proposals.length > 0) {
    return proposals;
  }

  return [
    {
      serviceCategory: 'unknown',
      classificationSource: 'name_rule',
      classificationConfidence: 0,
      reason:
        'Der Objektname enthält keinen eindeutigen Leistungsbegriff. Die Leistungsart muss manuell erfasst werden.',
      ruleId: 'name:no-match',
      confirmedByUser: false,
    },
  ];
}

/** Standing note for the UI wherever a proposal is displayed. */
export const CLASSIFICATION_PROPOSAL_NOTE =
  'Automatisch erkannte Leistungsarten sind Vorschläge und keine bestätigten Angaben. Sie zählen erst nach Ihrer Bestätigung.';
