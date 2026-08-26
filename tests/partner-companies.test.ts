/**
 * Tenancy, roles, company management and the relationship direction.
 *
 * The direction cases matter most: confusing "can work for us" with "is
 * looking for a subcontractor" produces an offer nobody asked for, so the two
 * must never be derived from one another automatically.
 */

import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@/config/roles';
import {
  diffPartner,
  emailDomain,
  isGenericEmailDomain,
  normalizePhone,
  validatePartnerInput,
  websiteDomain,
  type ExistingPartner,
  type PartnerFormInput,
} from '@/modules/partners/validation';
import { suggestDirectionFromSignal } from '@/modules/partners/signals';
import { parsePartnerQuery } from '@/modules/partners/query';
import { companyInput, createStore, ORG_A, ORG_B, USER } from './partner-fixtures';

function form(overrides: Partial<PartnerFormInput> = {}): PartnerFormInput {
  return {
    legalName: 'Muster Wachdienst GmbH',
    tradeName: null,
    relationshipDirection: 'can_work_for_us',
    partnerLevel: 'subcontractor',
    status: 'prospect',
    verificationStatus: 'unverified',
    country: 'DE',
    region: 'Musterland',
    city: 'Musterstadt',
    postalCode: null,
    address: null,
    website: null,
    email: null,
    phone: null,
    registryName: null,
    registryNumber: null,
    vatId: null,
    lei: null,
    staffModel: 'own_staff',
    furtherSubcontractingStatus: 'unknown',
    datacenterExperienceStatus: 'unknown',
    isPreferred: false,
    isBlocked: false,
    blockedReason: null,
    internalRating: null,
    sourceType: null,
    sourceName: null,
    sourceUrl: null,
    internalNotes: null,
    ...overrides,
  };
}

const EXISTING: ExistingPartner[] = [
  {
    id: 'p1',
    legalName: 'Beispiel Sicherheit GmbH',
    normalizedName: 'beispiel sicherheit',
    country: 'DE',
    registryNumber: 'HRB 11111',
    vatId: 'DE111111111',
    website: 'https://beispiel-sicherheit.invalid/',
    email: 'info@beispiel-sicherheit.invalid',
    phone: '+49 30 1111111',
    city: 'Beispielstadt',
    address: 'Musterweg 1',
  },
];

// ---------------------------------------------------------------------------

describe('Mandantentrennung und Rollen', () => {
  it('1 — eine fremde Organisation kann keinen Partner lesen', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Muster Wachdienst GmbH'));

    expect(await store.findCompanyRecord(ORG_B, company.id)).toBeNull();
    expect(await store.findCompanyById(ORG_B, company.id)).toBeNull();
  });

  it('2 — eine fremde Organisation kann keinen Partner ändern', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Muster Wachdienst GmbH'));

    expect(await store.updateCompany(ORG_B, company.id, { status: 'blocked' })).toBeNull();
    expect((await store.findCompanyRecord(ORG_A, company.id))?.status).toBe('prospect');
  });

  it('3 — fremde IDs erscheinen als „nicht gefunden", nicht als Rechtefehler', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Muster Wachdienst GmbH'));

    // Same answer as a genuinely unknown id — otherwise the difference would
    // confirm that the id exists somewhere.
    expect(await store.findCompanyById(ORG_B, company.id)).toBeNull();
    expect(await store.findCompanyById(ORG_B, '00000000-0000-4000-8000-999999999999')).toBeNull();
  });

  it('4 — Betrachter dürfen lesen, aber nicht bearbeiten', () => {
    expect(ROLE_PERMISSIONS.viewer).toContain('subcontractors:read');
    expect(ROLE_PERMISSIONS.viewer).not.toContain('subcontractors:write');
  });

  it('5 — ohne Finanzrecht keine Konditionen', () => {
    expect(ROLE_PERMISSIONS.viewer).not.toContain('subcontractors:financial');
    expect(ROLE_PERMISSIONS.bid_manager).not.toContain('subcontractors:financial');
    expect(ROLE_PERMISSIONS.org_admin).toContain('subcontractors:financial');
  });

  it('6 — ohne Dokumentrecht keine Nachweise', () => {
    expect(ROLE_PERMISSIONS.viewer).not.toContain('subcontractors:documents');
    expect(ROLE_PERMISSIONS.bid_manager).toContain('subcontractors:documents');
  });

  it('7 — Unterdatensätze eines fremden Partners lassen sich nicht anlegen', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Muster Wachdienst GmbH'));

    const attempt = await store.saveService({
      organizationId: ORG_B,
      partnerCompanyId: company.id,
      serviceCategory: 'security',
      serviceLabel: null,
      confirmation: 'confirmed',
      confirmationSource: 'manual',
      capacityNote: null,
      availableStaff: null,
      deliveryMode: 'own',
      note: null,
    });

    expect(attempt).toBeNull();
  });

  it('8 — Konditionen sind je Organisation getrennt', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Muster Wachdienst GmbH'));
    await store.saveRate({
      organizationId: ORG_A,
      partnerCompanyId: company.id,
      serviceCategory: 'security',
      region: null,
      rateModel: 'hourly',
      unit: 'Stunde',
      netAmount: 28.5,
      currency: 'EUR',
      validFrom: null,
      validUntil: null,
      surcharges: null,
      negotiationStatus: 'quoted',
      internalNote: null,
      createdBy: USER,
    });

    expect(await store.listRates(ORG_A, company.id)).toHaveLength(1);
    expect(await store.listRates(ORG_B, company.id)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('Firmenverwaltung', () => {
  it('9 — legt einen Partner an', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Muster Wachdienst GmbH'));
    expect(company.legalName).toBe('Muster Wachdienst GmbH');
    expect(company.organizationId).toBe(ORG_A);
  });

  it('10 — bearbeitet einen Partner', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Muster Wachdienst GmbH'));

    const updated = await store.updateCompany(ORG_A, company.id, {
      status: 'qualified',
      city: 'Beispielstadt',
    });

    expect(updated?.status).toBe('qualified');
    expect(updated?.city).toBe('Beispielstadt');
  });

  it('11 — verlangt einen Firmennamen', () => {
    const result = validatePartnerInput(form({ legalName: '   ' }), []);
    expect(result.valid).toBe(false);
    expect(result.messages.map((message) => message.code)).toContain('missing_name');
  });

  it('12 — prüft die Website', () => {
    expect(validatePartnerInput(form({ website: 'kein hostname' }), []).valid).toBe(false);
    expect(
      validatePartnerInput(form({ website: 'muster.invalid' }), []).normalized.website,
    ).toBe('https://muster.invalid/');
  });

  it('13 — prüft Register-, Umsatzsteuer- und LEI-Kennungen', () => {
    expect(validatePartnerInput(form({ registryNumber: '!!' }), []).valid).toBe(false);
    expect(validatePartnerInput(form({ vatId: 'XX' }), []).valid).toBe(false);
    expect(validatePartnerInput(form({ lei: 'ZU-KURZ' }), []).valid).toBe(false);
    expect(
      validatePartnerInput(form({ registryNumber: 'HRB 12345', vatId: 'DE123456789' }), [])
        .valid,
    ).toBe(true);
  });

  it('14 — verhindert eine exakte Dublette über die Registernummer', () => {
    const result = validatePartnerInput(
      form({ legalName: 'Ganz Andere GmbH', registryNumber: 'HRB 11111', country: 'DE' }),
      EXISTING,
    );
    expect(result.valid).toBe(false);
    expect(result.messages[0]?.code).toBe('duplicate_registry_number');
  });

  it('15 — verhindert eine exakte Dublette über den Namen', () => {
    const result = validatePartnerInput(
      form({ legalName: 'Beispiel Sicherheit GmbH' }),
      EXISTING,
    );
    expect(result.valid).toBe(false);
    expect(result.messages[0]?.code).toBe('duplicate_partner');
  });

  it('16 — warnt bei ähnlichem Namen, blockiert aber nicht', () => {
    const result = validatePartnerInput(
      form({ legalName: 'Beispiel Sicherheitt GmbH' }),
      EXISTING,
    );
    expect(result.valid).toBe(true);
    expect(result.messages[0]?.severity).toBe('warning');
    expect(result.messages[0]?.code).toBe('possible_duplicate_name');
  });

  it('17 — warnt bei gleicher Website-Domain, Telefonnummer und Anschrift', () => {
    const byWebsite = validatePartnerInput(
      form({ legalName: 'Muster Alpha GmbH', website: 'www.beispiel-sicherheit.invalid' }),
      EXISTING,
    );
    expect(byWebsite.messages.map((message) => message.code)).toContain(
      'possible_duplicate_website',
    );

    const byPhone = validatePartnerInput(
      form({ legalName: 'Muster Beta GmbH', phone: '0049 30 1111111' }),
      EXISTING,
    );
    expect(byPhone.messages.map((message) => message.code)).toContain(
      'possible_duplicate_phone',
    );

    const byAddress = validatePartnerInput(
      form({ legalName: 'Muster Gamma GmbH', address: 'Musterweg 1', city: 'Beispielstadt' }),
      EXISTING,
    );
    expect(byAddress.messages.map((message) => message.code)).toContain(
      'possible_duplicate_address',
    );
  });

  it('18 — eine Freemail-Domain löst keine Dublettenwarnung aus', () => {
    expect(isGenericEmailDomain(emailDomain('a@gmail.com'))).toBe(true);
    expect(isGenericEmailDomain(emailDomain('a@muster-firma.invalid'))).toBe(false);
    expect(websiteDomain('https://www.muster.invalid/pfad')).toBe('muster.invalid');
    expect(normalizePhone('+49 (0)30 123456')).toBe('4930123456');
  });

  it('19 — eine Sperrung ohne Begründung wird abgelehnt', () => {
    const result = validatePartnerInput(form({ isBlocked: true }), []);
    expect(result.valid).toBe(false);
    expect(result.messages.map((message) => message.code)).toContain(
      'missing_block_reason',
    );
  });

  it('20 — gesperrt und bevorzugt schließen sich aus', () => {
    const result = validatePartnerInput(
      form({ isBlocked: true, blockedReason: 'Musterbegründung', isPreferred: true }),
      [],
    );
    expect(result.valid).toBe(false);
    expect(result.messages.map((message) => message.code)).toContain(
      'blocked_and_preferred',
    );
  });

  it('21 — ein gesperrter Partner bleibt in der Liste sichtbar', async () => {
    const { store } = createStore();
    const company = await store.createCompany(
      companyInput('Muster Wachdienst GmbH', {
        isBlocked: true,
        blockedReason: 'Musterbegründung',
      }),
    );

    const all = await store.listCompanies(ORG_A, parsePartnerQuery({}));
    expect(all.items.map((item) => item.id)).toContain(company.id);
    expect(all.items[0]?.isBlocked).toBe(true);

    const onlyBlocked = await store.listCompanies(
      ORG_A,
      parsePartnerQuery({ blocked: 'true' }),
    );
    expect(onlyBlocked.total).toBe(1);
  });

  it('22 — ein archivierter Partner bleibt historisch erhalten', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Muster Wachdienst GmbH'));
    await store.updateCompany(ORG_A, company.id, { status: 'archived' });

    const standard = await store.listCompanies(ORG_A, parsePartnerQuery({}));
    expect(standard.total).toBe(0);

    const withArchived = await store.listCompanies(
      ORG_A,
      parsePartnerQuery({ includeArchived: 'true' }),
    );
    expect(withArchived.total).toBe(1);
    // The record itself is untouched — archiving hides, it does not delete.
    expect(await store.findCompanyRecord(ORG_A, company.id)).not.toBeNull();
  });

  it('23 — der bearbeitete Datensatz ist nicht seine eigene Dublette', () => {
    const result = validatePartnerInput(
      form({ legalName: 'Beispiel Sicherheit GmbH' }),
      EXISTING,
      'p1',
    );
    expect(result.valid).toBe(true);
  });

  it('24 — unterscheidet Status-, Sperr- und Notizänderung', () => {
    const before = validatePartnerInput(form(), []).normalized;
    const after = validatePartnerInput(
      form({
        status: 'qualified',
        isBlocked: true,
        blockedReason: 'Musterbegründung',
        internalNotes: 'Muster',
      }),
      [],
    ).normalized;

    const changes = diffPartner(before, after);
    expect(changes.statusChanged).toBe(true);
    expect(changes.blockChanged).toBe(true);
    expect(changes.notesChanged).toBe(true);
    expect(changes.preferredChanged).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('Beziehungsrichtung', () => {
  it('25 — kann für uns arbeiten', async () => {
    const { store } = createStore();
    await store.createCompany(
      companyInput('Muster Wachdienst GmbH', { relationshipDirection: 'can_work_for_us' }),
    );

    const result = await store.listCompanies(
      ORG_A,
      parsePartnerQuery({ directions: 'can_work_for_us' }),
    );
    expect(result.total).toBe(1);
  });

  it('26 — sucht selbst Subunternehmer', async () => {
    const { store } = createStore();
    await store.createCompany(
      companyInput('Beispiel Bau AG', { relationshipDirection: 'may_hire_us' }),
    );

    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ directions: 'may_hire_us' })))
        .total,
    ).toBe(1);
    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ directions: 'can_work_for_us' })))
        .total,
    ).toBe(0);
  });

  it('27 — beide Richtungen zugleich', async () => {
    const { store } = createStore();
    await store.createCompany(
      companyInput('Muster Beides GmbH', { relationshipDirection: 'both' }),
    );

    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ directions: 'both' }))).total,
    ).toBe(1);
  });

  it('28 — eine Firma mit Bedarfssignal erscheint im richtigen Bereich', async () => {
    const { store } = createStore();
    const company = await store.createCompany(
      companyInput('Beispiel Bau AG', { relationshipDirection: 'can_work_for_us' }),
    );

    await store.saveSignal({
      organizationId: ORG_A,
      partnerCompanyId: company.id,
      companyNameRaw: null,
      signalType: 'seeks_security',
      serviceCategory: 'security',
      projectName: 'Musterprojekt',
      country: 'DE',
      region: null,
      city: null,
      description: null,
      sourceType: 'website',
      sourceName: 'Musterquelle',
      sourceUrl: null,
      observedAt: new Date().toISOString().slice(0, 10),
      validUntil: null,
      confidence: 'medium',
      status: 'new',
      assignedTo: null,
      nextAction: null,
      followUpAt: null,
      internalNote: null,
      createdBy: USER,
    });

    const withDemand = await store.listCompanies(
      ORG_A,
      parsePartnerQuery({ demand: 'true' }),
    );
    expect(withDemand.total).toBe(1);
    expect(withDemand.items[0]?.hasOpenDemandSignal).toBe(true);
  });

  it('29 — ein Signal ändert die Beziehungsrichtung nicht automatisch', async () => {
    const { store } = createStore();
    const company = await store.createCompany(
      companyInput('Beispiel Bau AG', { relationshipDirection: 'can_work_for_us' }),
    );

    await store.saveSignal({
      organizationId: ORG_A,
      partnerCompanyId: company.id,
      companyNameRaw: null,
      signalType: 'seeks_subcontractor',
      serviceCategory: null,
      projectName: null,
      country: null,
      region: null,
      city: null,
      description: null,
      sourceType: 'press',
      sourceName: 'Musterquelle',
      sourceUrl: null,
      observedAt: new Date().toISOString().slice(0, 10),
      validUntil: null,
      confidence: 'medium',
      status: 'new',
      assignedTo: null,
      nextAction: null,
      followUpAt: null,
      internalNote: null,
      createdBy: USER,
    });

    // The stored direction is untouched; only a suggestion is offered.
    const stored = await store.findCompanyRecord(ORG_A, company.id);
    expect(stored?.relationshipDirection).toBe('can_work_for_us');

    const suggestion = suggestDirectionFromSignal(
      { signalType: 'seeks_subcontractor' },
      'can_work_for_us',
    );
    expect(suggestion.suggested).toBe('both');
    expect(suggestion.changed).toBe(true);
  });
});
