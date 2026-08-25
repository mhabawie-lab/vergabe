/**
 * Customer forms, decision notes and the reference search.
 *
 * The search cases here run against the in-process store. Their SQL
 * counterparts live in `supabase/tests/reference-search.sql` and assert the
 * same expectations against the RPC of migration 0010, so the two adapters are
 * held to one shared definition of each filter rather than to two.
 *
 * Every value in this file is invented. Real customer data never belongs in
 * the repository (`docs/data-protection.md`, section 1).
 */

import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@/config/roles';
import {
  createEmptyReferenceTables,
  MemoryReferenceStore,
  type ReferenceTables,
} from '@/lib/db/memory/reference-store';
import {
  CLIENT_AUDIT_ACTIONS,
  CLIENT_NAME_MAX_LENGTH,
  diffClient,
  normalizeWebsite,
  normalizeWhitespace,
  validateClientInput,
  type ExistingClient,
} from '@/modules/references/client-validation';
import { parseReferenceQuery } from '@/modules/references/query';
import type { ReferenceServiceCategory } from '@/types/reference';

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';
const USER = '00000000-0000-4000-8000-0000000000u1';

const EXISTING: ExistingClient[] = [
  { id: 'c1', name: 'Muster Alpha GmbH', normalizedName: 'muster alpha' },
  { id: 'c2', name: 'Beispiel Beta AG', normalizedName: 'beispiel beta' },
];

function form(overrides: Partial<Parameters<typeof validateClientInput>[0]> = {}) {
  return {
    name: 'Neue Musterfirma GmbH',
    country: 'DE',
    website: null,
    notes: null,
    isActive: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Customer form validation
// ---------------------------------------------------------------------------

describe('Kundenformular', () => {
  it('1 — verlangt einen Firmennamen', () => {
    const result = validateClientInput(form({ name: '   ' }), EXISTING);
    expect(result.valid).toBe(false);
    expect(result.messages.map((message) => message.code)).toContain('missing_name');
  });

  it('2 — lehnt einen zu langen Firmennamen ab', () => {
    const result = validateClientInput(
      form({ name: 'M'.repeat(CLIENT_NAME_MAX_LENGTH + 1) }),
      EXISTING,
    );
    expect(result.valid).toBe(false);
    expect(result.messages.map((message) => message.code)).toContain('name_too_long');
  });

  it('3 — behält die Schreibweise des Namens bei und normalisiert nur Leerraum', () => {
    const result = validateClientInput(form({ name: '  IBM   Muster  GmbH ' }), []);
    expect(result.normalized.name).toBe('IBM Muster GmbH');
    expect(normalizeWhitespace(' a  b ')).toBe('a b');
  });

  it('4 — ergänzt https:// bei einer bloßen Domain', () => {
    expect(normalizeWebsite('beispiel.invalid').url).toBe('https://beispiel.invalid/');
  });

  it('5 — weist eine unbrauchbare Website als Fehler aus', () => {
    const result = validateClientInput(form({ website: 'kein hostname' }), EXISTING);
    expect(result.valid).toBe(false);
    expect(result.messages.map((message) => message.code)).toContain('invalid_website');
  });

  it('6 — akzeptiert nur einen zweistelligen Ländercode', () => {
    expect(validateClientInput(form({ country: 'Deutschland' }), EXISTING).valid).toBe(
      false,
    );
    expect(validateClientInput(form({ country: 'de' }), EXISTING).normalized.country).toBe(
      'DE',
    );
  });

  it('7 — meldet einen exakt gleichen Kunden als Fehler', () => {
    const result = validateClientInput(form({ name: 'Muster Alpha GmbH' }), EXISTING);
    expect(result.valid).toBe(false);
    expect(result.messages[0]?.code).toBe('duplicate_client');
  });

  it('8 — meldet einen ähnlichen Kunden nur als Warnung', () => {
    const result = validateClientInput(form({ name: 'Muster Alphaa GmbH' }), EXISTING);
    // Eine Warnung blockiert das Speichern nicht — sie verlangt eine Prüfung.
    expect(result.valid).toBe(true);
    expect(result.messages[0]?.severity).toBe('warning');
    expect(result.messages[0]?.code).toBe('possible_duplicate_client');
  });

  it('9 — hält den bearbeiteten Datensatz nicht für seine eigene Dublette', () => {
    const result = validateClientInput(form({ name: 'Muster Alpha GmbH' }), EXISTING, 'c1');
    expect(result.valid).toBe(true);
    expect(result.messages).toHaveLength(0);
  });

  it('10 — unterscheidet Status- und Notizänderung von einer allgemeinen Änderung', () => {
    const before = {
      name: 'Muster Alpha GmbH',
      country: 'DE',
      website: null,
      notes: null,
      isActive: true,
    };
    const after = validateClientInput(
      form({ name: 'Muster Alpha GmbH', notes: 'Interne Notiz', isActive: false }),
      [],
    ).normalized;

    const changes = diffClient(before, after);
    expect(changes.statusChanged).toBe(true);
    expect(changes.notesChanged).toBe(true);
    expect(changes.changedFields).toEqual(['notes', 'isActive']);
    expect(CLIENT_AUDIT_ACTIONS.statusChanged).toBe('client_status_changed');
  });
});

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

describe('Mandantentrennung bei Kundendaten', () => {
  async function twoOrgs() {
    const tables = createEmptyReferenceTables();
    const store = new MemoryReferenceStore(tables);
    const own = await store.createClient({
      organizationId: ORG_A,
      name: 'Muster Alpha GmbH',
      country: 'DE',
      website: null,
      notes: null,
      isActive: true,
    });
    const foreign = await store.createClient({
      organizationId: ORG_B,
      name: 'Fremde Musterfirma GmbH',
      country: 'DE',
      website: null,
      notes: null,
      isActive: true,
    });
    return { store, tables, own, foreign };
  }

  it('11 — liest einen fremden Kunden als „nicht gefunden"', async () => {
    const { store, foreign } = await twoOrgs();
    expect(await store.findClientRecord(ORG_A, foreign.id)).toBeNull();
    expect(await store.findClientRecord(ORG_B, foreign.id)).not.toBeNull();
  });

  it('12 — ändert keinen Kunden einer fremden Organisation', async () => {
    const { store, foreign } = await twoOrgs();
    expect(await store.updateClient(ORG_A, foreign.id, { name: 'Übernommen' })).toBeNull();
    expect((await store.findClientRecord(ORG_B, foreign.id))?.name).toBe(
      'Fremde Musterfirma GmbH',
    );
  });

  it('13 — zeigt in der Dublettenprüfung nur eigene Kunden', async () => {
    const { store } = await twoOrgs();
    const names = await store.listClientNames(ORG_A);
    expect(names).toHaveLength(1);
    expect(names[0]?.name).toBe('Muster Alpha GmbH');
  });

  it('14 — führt denselben Kundennamen in zwei Organisationen unabhängig', async () => {
    const { store } = await twoOrgs();
    await expect(
      store.createClient({
        organizationId: ORG_B,
        name: 'Muster Alpha GmbH',
        country: 'DE',
        website: null,
        notes: null,
        isActive: true,
      }),
    ).resolves.toMatchObject({ organizationId: ORG_B });
  });
});

describe('Berechtigungen für Kundendaten', () => {
  it('31 — lässt Betrachter Kunden lesen, aber nicht anlegen oder ändern', () => {
    expect(ROLE_PERMISSIONS.viewer).toContain('clients:read');
    // Die Formularseiten und beide API-Routen verlangen `clients:write`.
    expect(ROLE_PERMISSIONS.viewer).not.toContain('clients:write');
  });

  it('32 — erlaubt Bid Managern und Organisations-Admins das Pflegen von Kunden', () => {
    for (const role of ['bid_manager', 'org_admin', 'super_admin'] as const) {
      expect(ROLE_PERMISSIONS[role]).toContain('clients:write');
    }
  });
});

// ---------------------------------------------------------------------------
// Reference search — the same expectations as supabase/tests/reference-search.sql
// ---------------------------------------------------------------------------

interface ProjectFixture {
  name: string;
  clientName: string;
  objectNumber: string;
  objectType: string;
  city: string;
  start: string | null;
  end: string | null;
  status: 'active' | 'completed' | 'unknown';
  service: { category: ReferenceServiceCategory; confirmed: boolean } | null;
}

const FIXTURES: ProjectFixture[] = [
  {
    name: 'Musterobjekt Security Nord',
    clientName: 'Muster Alpha GmbH',
    objectNumber: 'BSP-001',
    objectType: 'Datacenter',
    city: 'Musterstadt',
    start: '2024-01-01',
    end: '2024-12-31',
    status: 'completed',
    service: { category: 'security', confirmed: true },
  },
  {
    name: 'Beispielobjekt Clean Süd',
    clientName: 'Beispiel Beta AG',
    objectNumber: 'BSP-002',
    objectType: 'Buerogebaeude',
    city: 'Beispielstadt',
    start: '2025-03-01',
    end: null,
    status: 'active',
    service: { category: 'cleaning', confirmed: false },
  },
  {
    name: 'Musterobjekt ohne Leistung',
    clientName: 'Muster Alpha GmbH',
    objectNumber: 'BSP-003',
    objectType: 'Lagerhalle',
    city: 'Musterstadt',
    start: null,
    end: null,
    status: 'unknown',
    service: null,
  },
];

async function seedSearch(): Promise<{
  store: MemoryReferenceStore;
  tables: ReferenceTables;
}> {
  const tables = createEmptyReferenceTables();
  const store = new MemoryReferenceStore(tables);

  for (const fixture of FIXTURES) {
    const { client } = await store.ensureClient(ORG_A, fixture.clientName, 'DE');
    const project = await store.createProject({
      organizationId: ORG_A,
      businessClientId: client.id,
      externalObjectNumber: fixture.objectNumber,
      projectName: fixture.name,
      objectType: fixture.objectType,
      country: 'DE',
      region: 'Musterland',
      city: fixture.city,
      postalCode: null,
      address: null,
      startDate: fixture.start,
      endDate: fixture.end,
      shiftSummaryRaw: null,
      shiftValues: [],
      invoiceStatus: 'unknown',
      projectStatus: fixture.status,
      description: null,
      sourceImportId: null,
      services:
        fixture.service === null
          ? []
          : [
              {
                serviceCategory: fixture.service.category,
                serviceLabel: null,
                classificationSource: 'name_rule',
                classificationConfidence: 0.8,
                confirmedByUser: false,
                notes: null,
              },
            ],
    });

    // Every stored service starts as an untouched proposal — by design. A
    // confirmed fixture therefore goes through the same decision path a user
    // would, rather than being written into the table as a fact.
    if (fixture.service?.confirmed === true) {
      const [service] = project.services;
      if (service === undefined) throw new Error('Testdaten unvollständig');
      await store.applyServiceDecision({
        organizationId: ORG_A,
        serviceId: service.id,
        action: 'confirm',
        targetCategory: null,
        userId: USER,
      });
    }
  }

  return { store, tables };
}

/** Runs a search from raw URL parameters, exactly as the page does. */
async function search(
  store: MemoryReferenceStore,
  params: Record<string, string>,
) {
  return store.listProjects(ORG_A, parseReferenceQuery(params));
}

describe('Referenzsuche', () => {
  it('15 — liefert alle Projekte der Organisation', async () => {
    const { store } = await seedSearch();
    expect((await search(store, {})).total).toBe(3);
  });

  it('16 — nennt die Gesamtzahl unabhängig von der Seitengröße', async () => {
    const { store } = await seedSearch();
    const page = await search(store, { pageSize: '2' });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(page.pageCount).toBe(2);

    const second = await search(store, { pageSize: '2', page: '2' });
    expect(second.items).toHaveLength(1);
    expect(second.total).toBe(3);
  });

  it('17 — sucht über Projektname, Objekt-Nr., Kunde, Ort und Objektart', async () => {
    const { store } = await seedSearch();
    expect((await search(store, { q: 'muster' })).total).toBe(2);
    expect((await search(store, { q: 'beta' })).total).toBe(1);
    expect((await search(store, { q: 'datacenter' })).total).toBe(1);
    expect((await search(store, { q: 'BSP 002' })).total).toBe(1);
  });

  it('18 — sucht akzentunempfindlich', async () => {
    const { store } = await seedSearch();
    expect((await search(store, { q: 'sud' })).total).toBe(1);
    expect((await search(store, { q: 'süd' })).total).toBe(1);
  });

  it('19 — behandelt ein Prozentzeichen nicht als Platzhalter', async () => {
    const { store } = await seedSearch();
    expect((await search(store, { q: '%' })).total).toBe(3);
  });

  it('20 — filtert auf Ort, Objektart und Projektstatus', async () => {
    const { store } = await seedSearch();
    expect((await search(store, { city: 'musterstadt' })).total).toBe(2);
    expect((await search(store, { objectType: 'Lagerhalle' })).total).toBe(1);
    expect((await search(store, { statuses: 'active' })).total).toBe(1);
  });

  it('21 — filtert auf Leistungsart', async () => {
    const { store } = await seedSearch();
    expect((await search(store, { services: 'cleaning' })).total).toBe(1);
    expect((await search(store, { services: 'security,cleaning' })).total).toBe(2);
  });

  it('22 — zählt nur bestätigte Leistungen als Nachweis', async () => {
    const { store } = await seedSearch();
    expect((await search(store, { confirmationStatus: 'evidence' })).total).toBe(1);
    expect((await search(store, { confirmationStatus: 'proposed' })).total).toBe(1);
    expect((await search(store, { referenceStatus: 'open' })).total).toBe(1);
    expect((await search(store, { referenceStatus: 'confirmed' })).total).toBe(2);
  });

  it('23 — schließt ein Projekt ohne Enddatum nicht aus dem Zeitraum aus', async () => {
    const { store } = await seedSearch();
    // Ein fehlendes Ende ist kein Beleg dafür, dass das Projekt vorbei ist.
    expect((await search(store, { periodFrom: '2025-01-01' })).total).toBe(2);
    expect((await search(store, { periodTo: '2024-12-31' })).total).toBe(2);
  });

  it('24 — kombiniert mehrere Filter', async () => {
    const { store } = await seedSearch();
    const result = await search(store, {
      q: 'muster',
      city: 'musterstadt',
      confirmationStatus: 'evidence',
    });
    expect(result.total).toBe(1);
    expect(result.items[0]?.projectName).toBe('Musterobjekt Security Nord');
  });

  it('25 — sortiert stabil, sodass keine Zeile zwischen zwei Seiten verschwindet', async () => {
    const { store } = await seedSearch();
    const first = await search(store, { pageSize: '2', sort: 'client' });
    const second = await search(store, { pageSize: '2', page: '2', sort: 'client' });
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('26 — fällt bei einem unbekannten Sortierfeld auf den Standard zurück', async () => {
    const { store } = await seedSearch();
    const query = parseReferenceQuery({ sort: '; drop table reference_projects; --' });
    expect(query.sort).toBe('start_date');
    expect((await store.listProjects(ORG_A, query)).total).toBe(3);
  });

  it('27 — liefert für eine fremde Organisation kein Ergebnis', async () => {
    const { store } = await seedSearch();
    expect((await store.listProjects(ORG_B, parseReferenceQuery({}))).total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Notes on decisions
// ---------------------------------------------------------------------------

describe('Notizen zu Entscheidungen', () => {
  async function seedOneProposal() {
    const { store, tables: seeded } = await seedSearch();
    const service = seeded.services.find(
      (entry) => entry.confirmationStatus === 'proposed',
    );
    if (service === undefined) throw new Error('Testdaten unvollständig');
    return { store, service };
  }

  it('28 — speichert eine Notiz zu jeder der fünf Entscheidungen', async () => {
    for (const action of ['confirm', 'change_and_confirm', 'mark_unknown', 'reject', 'reset'] as const) {
      const { store, service } = await seedOneProposal();
      const result = await store.applyServiceDecision({
        organizationId: ORG_A,
        serviceId: service.id,
        action,
        targetCategory: action === 'change_and_confirm' ? 'security' : null,
        userId: USER,
        note: `Notiz zu ${action}`,
      });
      expect(result?.after.notes).toBe(`Notiz zu ${action}`);
    }
  });

  it('29 — behält eine vorhandene Notiz, wenn keine neue mitgeschickt wird', async () => {
    const { store, service } = await seedOneProposal();
    await store.applyServiceDecision({
      organizationId: ORG_A,
      serviceId: service.id,
      action: 'confirm',
      targetCategory: null,
      userId: USER,
      note: 'Vom Bauleiter bestätigt',
    });

    const result = await store.applyServiceDecision({
      organizationId: ORG_A,
      serviceId: service.id,
      action: 'reset',
      targetCategory: null,
      userId: USER,
    });

    expect(result?.after.notes).toBe('Vom Bauleiter bestätigt');
  });

  it('30 — schreibt in das Audit-Log nur, dass eine Notiz existiert', async () => {
    const { store, service } = await seedOneProposal();
    const result = await store.applyServiceDecision({
      organizationId: ORG_A,
      serviceId: service.id,
      action: 'confirm',
      targetCategory: null,
      userId: USER,
      note: 'Vertraulicher Hinweis',
    });

    await store.recordAuditEntry({
      organizationId: ORG_A,
      userId: USER,
      action: 'service_confirmed',
      resourceType: 'reference_project_services',
      resourceId: service.id,
      metadata: { hasNote: result?.after.notes !== null },
    });

    const entries = await store.listAuditEntries(
      ORG_A,
      'reference_project_services',
      [service.id],
      10,
    );
    expect(entries[0]?.metadata['hasNote']).toBe(true);
    expect(JSON.stringify(entries[0]?.metadata)).not.toContain('Vertraulicher Hinweis');
  });
});
