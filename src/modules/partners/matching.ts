/**
 * Match engine for the Subunternehmer-Radar.
 *
 * Deterministic and explainable by construction: the same inputs always
 * produce the same figure, every component is shown with its weight and its
 * reason, and nothing here calls a language model. A score is a sorting aid
 * for a human decision, never the decision itself
 * (`docs/match-score.md`).
 *
 * Four rules do most of the work:
 *
 *   1. A blocked partner is excluded outright — no score, with the reason.
 *   2. Only *confirmed* services count. What a company told us about itself
 *      is recorded, and it is not evidence.
 *   3. An expired credential is not a fulfilled requirement.
 *   4. Missing information is reported as missing. It never scores as a
 *      positive, because "we do not know" and "yes" are different answers,
 *      and treating the first as the second is how a partner ends up on site
 *      without the paperwork.
 */

import {
  DATACENTER_SERVICE_CATEGORIES,
  MATCH_COMPONENT_KEYS,
  type CredentialType,
  type MatchComponent,
  type MatchComponentKey,
  type PartnerAvailability,
  type PartnerCompany,
  type PartnerQualification,
  type PartnerService,
  type PartnerServiceRegion,
  type SubcontractorNeed,
} from '@/types/partner';
import { assessAvailability } from './availability';
import { countsAsProof, qualificationAsCredential } from './credentials';
import { normalizeCityName, normalizeForComparison } from '@/modules/references/normalize';

/**
 * Version of the rule set.
 *
 * Stored with every match. A score without its version cannot be compared
 * with one computed after the weights changed.
 */
export const MATCH_SCORE_VERSION = 'partner-match-v1';

/**
 * Weights, in percent, summing to 100.
 *
 * Chosen to mirror how the decision is actually made: the service has to fit
 * before anything else matters, the region decides whether the partner can be
 * on site at all, and the paperwork is a gate rather than a differentiator —
 * hence its comparatively small share, backed by the hard exclusion rules.
 */
export const MATCH_WEIGHTS: Record<MatchComponentKey, number> = {
  service: 30,
  region: 20,
  availability: 20,
  capacity: 15,
  credentials: 10,
  datacenter: 5,
};

export const MATCH_COMPONENT_LABELS: Record<MatchComponentKey, string> = {
  service: 'Leistung',
  region: 'Region',
  availability: 'Verfügbarkeit',
  capacity: 'Personalkapazität',
  credentials: 'Qualifikationen und Nachweise',
  datacenter: 'Datacenter-/Referenzerfahrung',
};

export interface MatchCandidate {
  company: PartnerCompany;
  services: readonly PartnerService[];
  regions: readonly PartnerServiceRegion[];
  availability: readonly PartnerAvailability[];
  qualifications: readonly PartnerQualification[];
}

export interface MatchResult {
  partnerCompanyId: string;
  totalScore: number;
  scoreVersion: string;
  components: MatchComponent[];
  /** Set when the partner is excluded; the score is then 0. */
  exclusionReason: string | null;
  /** Plain-language list of what we could not judge. */
  missingInformation: string[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function component(
  key: MatchComponentKey,
  ratio: number,
  reason: string,
  missingData = false,
): MatchComponent {
  const clamped = Math.max(0, Math.min(1, ratio));
  const weight = MATCH_WEIGHTS[key];
  return {
    key,
    label: MATCH_COMPONENT_LABELS[key],
    ratio: round1(clamped * 10) / 10,
    weight,
    points: round1(clamped * weight),
    reason,
    missingData,
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function scoreService(candidate: MatchCandidate, need: SubcontractorNeed): MatchComponent {
  const confirmed = candidate.services.filter(
    (service) => service.confirmation === 'confirmed',
  );

  const exact = confirmed.find(
    (service) => service.serviceCategory === need.serviceCategory,
  );
  if (exact !== undefined) {
    return component('service', 1, 'Die benötigte Leistung ist bestätigt hinterlegt.');
  }

  // A self-declared match is worth reporting but is not evidence, so it scores
  // nothing and shows up as missing information instead.
  const declared = candidate.services.find(
    (service) =>
      service.serviceCategory === need.serviceCategory &&
      service.confirmation === 'self_declared',
  );
  if (declared !== undefined) {
    return component(
      'service',
      0,
      'Die Leistung ist nur selbst angegeben und nicht bestätigt — zählt nicht als Nachweis.',
      true,
    );
  }

  if (confirmed.length === 0) {
    return component(
      'service',
      0,
      'Für dieses Unternehmen ist keine Leistung bestätigt.',
      true,
    );
  }

  return component(
    'service',
    0,
    'Die benötigte Leistung ist für dieses Unternehmen nicht bestätigt.',
  );
}

function scoreRegion(candidate: MatchCandidate, need: SubcontractorNeed): MatchComponent {
  if (need.city === null && need.region === null && need.country === null) {
    return component('region', 0, 'Der Bedarf nennt keinen Einsatzort.', true);
  }

  const needCity = need.city === null ? null : normalizeCityName(need.city);
  const needRegion = need.region === null ? null : normalizeForComparison(need.region);

  if (candidate.regions.length === 0) {
    // The registered address says where the company *is*, not where it works.
    // Those are different facts, and inferring coverage from a company seat is
    // the same kind of guess this application refuses to make elsewhere. The
    // seat is reported, but it scores nothing.
    const companyCity =
      candidate.company.city === null ? null : normalizeCityName(candidate.company.city);
    if (needCity !== null && companyCity === needCity) {
      return component(
        'region',
        0,
        'Kein Einsatzgebiet hinterlegt. Der Firmensitz liegt am Einsatzort — das belegt aber keine Abdeckung.',
        true,
      );
    }
    return component('region', 0, 'Es ist kein Einsatzgebiet hinterlegt.', true);
  }

  const nationwide = candidate.regions.find((region) => region.nationwide);
  if (nationwide !== undefined) {
    return component(
      'region',
      nationwide.isConfirmed ? 1 : 0.7,
      nationwide.isConfirmed
        ? 'Das Unternehmen ist bestätigt bundesweit tätig.'
        : 'Bundesweite Tätigkeit ist angegeben, aber nicht bestätigt.',
      !nationwide.isConfirmed,
    );
  }

  const cityHit = candidate.regions.find(
    (region) =>
      needCity !== null &&
      region.city !== null &&
      normalizeCityName(region.city) === needCity,
  );
  if (cityHit !== undefined) {
    return component(
      'region',
      cityHit.isConfirmed ? 1 : 0.7,
      cityHit.isConfirmed
        ? 'Der Einsatzort liegt im bestätigten Einsatzgebiet.'
        : 'Der Einsatzort liegt im angegebenen, unbestätigten Einsatzgebiet.',
      !cityHit.isConfirmed,
    );
  }

  const regionHit = candidate.regions.find(
    (region) =>
      needRegion !== null &&
      region.region !== null &&
      normalizeForComparison(region.region) === needRegion,
  );
  if (regionHit !== undefined) {
    return component(
      'region',
      regionHit.isConfirmed ? 0.8 : 0.55,
      'Die Region wird abgedeckt, der genaue Einsatzort ist nicht genannt.',
      !regionHit.isConfirmed,
    );
  }

  const travelling = candidate.regions.find((region) => region.willingToTravel);
  if (travelling !== undefined) {
    return component(
      'region',
      0.3,
      'Der Einsatzort liegt außerhalb des Einsatzgebiets; Reisebereitschaft ist angegeben.',
    );
  }

  return component('region', 0, 'Der Einsatzort liegt außerhalb des Einsatzgebiets.');
}

function scoreAvailability(
  candidate: MatchCandidate,
  need: SubcontractorNeed,
  today: Date,
): MatchComponent {
  const assessment = assessAvailability(candidate.availability, {
    serviceCategory: need.serviceCategory,
    day: need.startDate,
    today,
  });

  if (assessment.entry === null) {
    return component('availability', 0, assessment.reason, true);
  }

  if (assessment.status === 'unknown') {
    // Either never confirmed or gone stale — both mean "we do not know".
    return component('availability', 0, assessment.reason, true);
  }

  const shiftFits =
    need.shiftModel === 'unknown' ||
    assessment.entry.shiftModel === need.shiftModel ||
    assessment.entry.aroundTheClock;

  const coverFits =
    (!need.aroundTheClock || assessment.entry.aroundTheClock) &&
    (!need.nightWork || assessment.entry.nightShift) &&
    (!need.weekendWork || assessment.entry.weekend);

  if (assessment.status === 'booked') {
    return component('availability', 0, 'Das Unternehmen ist im Zeitraum ausgelastet.');
  }

  const base = assessment.status === 'available' ? 1 : 0.6;
  const penalty = (shiftFits ? 0 : 0.3) + (coverFits ? 0 : 0.3);
  const reasons = [assessment.reason];
  if (!shiftFits) reasons.push('Das Schichtmodell weicht ab.');
  if (!coverFits) reasons.push('Nacht-, Wochenend- oder 24/7-Betrieb ist nicht abgedeckt.');

  return component('availability', base - penalty, reasons.join(' '));
}

function scoreCapacity(candidate: MatchCandidate, need: SubcontractorNeed, today: Date): MatchComponent {
  if (need.requiredStaff === null || need.requiredStaff === 0) {
    return component('capacity', 0, 'Der Bedarf nennt keine Mitarbeiterzahl.', true);
  }

  const assessment = assessAvailability(candidate.availability, {
    serviceCategory: need.serviceCategory,
    day: need.startDate,
    today,
  });

  const fromAvailability = assessment.availableStaff;
  const fromService =
    candidate.services.find(
      (service) =>
        service.serviceCategory === need.serviceCategory &&
        service.confirmation === 'confirmed',
    )?.availableStaff ?? null;

  const staff = fromAvailability ?? fromService;

  if (staff === null) {
    return component(
      'capacity',
      0,
      'Es ist keine aktuelle Mitarbeiterzahl hinterlegt.',
      true,
    );
  }

  const ratio = staff / need.requiredStaff;
  if (ratio >= 1) {
    return component(
      'capacity',
      1,
      `${staff} Mitarbeiter verfügbar, benötigt werden ${need.requiredStaff}.`,
    );
  }

  return component(
    'capacity',
    ratio,
    `Nur ${staff} von ${need.requiredStaff} benötigten Mitarbeitern verfügbar.`,
  );
}

function scoreCredentials(
  candidate: MatchCandidate,
  need: SubcontractorNeed,
  today: Date,
): MatchComponent {
  const required: readonly CredentialType[] = need.requiredCredentials;

  if (required.length === 0) {
    return component('credentials', 0, 'Der Bedarf fordert keine Nachweise.', true);
  }

  const proven = new Set(
    candidate.qualifications
      .filter((qualification) => countsAsProof(qualificationAsCredential(qualification), today))
      .map((qualification) => qualification.credentialType),
  );

  const missing = required.filter((type) => !proven.has(type));
  const ratio = (required.length - missing.length) / required.length;

  if (missing.length === 0) {
    return component(
      'credentials',
      1,
      'Alle geforderten Nachweise liegen anerkannt und gültig vor.',
    );
  }

  return component(
    'credentials',
    ratio,
    `${missing.length} von ${required.length} geforderten Nachweisen fehlen, sind ungeprüft oder abgelaufen.`,
    true,
  );
}

function scoreDatacenter(candidate: MatchCandidate): MatchComponent {
  if (candidate.company.datacenterExperienceStatus === 'confirmed') {
    return component('datacenter', 1, 'Datacenter-Erfahrung ist belegt.');
  }

  const confirmedDatacenterService = candidate.services.some(
    (service) =>
      service.confirmation === 'confirmed' &&
      DATACENTER_SERVICE_CATEGORIES.includes(service.serviceCategory),
  );
  if (confirmedDatacenterService) {
    return component(
      'datacenter',
      1,
      'Eine bestätigte Datacenter-Leistung ist hinterlegt.',
    );
  }

  if (candidate.company.datacenterExperienceStatus === 'claimed') {
    return component(
      'datacenter',
      0.4,
      'Datacenter-Erfahrung ist selbst angegeben, aber nicht belegt.',
      true,
    );
  }

  if (candidate.company.datacenterExperienceStatus === 'none') {
    return component('datacenter', 0, 'Keine Datacenter-Erfahrung.');
  }

  return component('datacenter', 0, 'Datacenter-Erfahrung ist unbekannt.', true);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Scores one partner against one need.
 *
 * Exclusions come first and short-circuit: a blocked partner or a partner
 * that may not subcontract further when the need requires it gets no score at
 * all, with the reason stated, rather than a low one that might still show up
 * on a shortlist.
 */
export function scorePartner(
  candidate: MatchCandidate,
  need: SubcontractorNeed,
  today: Date = new Date(),
): MatchResult {
  const base: Omit<MatchResult, 'totalScore' | 'components' | 'missingInformation'> = {
    partnerCompanyId: candidate.company.id,
    scoreVersion: MATCH_SCORE_VERSION,
    exclusionReason: null,
  };

  if (candidate.company.isBlocked) {
    return {
      ...base,
      totalScore: 0,
      components: [],
      missingInformation: [],
      exclusionReason:
        candidate.company.blockedReason === null
          ? 'Das Unternehmen ist gesperrt.'
          : `Das Unternehmen ist gesperrt: ${candidate.company.blockedReason}`,
    };
  }

  if (candidate.company.archivedAt !== null) {
    return {
      ...base,
      totalScore: 0,
      components: [],
      missingInformation: [],
      exclusionReason: 'Das Unternehmen ist archiviert.',
    };
  }

  if (
    need.furtherSubcontractingAllowed === 'not_allowed' &&
    candidate.company.staffModel === 'further_subcontractors'
  ) {
    return {
      ...base,
      totalScore: 0,
      components: [],
      missingInformation: [],
      exclusionReason:
        'Der Bedarf verbietet weitere Untervergabe, das Unternehmen arbeitet ausschließlich mit Subunternehmern.',
    };
  }

  const components: MatchComponent[] = [
    scoreService(candidate, need),
    scoreRegion(candidate, need),
    scoreAvailability(candidate, need, today),
    scoreCapacity(candidate, need, today),
    scoreCredentials(candidate, need, today),
    scoreDatacenter(candidate),
  ];

  // Ordered by the canonical key list so the explanation reads the same way
  // every time, whatever order the components were computed in.
  components.sort(
    (a, b) => MATCH_COMPONENT_KEYS.indexOf(a.key) - MATCH_COMPONENT_KEYS.indexOf(b.key),
  );

  const totalScore = round1(
    components.reduce((sum, entry) => sum + entry.points, 0),
  );

  return {
    ...base,
    totalScore,
    components,
    missingInformation: components
      .filter((entry) => entry.missingData)
      .map((entry) => `${entry.label}: ${entry.reason}`),
  };
}

/** Scores a set of candidates and orders them, best first. */
export function rankCandidates(
  candidates: readonly MatchCandidate[],
  need: SubcontractorNeed,
  today: Date = new Date(),
): MatchResult[] {
  return candidates
    .map((candidate) => scorePartner(candidate, need, today))
    .sort((a, b) => {
      if (a.exclusionReason !== null && b.exclusionReason === null) return 1;
      if (a.exclusionReason === null && b.exclusionReason !== null) return -1;
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      // Deterministic tie-break so two equal scores never swap between runs.
      return a.partnerCompanyId.localeCompare(b.partnerCompanyId);
    });
}

/** The weights as a table for the documentation screen. */
export function describeWeights(): Array<{ label: string; weight: number }> {
  return MATCH_COMPONENT_KEYS.map((key) => ({
    label: MATCH_COMPONENT_LABELS[key],
    weight: MATCH_WEIGHTS[key],
  }));
}
