/**
 * Rule-based relevance preview.
 *
 * This is NOT the match engine. It is a transparent, deterministic
 * pre-filter over structured fields only — sector, CPV, region, contract
 * value — so the search and dashboard can rank results before the AI
 * analysis exists.
 *
 * Phase 3 replaces this with the real match engine, which additionally
 * consumes the AI-extracted requirements and the company's certificates and
 * references. Everything rendered from here must be labelled as a
 * preliminary rule-based value, never as an AI result
 * (CLAUDE.md § KI-Integration).
 */

import { SECTOR_KEYS } from '@/config/sectors';
import type { TenderListItem } from '@/types/tender';

export const MATCH_RECOMMENDATIONS = ['go', 'review', 'no_go'] as const;
export type MatchRecommendation = (typeof MATCH_RECOMMENDATIONS)[number];

export const MATCH_RECOMMENDATION_LABELS: Record<MatchRecommendation, string> = {
  go: 'GO',
  review: 'PRÜFEN',
  no_go: 'NO-GO',
};

/** The company-side inputs the preview scores against. */
export interface MatchProfile {
  sectors: readonly string[];
  cpvCodes: readonly string[];
  regionCodes: readonly string[];
  countryCodes: readonly string[];
  minContractValue: number | null;
  maxContractValue: number | null;
}

/**
 * Neutral profile used until an organisation has filled in its company
 * profile: the platform's launch sectors, Germany, no value limits.
 */
export const DEFAULT_MATCH_PROFILE: MatchProfile = {
  sectors: SECTOR_KEYS,
  cpvCodes: [],
  regionCodes: [],
  countryCodes: ['DE'],
  minContractValue: null,
  maxContractValue: null,
};

export interface MatchCriterion {
  label: string;
  /** Points awarded out of `maxPoints`. */
  points: number;
  maxPoints: number;
  detail: string;
}

export interface MatchPreview {
  /** 0–100. */
  score: number;
  recommendation: MatchRecommendation;
  criteria: MatchCriterion[];
}

const GO_THRESHOLD = 70;
const REVIEW_THRESHOLD = 40;

/** Score at or above which a tender counts as a "Top Match". */
export const TOP_MATCH_THRESHOLD = GO_THRESHOLD;

function overlapCount(a: readonly string[], b: readonly string[]): number {
  const set = new Set(b);
  return a.filter((entry) => set.has(entry)).length;
}

export function scoreTender(
  tender: Pick<
    TenderListItem,
    'sectors' | 'cpvCodes' | 'regionCode' | 'countryCode' | 'estimatedValueNet'
  >,
  profile: MatchProfile = DEFAULT_MATCH_PROFILE,
): MatchPreview {
  const criteria: MatchCriterion[] = [];

  // --- Sector fit (40) ----------------------------------------------------
  const sectorMatches = overlapCount(tender.sectors, profile.sectors);
  const sectorPoints = sectorMatches === 0 ? 0 : sectorMatches === 1 ? 28 : 40;
  criteria.push({
    label: 'Branchenübereinstimmung',
    points: sectorPoints,
    maxPoints: 40,
    detail:
      sectorMatches === 0
        ? 'Keine Übereinstimmung mit den hinterlegten Branchen.'
        : `${sectorMatches} übereinstimmende Branche(n).`,
  });

  // --- CPV fit (20) -------------------------------------------------------
  const cpvMatches = overlapCount(tender.cpvCodes, profile.cpvCodes);
  const cpvPoints =
    profile.cpvCodes.length === 0 ? 10 : cpvMatches > 0 ? 20 : 0;
  criteria.push({
    label: 'CPV-Übereinstimmung',
    points: cpvPoints,
    maxPoints: 20,
    detail:
      profile.cpvCodes.length === 0
        ? 'Keine CPV-Codes im Unternehmensprofil hinterlegt — neutral bewertet.'
        : cpvMatches > 0
          ? `${cpvMatches} übereinstimmende CPV-Code(s).`
          : 'Keine Übereinstimmung mit den hinterlegten CPV-Codes.',
  });

  // --- Region fit (20) ----------------------------------------------------
  const countryMatch =
    tender.countryCode !== null && profile.countryCodes.includes(tender.countryCode);
  const regionMatch =
    tender.regionCode !== null && profile.regionCodes.includes(tender.regionCode);

  const regionPoints =
    profile.regionCodes.length === 0
      ? countryMatch
        ? 14
        : 0
      : regionMatch
        ? 20
        : countryMatch
          ? 8
          : 0;

  criteria.push({
    label: 'Regionale Abdeckung',
    points: regionPoints,
    maxPoints: 20,
    detail:
      profile.regionCodes.length === 0
        ? countryMatch
          ? 'Land abgedeckt, keine Regionen im Profil hinterlegt.'
          : 'Land nicht im Unternehmensprofil hinterlegt.'
        : regionMatch
          ? 'Region ist im Unternehmensprofil hinterlegt.'
          : countryMatch
            ? 'Land abgedeckt, Region jedoch nicht hinterlegt.'
            : 'Weder Land noch Region im Unternehmensprofil hinterlegt.',
  });

  // --- Value fit (20) -----------------------------------------------------
  const value = tender.estimatedValueNet;
  let valuePoints = 10;
  let valueDetail = 'Kein Auftragswert angegeben — neutral bewertet.';

  if (value !== null) {
    const aboveMin =
      profile.minContractValue === null || value >= profile.minContractValue;
    const belowMax =
      profile.maxContractValue === null || value <= profile.maxContractValue;

    if (aboveMin && belowMax) {
      valuePoints = 20;
      valueDetail = 'Auftragswert liegt im bevorzugten Bereich.';
    } else if (!aboveMin) {
      valuePoints = 6;
      valueDetail = 'Auftragswert liegt unter dem hinterlegten Mindestwert.';
    } else {
      valuePoints = 4;
      valueDetail = 'Auftragswert liegt über dem hinterlegten Höchstwert.';
    }
  }

  criteria.push({
    label: 'Auftragswert',
    points: valuePoints,
    maxPoints: 20,
    detail: valueDetail,
  });

  const score = criteria.reduce((sum, criterion) => sum + criterion.points, 0);

  const recommendation: MatchRecommendation =
    score >= GO_THRESHOLD ? 'go' : score >= REVIEW_THRESHOLD ? 'review' : 'no_go';

  return { score, recommendation, criteria };
}
