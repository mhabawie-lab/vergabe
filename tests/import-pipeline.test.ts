import { beforeEach, describe, expect, it } from 'vitest';
import {
  createEmptyReferenceTables,
  MemoryReferenceStore,
  type ReferenceTables,
} from '@/lib/db/memory/reference-store';
import { proposeColumnMapping } from '@/modules/references/column-mapping';
import { findDuplicates } from '@/modules/references/dedupe';
import {
  analyzeTable,
  runImport,
  selectImportableRows,
} from '@/modules/references/import-pipeline';
import { parseCsv } from '@/modules/references/parse/csv';
import { buildSearchProfileSuggestions } from '@/modules/references/search-profile-suggestions';

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';

const CSV = [
  'Objekt-Nr.;Objektname;Objektart;Ort;Kunde;Schichten;Rechnung?',
  'BSP-0001;Security Musterwerk Nord;Werksgelände;Musterstadt;Beispiel Industrie GmbH;218/146/0;Ja',
  'BSP-0002;Objekt 47 Nordzufahrt;Datacenter;Beispielhausen;Beispiel Industrie GmbH;96/96/0;Nein',
  'BSP-0003;Cleaning Verwaltung Süd;Bürogebäude;Musterhafen;Muster Facility GmbH;52/52/0;Teilweise',
].join('\n');

function buildTable(csv = CSV) {
  const table = parseCsv(csv);
  return { table, mapping: proposeColumnMapping(table.headers) };
}

describe('Importanalyse', () => {
  it('bewertet eine saubere Datei als vollständig gültig', () => {
    const { table, mapping } = buildTable();
    const analysis = analyzeTable(table, mapping, [], 'test.csv', 'csv');

    expect(analysis.totalRows).toBe(3);
    expect(analysis.validRows).toBe(3);
    expect(analysis.errorRows).toBe(0);
    expect(analysis.clientNames).toEqual([
      'Beispiel Industrie GmbH',
      'Muster Facility GmbH',
    ]);
  });

  it('schlägt Leistungen nur bei eindeutigem Namen vor', () => {
    const { table, mapping } = buildTable();
    const analysis = analyzeTable(table, mapping, [], 'test.csv', 'csv');

    const categories = analysis.rows.map(
      (row) => row.serviceProposals[0]?.serviceCategory,
    );
    // Row 2 is a Datacenter object with a neutral name — it must stay unknown.
    expect(categories).toEqual(['security', 'unknown', 'cleaning']);
  });

  it('behält den Schicht-Originalwert bei', () => {
    const { table, mapping } = buildTable();
    const analysis = analyzeTable(table, mapping, [], 'test.csv', 'csv');

    expect(analysis.rows[0]?.normalized.shiftSummaryRaw).toBe('218/146/0');
    expect(analysis.rows[0]?.normalized.shiftValues).toEqual([218, 146, 0]);
    // The raw row keeps the source column untouched.
    expect(analysis.rows[0]?.raw['Schichten']).toBe('218/146/0');
  });

  it('meldet eine bereits vergebene Objekt-Nr. als Fehler', () => {
    const { table, mapping } = buildTable();
    const analysis = analyzeTable(
      table,
      mapping,
      [
        {
          id: 'existing-1',
          externalObjectNumber: 'BSP-0001',
          projectName: 'Altes Projekt',
          businessClientName: 'Beispiel Industrie GmbH',
          city: 'Musterstadt',
        },
      ],
      'test.csv',
      'csv',
    );

    expect(analysis.rows[0]?.status).toBe('error');
    expect(analysis.rows[0]?.messages.map((message) => message.code)).toContain(
      'existing_object_number',
    );
  });

  it('meldet eine inhaltliche Dublette als Warnung', () => {
    const findings = findDuplicates(
      {
        externalObjectNumber: null,
        projectName: 'Security Musterwerk Nord',
        clientName: 'Beispiel Industrie GmbH',
        clientKey: null,
        city: 'Musterstadt',
        cityKey: null,
        objectType: null,
        shiftSummaryRaw: null,
        shiftValues: [],
        invoiceStatus: 'unknown',
        region: null,
        country: null,
        postalCode: null,
        startDate: null,
        endDate: null,
        description: null,
      },
      [
        {
          id: 'existing-1',
          externalObjectNumber: 'OTHER-1',
          projectName: 'Security Musterwerk Nord',
          businessClientName: 'Beispiel Industrie GmbH',
          city: 'Musterstadt',
        },
      ],
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe('content');
    expect(findings[0]?.message.severity).toBe('warning');
  });

  it('importiert Fehlerzeilen nie, Warnzeilen nur auf Wunsch', () => {
    const csv = [
      'Objekt-Nr.;Objektname;Ort;Kunde;Schichten',
      'BSP-1;Security Nord;Musterstadt;Beispiel GmbH;218/146/0',
      'BSP-2;Halle Süd;Musterstadt;;96/96/0',
      'BSP-3;Lager West;Musterstadt;Beispiel GmbH;kaputt',
    ].join('\n');

    const { table, mapping } = buildTable(csv);
    const analysis = analyzeTable(table, mapping, [], 'test.csv', 'csv');

    expect(analysis.validRows).toBe(1);
    expect(analysis.errorRows).toBe(1);
    expect(analysis.warningRows).toBe(1);

    expect(selectImportableRows(analysis, { includeWarningRows: false })).toHaveLength(1);
    expect(selectImportableRows(analysis, { includeWarningRows: true })).toHaveLength(2);
  });
});

describe('Importlauf', () => {
  let tables: ReferenceTables;
  let store: MemoryReferenceStore;

  beforeEach(() => {
    tables = createEmptyReferenceTables();
    store = new MemoryReferenceStore(tables);
  });

  it('schreibt beim Testlauf keine Daten', async () => {
    const { table, mapping } = buildTable();

    const outcome = await runImport(
      store,
      { organizationId: ORG_A, userId: null },
      table,
      mapping,
      'test.csv',
      'csv',
      { includeWarningRows: false },
      true,
    );

    expect(outcome.dryRun).toBe(true);
    expect(outcome.importedRows).toBe(0);
    expect(tables.projects).toHaveLength(0);
    expect(tables.clients).toHaveLength(0);
    // The run itself is still recorded, so the attempt is auditable.
    expect(tables.imports).toHaveLength(1);
    expect(tables.imports[0]?.status).toBe('dry_run');
  });

  it('protokolliert auch beim Testlauf jede Zeile', async () => {
    const { table, mapping } = buildTable();
    await runImport(
      store,
      { organizationId: ORG_A, userId: null },
      table,
      mapping,
      'test.csv',
      'csv',
      { includeWarningRows: false },
      true,
    );

    expect(tables.importRows).toHaveLength(3);
    expect(tables.importRows.map((row) => row.rowNumber)).toEqual([1, 2, 3]);
  });

  it('schreibt beim bestätigten Import Projekte und Kunden', async () => {
    const { table, mapping } = buildTable();

    const outcome = await runImport(
      store,
      { organizationId: ORG_A, userId: null },
      table,
      mapping,
      'test.csv',
      'csv',
      { includeWarningRows: false },
      false,
    );

    expect(outcome.importedRows).toBe(3);
    expect(tables.projects).toHaveLength(3);
    // Two distinct clients across three rows — one is reused.
    expect(tables.clients).toHaveLength(2);
    expect(outcome.createdClients).toBe(2);
  });

  it('legt importierte Leistungen ausschließlich unbestätigt an', async () => {
    const { table, mapping } = buildTable();
    await runImport(
      store,
      { organizationId: ORG_A, userId: null },
      table,
      mapping,
      'test.csv',
      'csv',
      { includeWarningRows: false },
      false,
    );

    expect(tables.services.length).toBeGreaterThan(0);
    expect(tables.services.every((service) => !service.confirmedByUser)).toBe(true);
  });

  it('setzt den Projektstatus nicht auf einen erfundenen Wert', async () => {
    const { table, mapping } = buildTable();
    await runImport(
      store,
      { organizationId: ORG_A, userId: null },
      table,
      mapping,
      'test.csv',
      'csv',
      { includeWarningRows: false },
      false,
    );

    // The source list carries no status column, so unknown is the only honest
    // value.
    expect(tables.projects.every((project) => project.projectStatus === 'unknown')).toBe(
      true,
    );
  });

  it('erkennt beim zweiten Import dieselben Objekt-Nummern als Fehler', async () => {
    const { table, mapping } = buildTable();
    const context = { organizationId: ORG_A, userId: null };

    await runImport(store, context, table, mapping, 'a.csv', 'csv', {
      includeWarningRows: false,
    }, false);

    const second = await runImport(store, context, table, mapping, 'b.csv', 'csv', {
      includeWarningRows: false,
    }, false);

    expect(second.analysis.errorRows).toBe(3);
    expect(second.importedRows).toBe(0);
    expect(tables.projects).toHaveLength(3);
  });
});

describe('Mandantentrennung', () => {
  it('hält Daten zweier Organisationen strikt getrennt', async () => {
    const tables = createEmptyReferenceTables();
    const store = new MemoryReferenceStore(tables);
    const { table, mapping } = buildTable();

    await runImport(
      store,
      { organizationId: ORG_A, userId: null },
      table,
      mapping,
      'a.csv',
      'csv',
      { includeWarningRows: false },
      false,
    );

    const query = {
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

    const ownProjects = await store.listProjects(ORG_A, query);
    const otherProjects = await store.listProjects(ORG_B, query);

    expect(ownProjects.total).toBe(3);
    expect(otherProjects.total).toBe(0);

    const otherCandidates = await store.listDuplicateCandidates(ORG_B);
    expect(otherCandidates).toHaveLength(0);

    const otherMetrics = await store.getMetrics(ORG_B);
    expect(otherMetrics.referenceProjects).toBe(0);
    expect(otherMetrics.activeClients).toBe(0);
  });

  it('gibt ein fremdes Projekt auch bei bekannter ID nicht heraus', async () => {
    const tables = createEmptyReferenceTables();
    const store = new MemoryReferenceStore(tables);
    const { table, mapping } = buildTable();

    await runImport(
      store,
      { organizationId: ORG_A, userId: null },
      table,
      mapping,
      'a.csv',
      'csv',
      { includeWarningRows: false },
      false,
    );

    const id = tables.projects[0]?.id ?? '';
    expect(await store.findProjectById(ORG_A, id)).not.toBeNull();
    expect(await store.findProjectById(ORG_B, id)).toBeNull();
  });

});

describe('Suchprofil-Vorschläge', () => {
  it('erzeugt ohne bestätigte Leistungen keine Vorschläge', () => {
    const suggestions = buildSearchProfileSuggestions({
      projects: [
        {
          id: 'p1',
          externalObjectNumber: 'BSP-1',
          projectName: 'Security Nord',
          businessClientId: 'c1',
          businessClientName: 'Beispiel GmbH',
          objectType: null,
          country: 'DE',
          region: 'NW',
          city: 'Musterstadt',
          startDate: null,
          endDate: null,
          projectStatus: 'unknown',
          invoiceStatus: 'unknown',
          shiftSummaryRaw: null,
          serviceCategories: ['security'],
          hasUnconfirmedServices: true,
          hasOnlyProposals: true,
          confirmedServiceCategories: [],
          openProposals: [{ serviceId: 's1', serviceCategory: 'security' }],
          confidentialityLevel: 'internal',
        },
      ],
      confirmedServices: [],
    });

    expect(suggestions).toHaveLength(0);
  });

  it('erzeugt aus bestätigten Leistungen einen gekennzeichneten Vorschlag', () => {
    const suggestions = buildSearchProfileSuggestions({
      projects: [
        {
          id: 'p1',
          externalObjectNumber: 'BSP-1',
          projectName: 'Security Nord',
          businessClientId: 'c1',
          businessClientName: 'Beispiel GmbH',
          objectType: null,
          country: 'DE',
          region: 'NW',
          city: 'Musterstadt',
          startDate: null,
          endDate: null,
          projectStatus: 'unknown',
          invoiceStatus: 'unknown',
          shiftSummaryRaw: null,
          serviceCategories: ['security'],
          hasUnconfirmedServices: false,
          hasOnlyProposals: false,
          confirmedServiceCategories: ['security'],
          openProposals: [],
          confidentialityLevel: 'internal',
        },
      ],
      confirmedServices: [{ projectId: 'p1', serviceCategory: 'security' }],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.isProposal).toBe(true);
    expect(suggestions[0]?.filters.sectors).toContain('security_services');
    expect(suggestions[0]?.filters.cities).toContain('Musterstadt');
    expect(suggestions[0]?.evidenceCount).toBe(1);
  });

  it('ignoriert die Kategorie unknown', () => {
    const suggestions = buildSearchProfileSuggestions({
      projects: [
        {
          id: 'p1',
          externalObjectNumber: null,
          projectName: 'Objekt 12',
          businessClientId: null,
          businessClientName: null,
          objectType: null,
          country: 'DE',
          region: null,
          city: 'Musterstadt',
          startDate: null,
          endDate: null,
          projectStatus: 'unknown',
          invoiceStatus: 'unknown',
          shiftSummaryRaw: null,
          serviceCategories: ['unknown'],
          hasUnconfirmedServices: false,
          hasOnlyProposals: false,
          confirmedServiceCategories: ['unknown'],
          openProposals: [],
          confidentialityLevel: 'internal',
        },
      ],
      confirmedServices: [{ projectId: 'p1', serviceCategory: 'unknown' }],
    });

    expect(suggestions).toHaveLength(0);
  });
});
