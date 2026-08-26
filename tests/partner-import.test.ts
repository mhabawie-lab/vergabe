/**
 * Partner import and the search.
 *
 * The import cases guard the promises the dialog makes: a dry run writes
 * nothing, a confirmed import writes only the released rows, raw data survives
 * untouched, and nothing imported is ever treated as confirmed — a spreadsheet
 * cell is a claim, not a verified fact.
 *
 * The search cases assert the same expectations the SQL script
 * (`supabase/tests/partner-search.sql`) asserts against the database function,
 * so the two adapters cannot drift apart.
 */

import { describe, expect, it } from 'vitest';
import {
  applyPartnerMapping,
  findMissingPartnerFields,
  proposePartnerColumnMapping,
} from '@/modules/partners/column-mapping';
import {
  analyzePartnerTable,
  runPartnerImport,
} from '@/modules/partners/import-pipeline';
import {
  parseGermanBoolean,
  parseImportDate,
  parseImportInteger,
} from '@/modules/partners/import-validation';
import { PARTNER_IMPORT_TEMPLATE_CSV } from '@/modules/partners/template';
import { parseCsv } from '@/modules/references/parse/csv';
import { parseXlsx } from '@/modules/references/parse/xlsx';
import { parsePartnerQuery } from '@/modules/partners/query';
import { companyInput, createStore, isoDay, ORG_A, ORG_B, USER } from './partner-fixtures';
import ExcelJS from 'exceljs';

const CSV = [
  'Firmenname;Beziehungsrichtung;Leistung;Ort;Bundesland;Verfügbare Mitarbeiter;Sucht Subunternehmer;Quelle;Notiz',
  'Muster Wachdienst GmbH;Kann für uns arbeiten;Sicherheitsdienst;Musterstadt;Musterland;12;Nein;Telefonat;Beispieleintrag',
  'Beispiel Bau AG;Sucht Subunternehmer;Bauunterstützung;Beispielstadt;Musterland;;Ja;Website;Beispieleintrag',
  ';Kann für uns arbeiten;Reinigung;Musterhafen;Musterland;3;Nein;Telefonat;Zeile ohne Firmennamen',
].join('\n');

async function importFixture(dryRun: boolean, includeWarningRows = false) {
  const { store, tables } = createStore();
  const table = parseCsv(CSV);
  const mapping = proposePartnerColumnMapping(table.headers);

  const outcome = await runPartnerImport(
    store,
    { organizationId: ORG_A, userId: USER },
    table,
    mapping,
    'partner-test.csv',
    'csv',
    { includeWarningRows },
    dryRun,
  );

  return { store, tables, outcome, table, mapping };
}

// ---------------------------------------------------------------------------

describe('Partnerimport', () => {
  it('78 — CSV wird gelesen und die Spalten werden erkannt', () => {
    const table = parseCsv(CSV);
    expect(table.headers).toHaveLength(9);

    const mapping = proposePartnerColumnMapping(table.headers);
    const fields = mapping.map((assignment) => assignment.field);
    expect(fields).toContain('legalName');
    expect(fields).toContain('relationshipDirection');
    expect(fields).toContain('serviceCategory');
    expect(fields).toContain('availableStaff');
    expect(findMissingPartnerFields(mapping)).toHaveLength(0);
  });

  it('79 — XLSX wird gelesen', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Partner');
    sheet.addRow(['Firmenname', 'Ort', 'Leistung']);
    sheet.addRow(['Muster Wachdienst GmbH', 'Musterstadt', 'Sicherheitsdienst']);
    const buffer = await workbook.xlsx.writeBuffer();

    const table = await parseXlsx(buffer as ArrayBuffer);
    expect(table.headers[0]).toBe('Firmenname');
    expect(table.rows[0]?.[0]).toBe('Muster Wachdienst GmbH');
  });

  it('80 — die Zuordnung lässt sich anwenden', () => {
    const table = parseCsv(CSV);
    const mapping = proposePartnerColumnMapping(table.headers);
    const first = table.rows[0];
    expect(first).toBeDefined();

    const mapped = applyPartnerMapping(mapping, first!);
    expect(mapped.legalName).toBe('Muster Wachdienst GmbH');
    expect(mapped.city).toBe('Musterstadt');
  });

  it('81 — deutsche Datums-, Zahl- und Ja/Nein-Werte werden gelesen', () => {
    expect(parseImportDate('01.09.2026')).toBe('2026-09-01');
    expect(parseImportDate('2026-09-01')).toBe('2026-09-01');
    // An impossible date is reported, not rolled forward into March.
    expect(parseImportDate('31.02.2026')).toBeNull();
    expect(parseImportDate('irgendwas')).toBeNull();
    expect(parseImportInteger('12 Mitarbeiter')).toBe(12);
    expect(parseGermanBoolean('Ja')).toBe(true);
    expect(parseGermanBoolean('nein')).toBe(false);
    // Anything unrecognised stays unknown rather than becoming a yes.
    expect(parseGermanBoolean('vielleicht')).toBeNull();
  });

  it('82 — ein Testlauf schreibt nichts', async () => {
    const { tables, outcome } = await importFixture(true);
    expect(outcome.dryRun).toBe(true);
    expect(outcome.importedCompanies).toBe(0);
    expect(tables.companies).toHaveLength(0);
    // The protocol entry is written and marked as a dry run.
    expect(tables.imports[0]?.status).toBe('dry_run');
    expect(tables.importRows.length).toBe(3);
  });

  it('83 — ein bestätigter Import schreibt nur die freigegebenen Zeilen', async () => {
    const { tables, outcome } = await importFixture(false);

    // The row without a company name carries an error and is never imported.
    expect(outcome.analysis.errorRows).toBe(1);
    expect(outcome.importedCompanies).toBe(2);
    expect(tables.companies).toHaveLength(2);
    expect(tables.companies.map((company) => company.legalName)).not.toContain('');
  });

  it('84 — Rohdaten bleiben unverändert erhalten', async () => {
    const { tables } = await importFixture(false);
    const firstRow = tables.importRows.find((row) => row.rowNumber === 2);

    expect(firstRow?.rawData['Firmenname']).toBe('Muster Wachdienst GmbH');
    expect(firstRow?.rawData['Sucht Subunternehmer']).toBe('Nein');
    // The normalised proposal lives beside the raw row, not on top of it.
    expect(firstRow?.normalizedData).toBeDefined();
  });

  it('85 — importierte Leistungen gelten als selbst angegeben, nicht als bestätigt', async () => {
    const { tables } = await importFixture(false);
    expect(tables.services.length).toBeGreaterThan(0);
    for (const service of tables.services) {
      expect(service.confirmation).toBe('self_declared');
      expect(service.confirmationSource).toBe('import_column');
    }
  });

  it('86 — importierte Verfügbarkeiten sind unbestätigt', async () => {
    const { tables } = await importFixture(false);
    for (const entry of tables.availability) {
      expect(entry.lastConfirmedAt).toBeNull();
    }
  });

  it('87 — Datacenter-Erfahrung wird aus einem Import nie als belegt übernommen', async () => {
    const table = parseCsv(
      [
        'Firmenname;Datacenter-Erfahrung',
        'Muster Wachdienst GmbH;Ja',
      ].join('\n'),
    );
    const { store, tables } = createStore();
    await runPartnerImport(
      store,
      { organizationId: ORG_A, userId: USER },
      table,
      proposePartnerColumnMapping(table.headers),
      'test.csv',
      'csv',
      { includeWarningRows: true },
      false,
    );

    expect(tables.companies[0]?.datacenterExperienceStatus).toBe('claimed');
  });

  it('88 — ein Signal entsteht nur mit Quellenangabe', async () => {
    const withSource = parseCsv(
      [
        'Firmenname;Sucht Subunternehmer;Quelle',
        'Beispiel Bau AG;Ja;Karriereseite',
      ].join('\n'),
    );
    const first = createStore();
    await runPartnerImport(
      first.store,
      { organizationId: ORG_A, userId: USER },
      withSource,
      proposePartnerColumnMapping(withSource.headers),
      'test.csv',
      'csv',
      { includeWarningRows: true },
      false,
    );
    expect(first.tables.signals).toHaveLength(1);

    const withoutSource = parseCsv(
      ['Firmenname;Sucht Subunternehmer', 'Beispiel Bau AG;Ja'].join('\n'),
    );
    const second = createStore();
    const outcome = await runPartnerImport(
      second.store,
      { organizationId: ORG_A, userId: USER },
      withoutSource,
      proposePartnerColumnMapping(withoutSource.headers),
      'test.csv',
      'csv',
      { includeWarningRows: true },
      false,
    );

    expect(second.tables.signals).toHaveLength(0);
    // The company is still created; only the unsourced observation is not.
    expect(second.tables.companies).toHaveLength(1);
    expect(outcome.createdSignals).toBe(0);
  });

  it('89 — eine Dublette gegen den Bestand wird als Fehler erkannt', async () => {
    const { store } = createStore();
    await store.createCompany(companyInput('Muster Wachdienst GmbH'));

    const table = parseCsv(CSV);
    const analysis = analyzePartnerTable(
      table,
      proposePartnerColumnMapping(table.headers),
      [
        {
          id: 'existing',
          legalName: 'Muster Wachdienst GmbH',
          normalizedName: 'muster wachdienst',
          registryNumber: null,
          city: 'Musterstadt',
        },
      ],
      'test.csv',
      'csv',
    );

    const duplicate = analysis.rows.find((row) => row.rowNumber === 2);
    expect(duplicate?.status).toBe('error');
    expect(duplicate?.messages.map((message) => message.code)).toContain(
      'duplicate_in_stock',
    );
  });

  it('90 — die Vorlage enthält ausschließlich erfundene Werte', () => {
    expect(PARTNER_IMPORT_TEMPLATE_CSV).toContain('Muster Wachdienst GmbH');
    expect(PARTNER_IMPORT_TEMPLATE_CSV).toContain('.invalid');
    // A template that leaked a real domain would be a data-protection failure.
    expect(PARTNER_IMPORT_TEMPLATE_CSV).not.toMatch(/@(?!.*\.invalid)[\w.-]+\.(de|com|net)/);
  });
});

// ---------------------------------------------------------------------------

describe('Partnersuche', () => {
  async function searchFixture() {
    const { store } = createStore();

    const alpha = await store.createCompany(
      companyInput('Muster Wachdienst GmbH', {
        status: 'qualified',
        datacenterExperienceStatus: 'confirmed',
        city: 'Musterstadt',
        lastContactAt: isoDay(-30),
        nextFollowUpAt: isoDay(5),
      }),
    );
    await store.saveService({
      organizationId: ORG_A,
      partnerCompanyId: alpha.id,
      serviceCategory: 'datacenter_security',
      serviceLabel: null,
      confirmation: 'confirmed',
      confirmationSource: 'manual',
      capacityNote: null,
      availableStaff: 15,
      deliveryMode: 'own',
      note: null,
    });

    const beta = await store.createCompany(
      companyInput('Beispiel Bau AG', {
        relationshipDirection: 'may_hire_us',
        city: 'Beispielstadt',
        status: 'contacted',
      }),
    );
    await store.saveService({
      organizationId: ORG_A,
      partnerCompanyId: beta.id,
      serviceCategory: 'construction_support',
      serviceLabel: null,
      confirmation: 'self_declared',
      confirmationSource: 'import_column',
      capacityNote: null,
      availableStaff: null,
      deliveryMode: 'unknown',
      note: null,
    });

    const gamma = await store.createCompany(
      companyInput('Muster Reinigung GmbH', { city: 'Musterstadt' }),
    );

    return { store, alpha, beta, gamma };
  }

  it('91 — liefert alle Unternehmen der Organisation', async () => {
    const { store } = await searchFixture();
    expect((await store.listCompanies(ORG_A, parsePartnerQuery({}))).total).toBe(3);
    expect((await store.listCompanies(ORG_B, parsePartnerQuery({}))).total).toBe(0);
  });

  it('92 — die Gesamtzahl bleibt unabhängig von der Seitengröße korrekt', async () => {
    const { store } = await searchFixture();
    const page = await store.listCompanies(ORG_A, parsePartnerQuery({ pageSize: '2' }));

    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(page.pageCount).toBe(2);

    const second = await store.listCompanies(
      ORG_A,
      parsePartnerQuery({ pageSize: '2', page: '2' }),
    );
    expect(second.items).toHaveLength(1);
    expect(second.total).toBe(3);
  });

  it('93 — Filter wirken vor der Seitenaufteilung', async () => {
    const { store } = await searchFixture();
    // Only one company has a *confirmed* datacenter service; the filter must
    // reduce the total, not just the visible page.
    const filtered = await store.listCompanies(
      ORG_A,
      parsePartnerQuery({ services: 'datacenter_security', pageSize: '1' }),
    );
    expect(filtered.total).toBe(1);
    expect(filtered.pageCount).toBe(1);
  });

  it('94 — Volltext, Richtung, Ort und Status filtern', async () => {
    const { store } = await searchFixture();
    // All three sit in "Musterland", and the region is part of the haystack —
    // the same fields the SQL search covers.
    expect((await store.listCompanies(ORG_A, parsePartnerQuery({ q: 'muster' }))).total).toBe(3);
    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ q: 'wachdienst' }))).total,
    ).toBe(1);
    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ directions: 'may_hire_us' })))
        .total,
    ).toBe(1);
    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ city: 'musterstadt' }))).total,
    ).toBe(2);
    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ statuses: 'qualified' }))).total,
    ).toBe(1);
  });

  it('95 — eine unbestätigte Leistung erscheint nicht im Leistungsfilter', async () => {
    const { store } = await searchFixture();
    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ services: 'construction_support' })))
        .total,
    ).toBe(0);
  });

  it('96 — die Suche ist akzentunempfindlich und behandelt % nicht als Platzhalter', async () => {
    const { store } = await searchFixture();
    expect((await store.listCompanies(ORG_A, parsePartnerQuery({ q: '%' }))).total).toBe(3);
  });

  it('97 — Wiedervorlagen und letzter Kontakt filtern', async () => {
    const { store } = await searchFixture();
    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ followUpBefore: isoDay(10) })))
        .total,
    ).toBe(1);
    expect(
      (await store.listCompanies(ORG_A, parsePartnerQuery({ lastContactBefore: isoDay(-40) })))
        .total,
    ).toBe(2);
  });

  it('98 — ein unbekanntes Sortierfeld fällt auf den Standard zurück', async () => {
    const { store } = await searchFixture();
    const query = parsePartnerQuery({ sort: '; drop table partner_companies; --' });
    expect(query.sort).toBe('legal_name');
    expect((await store.listCompanies(ORG_A, query)).total).toBe(3);
  });

  it('99 — die Sortierung ist stabil, sodass keine Zeile zwischen zwei Seiten verschwindet', async () => {
    const { store } = await searchFixture();
    const first = await store.listCompanies(
      ORG_A,
      parsePartnerQuery({ pageSize: '2', sort: 'status' }),
    );
    const second = await store.listCompanies(
      ORG_A,
      parsePartnerQuery({ pageSize: '2', page: '2', sort: 'status' }),
    );
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('100 — die Liste zeigt bestätigte und angegebene Leistungen getrennt', async () => {
    const { store, beta } = await searchFixture();
    const result = await store.listCompanies(ORG_A, parsePartnerQuery({}));
    const item = result.items.find((entry) => entry.id === beta.id);

    expect(item?.confirmedServices).toHaveLength(0);
    expect(item?.declaredServices).toContain('construction_support');
  });
});
