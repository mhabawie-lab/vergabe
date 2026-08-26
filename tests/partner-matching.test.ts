/**
 * Services, availability, credentials and the match engine.
 *
 * The rules under test are the ones that keep a score honest: only confirmed
 * data counts, stale availability is unknown rather than current, an expired
 * credential is not a fulfilled requirement, and missing information is
 * reported as missing instead of scoring as a yes.
 */

import { describe, expect, it } from 'vitest';
import {
  bucketByExpiry,
  classifyCredential,
  countsAsProof,
  daysUntil,
  expiryHorizonOf,
  summarizeCredentials,
  suggestVerificationStatus,
} from '@/modules/partners/credentials';
import {
  assessAvailability,
  availabilityFreshness,
  countsAsCurrent,
  coversDate,
} from '@/modules/partners/availability';
import {
  MATCH_SCORE_VERSION,
  MATCH_WEIGHTS,
  scorePartner,
} from '@/modules/partners/matching';
import { parsePartnerQuery } from '@/modules/partners/query';
import {
  companyInput,
  createStore,
  isoDateTime,
  isoDay,
  ORG_A,
  seedIdealPartner,
  standardNeed,
  USER,
} from './partner-fixtures';
import type { PartnerAvailability } from '@/types/partner';

function availability(
  overrides: Partial<PartnerAvailability> = {},
): PartnerAvailability {
  return {
    id: 'a1',
    partnerCompanyId: 'c1',
    organizationId: ORG_A,
    serviceCategory: 'security',
    availableFrom: isoDay(-10),
    availableUntil: isoDay(100),
    status: 'available',
    availableStaff: 12,
    shiftModel: 'three_shift',
    nightShift: true,
    weekend: true,
    aroundTheClock: true,
    shortNotice: false,
    note: null,
    lastConfirmedAt: isoDateTime(-1),
    createdAt: isoDateTime(-30),
    updatedAt: isoDateTime(-1),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe('Leistungen und Verfügbarkeit', () => {
  it('30 — nur bestätigte Leistungen zählen im Filter', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Muster Wachdienst GmbH'));

    await store.saveService({
      organizationId: ORG_A,
      partnerCompanyId: company.id,
      serviceCategory: 'cleaning',
      serviceLabel: null,
      confirmation: 'self_declared',
      confirmationSource: 'partner_statement',
      capacityNote: null,
      availableStaff: null,
      deliveryMode: 'own',
      note: null,
    });

    const byService = await store.listCompanies(
      ORG_A,
      parsePartnerQuery({ services: 'cleaning' }),
    );
    expect(byService.total).toBe(0);

    await store.saveService({
      organizationId: ORG_A,
      partnerCompanyId: company.id,
      serviceCategory: 'cleaning',
      serviceLabel: null,
      confirmation: 'confirmed',
      confirmationSource: 'manual',
      capacityNote: null,
      availableStaff: null,
      deliveryMode: 'own',
      note: null,
    });

    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ services: 'cleaning' }))).total,
    ).toBe(1);
  });

  it('31 — eine unbekannte Leistungsart zählt nicht als Nachweis', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Muster Wachdienst GmbH'));
    await store.saveService({
      organizationId: ORG_A,
      partnerCompanyId: company.id,
      serviceCategory: 'unknown',
      serviceLabel: null,
      confirmation: 'confirmed',
      confirmationSource: 'manual',
      capacityNote: null,
      availableStaff: null,
      deliveryMode: 'unknown',
      note: null,
    });

    // Created through the store, so the scored need is a real record rather
    // than a hand-built object that could drift from the stored shape.
    const need = await store.saveNeed(standardNeed());
    const detail = await store.findCompanyById(ORG_A, company.id);
    const result = scorePartner(
      {
        company: detail!.company,
        services: detail!.services,
        regions: detail!.regions,
        availability: detail!.availability,
        qualifications: detail!.qualifications,
      },
      need!,
    );

    const service = result.components.find((entry) => entry.key === 'service');
    expect(service?.points).toBe(0);
  });

  it('32 — eine veraltete Verfügbarkeit gilt nicht als aktuell', () => {
    expect(availabilityFreshness(availability({ lastConfirmedAt: isoDateTime(-1) }))).toBe(
      'fresh',
    );
    expect(availabilityFreshness(availability({ lastConfirmedAt: isoDateTime(-35) }))).toBe(
      'ageing',
    );
    expect(availabilityFreshness(availability({ lastConfirmedAt: isoDateTime(-60) }))).toBe(
      'stale',
    );
    expect(availabilityFreshness(availability({ lastConfirmedAt: null }))).toBe('never');

    expect(countsAsCurrent(availability({ lastConfirmedAt: isoDateTime(-60) }))).toBe(false);
  });

  it('33 — eine veraltete Angabe wird als unbekannt gemeldet, nicht mit altem Wert', () => {
    const assessment = assessAvailability(
      [availability({ lastConfirmedAt: isoDateTime(-90) })],
      { serviceCategory: 'security', day: isoDay(10) },
    );

    expect(assessment.status).toBe('unknown');
    expect(assessment.availableStaff).toBeNull();
    expect(assessment.reason).toContain('nicht mehr als aktuell');
  });

  it('34 — ein fehlender Prüfzeitpunkt wird ausgewiesen', () => {
    const assessment = assessAvailability([availability({ lastConfirmedAt: null })], {
      serviceCategory: 'security',
      day: isoDay(10),
    });
    expect(assessment.freshness).toBe('never');
    expect(assessment.status).toBe('unknown');
  });

  it('35 — der Zeitraum wird korrekt geprüft', () => {
    const entry = availability({ availableFrom: '2026-01-01', availableUntil: '2026-06-30' });
    expect(coversDate(entry, '2026-03-01')).toBe(true);
    expect(coversDate(entry, '2025-12-31')).toBe(false);
    expect(coversDate(entry, '2026-07-01')).toBe(false);
    // An open end matches everything after the start.
    expect(coversDate({ availableFrom: '2026-01-01', availableUntil: null }, '2030-01-01')).toBe(
      true,
    );
  });

  it('36 — verfügbare Mitarbeiter werden korrekt gefiltert', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Muster Wachdienst GmbH'));
    await store.saveAvailability({
      organizationId: ORG_A,
      partnerCompanyId: company.id,
      serviceCategory: 'security',
      availableFrom: isoDay(-5),
      availableUntil: isoDay(100),
      status: 'available',
      availableStaff: 8,
      shiftModel: 'day',
      nightShift: false,
      weekend: false,
      aroundTheClock: false,
      shortNotice: false,
      note: null,
      confirmNow: true,
    });

    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ minAvailableStaff: '5' }))).total,
    ).toBe(1);
    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ minAvailableStaff: '20' }))).total,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('Nachweise und Dokumente', () => {
  const accepted = { credentialType: 'guard_permit' as const, reviewStatus: 'accepted' as const };

  it('37 — ein abgelaufener Nachweis gilt nicht als erfüllt', () => {
    const expired = { ...accepted, validUntil: isoDay(-1) };
    expect(classifyCredential(expired)).toBe('expired');
    expect(countsAsProof(expired)).toBe(false);
  });

  it('38 — ein ungeprüfter Nachweis gilt nicht als verifiziert', () => {
    const pending = {
      credentialType: 'guard_permit' as const,
      reviewStatus: 'pending' as const,
      validUntil: isoDay(400),
    };
    expect(classifyCredential(pending)).toBe('pending');
    expect(countsAsProof(pending)).toBe(false);
  });

  it('39 — ein Nachweis ohne Ablaufdatum wird als nicht datiert geführt', () => {
    const undated = { ...accepted, validUntil: null };
    // No date is invented from the issue date.
    expect(classifyCredential(undated)).toBe('undated');
    expect(countsAsProof(undated)).toBe(false);
  });

  it('40 — Ablaufhinweise werden korrekt berechnet', () => {
    expect(expiryHorizonOf({ ...accepted, validUntil: isoDay(20) })).toBe(30);
    expect(expiryHorizonOf({ ...accepted, validUntil: isoDay(45) })).toBe(60);
    expect(expiryHorizonOf({ ...accepted, validUntil: isoDay(80) })).toBe(90);
    expect(expiryHorizonOf({ ...accepted, validUntil: isoDay(200) })).toBeNull();
    expect(daysUntil(isoDay(5), new Date())).toBe(5);

    const buckets = bucketByExpiry([
      { ...accepted, validUntil: isoDay(-5) },
      { ...accepted, validUntil: isoDay(10) },
      { ...accepted, validUntil: isoDay(50) },
      { ...accepted, validUntil: isoDay(80) },
      { credentialType: 'nda' as const, reviewStatus: 'pending' as const, validUntil: isoDay(10) },
    ]);
    expect(buckets.expired).toHaveLength(1);
    expect(buckets.within30).toHaveLength(1);
    expect(buckets.within60).toHaveLength(1);
    expect(buckets.within90).toHaveLength(1);
    expect(buckets.pendingReview).toHaveLength(1);
  });

  it('41 — fehlende Pflichtnachweise werden benannt', () => {
    const summary = summarizeCredentials([{ ...accepted, validUntil: isoDay(400) }]);
    expect(summary.valid).toBe(1);
    expect(summary.missingRequired).toContain('trade_registration');
    expect(summary.missingRequired).toContain('liability_insurance');
    expect(summary.missingRequired).not.toContain('guard_permit');
  });

  it('42 — der Verifizierungsvorschlag bleibt ein Vorschlag', () => {
    const none = suggestVerificationStatus([]);
    expect(none.suggested).toBe('unverified');

    const complete = suggestVerificationStatus([
      { credentialType: 'trade_registration', reviewStatus: 'accepted', validUntil: isoDay(400) },
      { credentialType: 'guard_permit', reviewStatus: 'accepted', validUntil: isoDay(400) },
      { credentialType: 'liability_insurance', reviewStatus: 'accepted', validUntil: isoDay(400) },
    ]);
    expect(complete.suggested).toBe('verified');
  });

  it('43 — ein privates Dokument erhält keine öffentliche URL', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Muster Wachdienst GmbH'));

    const document = await store.saveDocument({
      organizationId: ORG_A,
      partnerCompanyId: company.id,
      partnerQualificationId: null,
      credentialType: 'guard_permit',
      storagePath: `${ORG_A}/${company.id}/muster.pdf`,
      fileName: 'muster.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      checksum: null,
      confidentiality: 'confidential',
      validFrom: null,
      validUntil: isoDay(200),
      note: null,
      uploadedBy: USER,
    });

    expect(document?.storagePath.startsWith('http')).toBe(false);
    // No scanner exists, so the honest default must survive the write.
    expect(document?.scanStatus).toBe('not_scanned');
    expect(document?.reviewStatus).toBe('pending');
  });
});

// ---------------------------------------------------------------------------

describe('Bedarf und Match', () => {
  async function scenario() {
    const { store } = createStore();
    const ideal = await seedIdealPartner(store);
    const need = await store.saveNeed(standardNeed());
    return { store, ideal, need: need! };
  }

  it('44 — legt einen Bedarf an', async () => {
    const { need } = await scenario();
    expect(need.title).toBe('Musterprojekt Objektschutz');
    expect(need.status).toBe('active');
  });

  it('45 — ein passender Partner erhält einen hohen Score mit allen Komponenten', async () => {
    const { store, need } = await scenario();
    const results = await store.recomputeMatches(ORG_A, need.id);

    expect(results).not.toBeNull();
    const best = results![0];
    expect(best?.exclusionReason).toBeNull();
    expect(best?.totalScore).toBeGreaterThan(90);
    expect(best?.components).toHaveLength(6);
    expect(best?.scoreVersion).toBe(MATCH_SCORE_VERSION);
  });

  it('46 — die Teilbewertungen ergeben den Gesamtscore', async () => {
    const { store, need } = await scenario();
    const results = await store.recomputeMatches(ORG_A, need.id);
    const best = results![0]!;

    const sum = best.components.reduce((total, entry) => total + entry.points, 0);
    expect(Math.round(sum * 10) / 10).toBe(best.totalScore);

    const weightSum = Object.values(MATCH_WEIGHTS).reduce((total, weight) => total + weight, 0);
    expect(weightSum).toBe(100);
  });

  it('47 — ein gesperrter Partner wird ausgeschlossen', async () => {
    const { store, ideal, need } = await scenario();
    await store.updateCompany(ORG_A, ideal.id, {
      isBlocked: true,
      blockedReason: 'Musterbegründung',
    });

    const results = await store.recomputeMatches(ORG_A, need.id);
    const entry = results!.find((result) => result.partnerCompanyId === ideal.id);
    expect(entry?.exclusionReason).toContain('gesperrt');
    expect(entry?.totalScore).toBe(0);
  });

  it('48 — eine falsche Leistung erhält keine Leistungspunkte', async () => {
    const { store, need } = await scenario();
    const other = await store.createCompany(companyInput('Beispiel Reinigung GmbH'));
    await store.saveService({
      organizationId: ORG_A,
      partnerCompanyId: other.id,
      serviceCategory: 'cleaning',
      serviceLabel: null,
      confirmation: 'confirmed',
      confirmationSource: 'manual',
      capacityNote: null,
      availableStaff: 5,
      deliveryMode: 'own',
      note: null,
    });

    const results = await store.recomputeMatches(ORG_A, need.id);
    const entry = results!.find((result) => result.partnerCompanyId === other.id);
    const service = entry?.components.find((component) => component.key === 'service');
    expect(service?.points).toBe(0);
  });

  it('49 — nur bestätigte Daten zählen', async () => {
    const { store, need } = await scenario();
    const declared = await store.createCompany(companyInput('Muster Angabe GmbH'));
    await store.saveService({
      organizationId: ORG_A,
      partnerCompanyId: declared.id,
      serviceCategory: 'security',
      serviceLabel: null,
      confirmation: 'self_declared',
      confirmationSource: 'partner_statement',
      capacityNote: null,
      availableStaff: 30,
      deliveryMode: 'own',
      note: null,
    });

    const results = await store.recomputeMatches(ORG_A, need.id);
    const entry = results!.find((result) => result.partnerCompanyId === declared.id);
    const service = entry?.components.find((component) => component.key === 'service');
    expect(service?.points).toBe(0);
    expect(service?.missingData).toBe(true);
    expect(service?.reason).toContain('nicht bestätigt');
  });

  it('50 — abgelaufene Nachweise zählen nicht als erfüllt', async () => {
    const { store, need } = await scenario();
    const partner = await store.createCompany(companyInput('Muster Abgelaufen GmbH'));
    await store.saveService({
      organizationId: ORG_A,
      partnerCompanyId: partner.id,
      serviceCategory: 'security',
      serviceLabel: null,
      confirmation: 'confirmed',
      confirmationSource: 'manual',
      capacityNote: null,
      availableStaff: 20,
      deliveryMode: 'own',
      note: null,
    });
    await store.saveQualification({
      organizationId: ORG_A,
      partnerCompanyId: partner.id,
      credentialType: 'guard_permit',
      title: null,
      issuer: null,
      documentNumber: null,
      validFrom: isoDay(-500),
      validUntil: isoDay(-1),
      reviewStatus: 'accepted',
      reviewedBy: USER,
      note: null,
    });

    const results = await store.recomputeMatches(ORG_A, need.id);
    const entry = results!.find((result) => result.partnerCompanyId === partner.id);
    const credentials = entry?.components.find((component) => component.key === 'credentials');
    expect(credentials?.points).toBe(0);
    expect(credentials?.missingData).toBe(true);
  });

  it('51 — fehlende Daten werden transparent ausgewiesen und zählen nicht positiv', async () => {
    const { store, need } = await scenario();
    const bare = await store.createCompany(companyInput('Muster Ohne Angaben GmbH'));

    const results = await store.recomputeMatches(ORG_A, need.id);
    const entry = results!.find((result) => result.partnerCompanyId === bare.id);

    expect(entry?.missingInformation.length).toBeGreaterThan(0);
    expect(entry?.totalScore).toBe(0);
  });

  it('52 — der Score ist deterministisch', async () => {
    const { store, need } = await scenario();
    const first = await store.recomputeMatches(ORG_A, need.id);
    const second = await store.recomputeMatches(ORG_A, need.id);

    expect(second!.map((entry) => entry.totalScore)).toEqual(
      first!.map((entry) => entry.totalScore),
    );
    expect(second!.map((entry) => entry.partnerCompanyId)).toEqual(
      first!.map((entry) => entry.partnerCompanyId),
    );
  });

  it('53 — die Score-Version wird gespeichert', async () => {
    const { store, need } = await scenario();
    await store.recomputeMatches(ORG_A, need.id);
    const matches = await store.listMatches(ORG_A, need.id);
    expect(matches[0]?.scoreVersion).toBe(MATCH_SCORE_VERSION);
  });

  it('54 — der Shortlist-Status funktioniert und bleibt bei Neuberechnung erhalten', async () => {
    const { store, ideal, need } = await scenario();
    await store.recomputeMatches(ORG_A, need.id);
    const matches = await store.listMatches(ORG_A, need.id);
    const target = matches.find((match) => match.partnerCompanyId === ideal.id)!;

    const updated = await store.updateMatchStatus(ORG_A, target.id, 'shortlisted', USER);
    expect(updated?.status).toBe('shortlisted');

    // Recomputing must not silently un-shortlist somebody.
    await store.recomputeMatches(ORG_A, need.id);
    const after = await store.listMatches(ORG_A, need.id);
    expect(after.find((match) => match.id === target.id)?.status).toBe('shortlisted');
  });

  it('55 — verbotene Weitervergabe schließt reine Vermittler aus', async () => {
    const { store, need } = await scenario();
    const broker = await store.createCompany(
      companyInput('Muster Vermittler GmbH', { staffModel: 'further_subcontractors' }),
    );

    const results = await store.recomputeMatches(ORG_A, need.id);
    const entry = results!.find((result) => result.partnerCompanyId === broker.id);
    expect(entry?.exclusionReason).toContain('weitere Untervergabe');
  });

  it('56 — ein Bedarf einer fremden Organisation liefert keine Matches', async () => {
    const { store, need } = await scenario();
    expect(await store.recomputeMatches('00000000-0000-4000-8000-00000000000b', need.id)).toBeNull();
  });
});
