import { beforeEach, describe, expect, it } from 'vitest';
import {
  createEmptyReferenceTables,
  MemoryReferenceStore,
  type ReferenceTables,
} from '@/lib/db/memory/reference-store';
import { ROLE_PERMISSIONS } from '@/config/roles';
import {
  applyConfirmationAction,
  canBulkConfirm,
  ConfirmationRuleError,
  CONFIRMATION_AUDIT_ACTIONS,
  countsAsEvidence,
} from '@/modules/references/confirmation';
import { classifyReferenceProject } from '@/modules/references/classification';
import { proposeColumnMapping } from '@/modules/references/column-mapping';
import { runImport } from '@/modules/references/import-pipeline';
import { parseCsv } from '@/modules/references/parse/csv';
import { buildSearchProfileSuggestions } from '@/modules/references/search-profile-suggestions';

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';
const USER = '00000000-0000-4000-8000-0000000000u1';

const CSV = [
  'Objekt-Nr.;Objektname;Objektart;Ort;Kunde;Schichten',
  'BSP-0001;Security Musterwerk Nord;Werksgelände;Musterstadt;Beispiel GmbH;218/146/0',
  'BSP-0002;Objekt 47 Nordzufahrt;Datacenter;Beispielhausen;Beispiel GmbH;96/96/0',
  'BSP-0003;Security Verwaltung Süd;Bürogebäude;Musterhafen;Muster GmbH;52/52/0',
].join('\n');

/** Imports the fixture so every case starts from real proposals. */
async function seed(): Promise<{
  tables: ReferenceTables;
  store: MemoryReferenceStore;
}> {
  const tables = createEmptyReferenceTables();
  const store = new MemoryReferenceStore(tables);
  const table = parseCsv(CSV);

  await runImport(
    store,
    { organizationId: ORG_A, userId: USER },
    table,
    proposeColumnMapping(table.headers),
    'test.csv',
    'csv',
    { includeWarningRows: false },
    false,
  );

  return { tables, store };
}

/** The service of the first row, which carries a `security` proposal. */
function securityService(tables: ReferenceTables) {
  const service = tables.services.find(
    (entry) => entry.serviceCategory === 'security',
  );
  if (service === undefined) throw new Error('Testdaten unvollständig');
  return service;
}

describe('Zustandsübergänge', () => {
  const proposal = {
    serviceCategory: 'security' as const,
    confirmationStatus: 'proposed' as const,
    confirmedByUser: false,
    confirmedAt: null,
    confirmedBy: null,
  };

  it('bestätigt einen Vorschlag', () => {
    const next = applyConfirmationAction(proposal, 'confirm', USER, null);
    expect(next.confirmationStatus).toBe('confirmed');
    expect(next.confirmedByUser).toBe(true);
    expect(next.serviceCategory).toBe('security');
    expect(next.confirmedBy).toBe(USER);
    expect(next.confirmedAt).not.toBeNull();
  });

  it('ändert die Kategorie und bestätigt sie als manuell', () => {
    const next = applyConfirmationAction(
      proposal,
      'change_and_confirm',
      USER,
      'cleaning',
    );
    expect(next.serviceCategory).toBe('cleaning');
    expect(next.confirmationStatus).toBe('manual');
    expect(next.confirmedByUser).toBe(true);
  });

  it('verwirft einen Vorschlag und behält die vorgeschlagene Kategorie', () => {
    const next = applyConfirmationAction(proposal, 'reject', USER, null);
    expect(next.confirmationStatus).toBe('rejected');
    expect(next.confirmedByUser).toBe(false);
    // The record still shows what was proposed and turned down.
    expect(next.serviceCategory).toBe('security');
  });

  it('markiert als unbekannt', () => {
    const next = applyConfirmationAction(proposal, 'mark_unknown', USER, null);
    expect(next.confirmationStatus).toBe('unknown');
    expect(next.serviceCategory).toBe('unknown');
    expect(next.confirmedByUser).toBe(false);
  });

  it('setzt eine Bestätigung zurück', () => {
    const confirmed = applyConfirmationAction(proposal, 'confirm', USER, null);
    const reset = applyConfirmationAction(
      { ...proposal, ...confirmed },
      'reset',
      USER,
      null,
    );

    expect(reset.confirmationStatus).toBe('proposed');
    expect(reset.confirmedByUser).toBe(false);
    expect(reset.confirmedAt).toBeNull();
    expect(reset.confirmedBy).toBeNull();
  });

  it('lässt eine unbestimmte Kategorie nicht bestätigen', () => {
    expect(() =>
      applyConfirmationAction(
        { ...proposal, serviceCategory: 'unknown' },
        'confirm',
        USER,
        null,
      ),
    ).toThrow(ConfirmationRuleError);
  });

  it('behandelt die Auswahl von unknown wie „als unbekannt markieren"', () => {
    const next = applyConfirmationAction(
      proposal,
      'change_and_confirm',
      USER,
      'unknown',
    );
    expect(next.confirmationStatus).toBe('unknown');
    expect(next.confirmedByUser).toBe(false);
  });

  it('verlangt für die Kategorieänderung eine Kategorie', () => {
    expect(() =>
      applyConfirmationAction(proposal, 'change_and_confirm', USER, null),
    ).toThrow(ConfirmationRuleError);
  });

  it('zählt nur confirmed und manual als Nachweis', () => {
    expect(countsAsEvidence('confirmed')).toBe(true);
    expect(countsAsEvidence('manual')).toBe(true);
    expect(countsAsEvidence('proposed')).toBe(false);
    expect(countsAsEvidence('rejected')).toBe(false);
    expect(countsAsEvidence('unknown')).toBe(false);
  });
});

describe('Bestätigung im Speicher', () => {
  let tables: ReferenceTables;
  let store: MemoryReferenceStore;

  beforeEach(async () => {
    ({ tables, store } = await seed());
  });

  it('legt importierte Leistungen als offenen Vorschlag an', () => {
    expect(tables.services.length).toBeGreaterThan(0);
    expect(
      tables.services.every((service) => service.confirmationStatus === 'proposed'),
    ).toBe(true);
    expect(tables.services.every((service) => service.confirmedAt === null)).toBe(true);
  });

  it('speichert eine Bestätigung mit Zeitpunkt und Benutzer', async () => {
    const service = securityService(tables);

    const result = await store.applyServiceDecision({
      organizationId: ORG_A,
      serviceId: service.id,
      action: 'confirm',
      targetCategory: null,
      userId: USER,
    });

    expect(result).not.toBeNull();
    expect(result?.before.confirmationStatus).toBe('proposed');
    expect(result?.after.confirmationStatus).toBe('confirmed');
    expect(result?.after.confirmedBy).toBe(USER);
    expect(result?.after.confirmedAt).not.toBeNull();
  });

  it('meldet vorherigen und neuen Wert bei einer Kategorieänderung', async () => {
    const service = securityService(tables);

    const result = await store.applyServiceDecision({
      organizationId: ORG_A,
      serviceId: service.id,
      action: 'change_and_confirm',
      targetCategory: 'facility_management',
      userId: USER,
    });

    expect(result?.before.serviceCategory).toBe('security');
    expect(result?.after.serviceCategory).toBe('facility_management');
    expect(result?.after.confirmationStatus).toBe('manual');
  });

  it('verweigert die Entscheidung für eine fremde Organisation', async () => {
    const service = securityService(tables);

    const result = await store.applyServiceDecision({
      organizationId: ORG_B,
      serviceId: service.id,
      action: 'confirm',
      targetCategory: null,
      userId: USER,
    });

    // Reported as "not found", so a probe cannot confirm the id exists.
    expect(result).toBeNull();
    expect(tables.services.find((entry) => entry.id === service.id)?.confirmationStatus)
      .toBe('proposed');
  });

  it('gibt fremde Leistungen auch bei bekannter ID nicht heraus', async () => {
    const service = securityService(tables);

    expect(await store.listServicesByIds(ORG_A, [service.id])).toHaveLength(1);
    expect(await store.listServicesByIds(ORG_B, [service.id])).toHaveLength(0);
  });

  it('schreibt einen Audit-Eintrag mit altem und neuem Wert', async () => {
    const service = securityService(tables);

    const result = await store.applyServiceDecision({
      organizationId: ORG_A,
      serviceId: service.id,
      action: 'change_and_confirm',
      targetCategory: 'cleaning',
      userId: USER,
    });

    await store.recordAuditEntry({
      organizationId: ORG_A,
      userId: USER,
      action: CONFIRMATION_AUDIT_ACTIONS.change_and_confirm,
      resourceType: 'reference_project_services',
      resourceId: service.id,
      metadata: {
        referenceProjectId: result?.referenceProjectId,
        previousCategory: result?.before.serviceCategory,
        newCategory: result?.after.serviceCategory,
        previousStatus: result?.before.confirmationStatus,
        newStatus: result?.after.confirmationStatus,
      },
    });

    const entries = await store.listAuditEntries(
      ORG_A,
      'reference_project_services',
      [service.id],
      10,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe('service_category_changed');
    expect(entries[0]?.userId).toBe(USER);
    expect(entries[0]?.metadata['previousCategory']).toBe('security');
    expect(entries[0]?.metadata['newCategory']).toBe('cleaning');
    expect(entries[0]?.metadata['previousStatus']).toBe('proposed');
    expect(entries[0]?.metadata['newStatus']).toBe('manual');
  });

  it('zeigt Audit-Einträge einer fremden Organisation nicht', async () => {
    const service = securityService(tables);

    await store.recordAuditEntry({
      organizationId: ORG_A,
      userId: USER,
      action: CONFIRMATION_AUDIT_ACTIONS.confirm,
      resourceType: 'reference_project_services',
      resourceId: service.id,
      metadata: {},
    });

    expect(
      await store.listAuditEntries(ORG_B, 'reference_project_services', [service.id], 10),
    ).toHaveLength(0);
  });
});

describe('Berechtigungen', () => {
  it('erlaubt einem Viewer nur das Lesen', () => {
    expect(ROLE_PERMISSIONS.viewer).toContain('references:read');
    expect(ROLE_PERMISSIONS.viewer).not.toContain('references:write');
  });

  it('erlaubt Bid Manager, Org-Admin und Super-Admin das Bearbeiten', () => {
    for (const role of ['bid_manager', 'org_admin', 'super_admin'] as const) {
      expect(ROLE_PERMISSIONS[role]).toContain('references:write');
    }
  });
});

describe('Sammelbestätigung', () => {
  it('erlaubt eine einheitliche Auswahl offener Vorschläge', () => {
    const check = canBulkConfirm([
      { serviceCategory: 'security', confirmationStatus: 'proposed' },
      { serviceCategory: 'security', confirmationStatus: 'proposed' },
    ]);
    expect(check.allowed).toBe(true);
  });

  it('lehnt gemischte Kategorien ab', () => {
    const check = canBulkConfirm([
      { serviceCategory: 'security', confirmationStatus: 'proposed' },
      { serviceCategory: 'cleaning', confirmationStatus: 'proposed' },
    ]);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('unterschiedliche Kategorien');
  });

  it('lehnt unbestimmte Leistungsarten ab', () => {
    const check = canBulkConfirm([
      { serviceCategory: 'unknown', confirmationStatus: 'proposed' },
    ]);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Unbestimmte');
  });

  it('lehnt bereits entschiedene Einträge ab', () => {
    const check = canBulkConfirm([
      { serviceCategory: 'security', confirmationStatus: 'confirmed' },
    ]);
    expect(check.allowed).toBe(false);
  });

  it('lehnt eine leere Auswahl ab', () => {
    expect(canBulkConfirm([]).allowed).toBe(false);
  });
});

describe('Auswirkung auf Kennzahlen und Vorschläge', () => {
  it('zählt eine unbestätigte Leistung nicht als bestätigte Leistungsart', async () => {
    const { store } = await seed();
    const metrics = await store.getMetrics(ORG_A);
    expect(metrics.confirmedServiceCategories).toBe(0);
  });

  it('zählt sie nach der Bestätigung', async () => {
    const { tables, store } = await seed();

    await store.applyServiceDecision({
      organizationId: ORG_A,
      serviceId: securityService(tables).id,
      action: 'confirm',
      targetCategory: null,
      userId: USER,
    });

    const metrics = await store.getMetrics(ORG_A);
    expect(metrics.confirmedServiceCategories).toBe(1);
  });

  it('zählt eine verworfene Leistung nicht', async () => {
    const { tables, store } = await seed();

    await store.applyServiceDecision({
      organizationId: ORG_A,
      serviceId: securityService(tables).id,
      action: 'reject',
      targetCategory: null,
      userId: USER,
    });

    expect((await store.getMetrics(ORG_A)).confirmedServiceCategories).toBe(0);
  });

  it('erzeugt aus einem unbestätigten Vorschlag kein Suchprofil', async () => {
    const { store } = await seed();
    const query = {
      q: undefined,
      clientId: undefined,
      city: undefined,
      region: undefined,
      objectType: undefined,
      services: undefined,
      statuses: undefined,
      referenceStatus: undefined,
      confirmationStatus: undefined,
      periodFrom: undefined,
      periodTo: undefined,
      sort: 'start_date' as const,
      direction: 'desc' as const,
      page: 1,
      pageSize: 50,
    };

    const list = await store.listProjects(ORG_A, query);
    const suggestions = buildSearchProfileSuggestions({
      projects: list.items,
      confirmedServices: list.items.flatMap((item) =>
        item.confirmedServiceCategories.map((serviceCategory) => ({
          projectId: item.id,
          serviceCategory,
        })),
      ),
    });

    expect(suggestions).toHaveLength(0);
  });

  it('erzeugt nach der Bestätigung einen gekennzeichneten Vorschlag', async () => {
    const { tables, store } = await seed();

    await store.applyServiceDecision({
      organizationId: ORG_A,
      serviceId: securityService(tables).id,
      action: 'confirm',
      targetCategory: null,
      userId: USER,
    });

    const query = {
      q: undefined,
      clientId: undefined,
      city: undefined,
      region: undefined,
      objectType: undefined,
      services: undefined,
      statuses: undefined,
      referenceStatus: undefined,
      confirmationStatus: undefined,
      periodFrom: undefined,
      periodTo: undefined,
      sort: 'start_date' as const,
      direction: 'desc' as const,
      page: 1,
      pageSize: 50,
    };

    const list = await store.listProjects(ORG_A, query);
    const suggestions = buildSearchProfileSuggestions({
      projects: list.items,
      confirmedServices: list.items.flatMap((item) =>
        item.confirmedServiceCategories.map((serviceCategory) => ({
          projectId: item.id,
          serviceCategory,
        })),
      ),
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.isProposal).toBe(true);
    expect(suggestions[0]?.filters.sectors).toContain('security_services');
  });

  it('markiert Projekte mit ausschließlich offenen Vorschlägen', async () => {
    const { store } = await seed();
    const list = await store.listProjects(ORG_A, {
      q: undefined,
      clientId: undefined,
      city: undefined,
      region: undefined,
      objectType: undefined,
      services: undefined,
      statuses: undefined,
      referenceStatus: undefined,
      confirmationStatus: undefined,
      periodFrom: undefined,
      periodTo: undefined,
      sort: 'start_date' as const,
      direction: 'desc' as const,
      page: 1,
      pageSize: 50,
    });

    expect(list.items.every((item) => item.hasOnlyProposals)).toBe(true);
    expect(list.items.every((item) => item.confirmedServiceCategories.length === 0)).toBe(
      true,
    );
  });

  it('filtert nach Bestätigungsstatus', async () => {
    const { tables, store } = await seed();
    const base = {
      q: undefined,
      clientId: undefined,
      city: undefined,
      region: undefined,
      objectType: undefined,
      services: undefined,
      statuses: undefined,
      referenceStatus: undefined,
      periodFrom: undefined,
      periodTo: undefined,
      sort: 'start_date' as const,
      direction: 'desc' as const,
      page: 1,
      pageSize: 50,
    };

    expect(
      (await store.listProjects(ORG_A, { ...base, confirmationStatus: 'evidence' })).total,
    ).toBe(0);

    await store.applyServiceDecision({
      organizationId: ORG_A,
      serviceId: securityService(tables).id,
      action: 'confirm',
      targetCategory: null,
      userId: USER,
    });

    expect(
      (await store.listProjects(ORG_A, { ...base, confirmationStatus: 'evidence' })).total,
    ).toBe(1);
    expect(
      (await store.listProjects(ORG_A, { ...base, confirmationStatus: 'proposed' })).total,
    ).toBe(2);
  });
});

describe('Datacenter bleibt Objektart', () => {
  it('erzeugt aus der Objektart keinen Leistungsvorschlag', () => {
    const services = classifyReferenceProject({
      projectName: 'Objekt 47 Nordzufahrt',
      objectType: 'Datacenter',
    });
    expect(services[0]?.serviceCategory).toBe('unknown');
  });

  it('lässt einen unbekannten Projektnamen unbestätigt und nicht bestätigbar', async () => {
    const { tables, store } = await seed();

    const unknownService = tables.services.find(
      (service) => service.serviceCategory === 'unknown',
    );
    expect(unknownService).toBeDefined();
    expect(unknownService?.confirmationStatus).toBe('proposed');

    // Confirming it directly is refused — the honest action is mark_unknown.
    await expect(
      store.applyServiceDecision({
        organizationId: ORG_A,
        serviceId: unknownService?.id ?? '',
        action: 'confirm',
        targetCategory: null,
        userId: USER,
      }),
    ).rejects.toThrow(ConfirmationRuleError);
  });
});
