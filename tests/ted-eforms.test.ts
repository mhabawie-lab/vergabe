import { afterEach, describe, expect, it, vi } from 'vitest';
import { alpha3ToAlpha2, nutsToRegionCode } from '@/config/regions';
import { findSectorsForCpvCodes } from '@/config/sectors';
import { ConnectorError } from '@/lib/errors';
import type { Logger } from '@/lib/logging';
import { getConnector } from '@/modules/connectors/core/registry';
import type { ConnectorContext } from '@/modules/connectors/core/types';
import {
  buildTedQuery,
  parseTedConfig,
  tedEformsConnector,
} from '@/modules/connectors/sources/ted-eforms';
import { getMapper } from '@/modules/ingestion/normalizer';
import { tedEformsMapper } from '@/modules/ingestion/normalizer/mappers/ted-eforms';
import type { MapperContext } from '@/modules/ingestion/normalizer/types';
import type { Source } from '@/types/source';
import { TED_COMPETITION_NOTICE, TED_RESULT_NOTICE } from './fixtures/ted-notices';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const warnings: Array<{ message: string; context: unknown }> = [];

const testLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: (message, context) => warnings.push({ message, context }),
  error: () => undefined,
  child: () => testLogger,
};

const mapperContext: MapperContext = { sourceKey: 'ted-eforms', logger: testLogger };

function buildSource(config: Record<string, unknown> = {}): Source {
  const now = new Date().toISOString();
  return {
    id: '00000000-0000-4000-8000-000000000002',
    key: 'ted-eforms',
    name: 'TED / EU eForms',
    sourceType: 'api',
    countryCode: 'DE',
    websiteUrl: 'https://ted.europa.eu',
    description: null,
    isActive: true,
    isDemo: false,
    pollIntervalSeconds: 3_600,
    // No throttling and no retry waiting: the test asserts behaviour, not
    // wall-clock patience.
    config: { minRequestIntervalMs: 0, ...config },
    createdAt: now,
    updatedAt: now,
  };
}

function buildContext(config: Record<string, unknown> = {}): ConnectorContext {
  return {
    source: buildSource(config),
    logger: testLogger,
    signal: new AbortController().signal,
  };
}

interface StubbedRequest {
  url: string;
  body: Record<string, unknown>;
}

/** Records every request and replays the given responses in order. */
function stubFetch(
  responses: Array<{ status: number; body: unknown }>,
): { requests: StubbedRequest[] } {
  const requests: StubbedRequest[] = [];
  let call = 0;

  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({
      url,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });

    const response = responses[Math.min(call, responses.length - 1)];
    call += 1;

    return {
      ok: response !== undefined && response.status >= 200 && response.status < 300,
      status: response?.status ?? 500,
      json: async () => response?.body,
      text: async () => JSON.stringify(response?.body),
    } as Response;
  });

  return { requests };
}

function tedPage(
  notices: Record<string, unknown>[],
  iterationNextToken: string | null,
  totalNoticeCount = notices.length,
): { status: number; body: unknown } {
  return { status: 200, body: { notices, iterationNextToken, totalNoticeCount } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  warnings.length = 0;
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('Registrierung', () => {
  it('ist als Connector und als Mapper unter demselben Quellschlüssel registriert', () => {
    expect(getConnector('ted-eforms')).toBe(tedEformsConnector);
    expect(getMapper('ted-eforms')).toBe(tedEformsMapper);
    expect(tedEformsConnector.key).toBe(tedEformsMapper.sourceKey);
  });

  it('ist keine Demo-Quelle', () => {
    expect(tedEformsConnector.sourceType).toBe('api');
    expect(tedEformsConnector.description).not.toMatch(/demo/i);
  });
});

// ---------------------------------------------------------------------------
// Configuration and query
// ---------------------------------------------------------------------------

describe('Konfiguration', () => {
  it('füllt eine leere Konfiguration mit den Standardwerten', () => {
    const config = parseTedConfig({});

    expect(config.countries).toEqual(['DEU']);
    expect(config.cpvCodes.length).toBeGreaterThan(0);
    expect(config.lookbackDays).toBe(14);
    expect(config.pageSize).toBe(100);
  });

  it('weist einen CPV-Wert zurück, der kein CPV-Code ist', () => {
    // The value is interpolated into the expert query, so anything that is
    // not a plain code must never get through.
    expect(() => parseTedConfig({ cpvCodes: ['797* OR 1=1'] })).toThrow();
    expect(() => parseTedConfig({ cpvCodes: ['79710000)'] })).toThrow();
    expect(() => parseTedConfig({ countries: ['DE; drop'] })).toThrow();
  });

  it('lehnt eine leere CPV-Liste ab', () => {
    // An unrestricted run would pull in all of TED.
    expect(() => parseTedConfig({ cpvCodes: [] })).toThrow();
  });

  it('baut eine TED-Expertenabfrage aus der Konfiguration', () => {
    const query = buildTedQuery(
      parseTedConfig({
        cpvCodes: ['797*', '90910000'],
        countries: ['DEU', 'AUT'],
        lookbackDays: 7,
      }),
    );

    expect(query).toBe(
      'classification-cpv IN (797* 90910000) AND place-of-performance IN (DEU AUT) ' +
        'AND publication-date >= today(-7)',
    );
  });

  it('lässt den Ländertfilter weg, wenn keine Länder konfiguriert sind', () => {
    const query = buildTedQuery(parseTedConfig({ countries: [], cpvCodes: ['797*'] }));

    expect(query).not.toContain('place-of-performance');
    expect(query).toContain('classification-cpv IN (797*)');
  });
});

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

describe('Connector', () => {
  it('liefert die Payload unverändert und nutzt publication-number als externe ID', async () => {
    stubFetch([tedPage([TED_COMPETITION_NOTICE], null)]);

    const result = await tedEformsConnector.fetchBatch(buildContext(), null);

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.externalId).toBe('479730-2026');
    // Byte-for-byte the object TED delivered: no renaming, no parsing.
    expect(result.records[0]?.payload).toEqual(TED_COMPETITION_NOTICE);
    expect(result.nextCursor).toBeNull();
  });

  it('schickt Abfrage, Felder und Paginierung an TED', async () => {
    const { requests } = stubFetch([tedPage([], null)]);

    await tedEformsConnector.fetchBatch(buildContext({ lookbackDays: 3 }), null);

    const body = requests[0]?.body;
    expect(requests[0]?.url).toBe('https://api.ted.europa.eu/v3/notices/search');
    expect(body?.query).toContain('publication-date >= today(-3)');
    expect(body?.paginationMode).toBe('ITERATION');
    expect(body?.page).toBe(1);
    expect(Array.isArray(body?.fields)).toBe(true);
    expect(body?.fields).toContain('publication-number');
  });

  it('reicht den Iterations-Token an die Folgeseite weiter', async () => {
    const { requests } = stubFetch([
      tedPage([TED_COMPETITION_NOTICE], 'token-a', 2),
      tedPage([TED_RESULT_NOTICE], null, 2),
    ]);

    const context = buildContext({ pageSize: 1 });
    const first = await tedEformsConnector.fetchBatch(context, null);
    expect(first.nextCursor).not.toBeNull();

    const second = await tedEformsConnector.fetchBatch(context, first.nextCursor);

    expect(requests[1]?.body.iterationNextToken).toBe('token-a');
    expect(requests[1]?.body.page).toBeUndefined();
    expect(second.records[0]?.externalId).toBe('291981-2026');
    expect(second.nextCursor).toBeNull();
  });

  it('stoppt an der Obergrenze eines Laufs', async () => {
    stubFetch([tedPage([TED_COMPETITION_NOTICE], 'weiter', 10_000)]);

    const context = buildContext({ maxNoticesPerRun: 1, pageSize: 100 });
    const result = await tedEformsConnector.fetchBatch(context, null);

    // TED still offers a token, but the run's budget is spent.
    expect(result.records).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('fordert nie mehr Datensätze an, als bis zur Obergrenze fehlen', async () => {
    const { requests } = stubFetch([tedPage([], null)]);

    await tedEformsConnector.fetchBatch(
      buildContext({ maxNoticesPerRun: 7, pageSize: 100 }),
      null,
    );

    expect(requests[0]?.body.limit).toBe(7);
  });

  it('überspringt Bekanntmachungen ohne publication-number', async () => {
    stubFetch([tedPage([{ 'notice-title': { deu: 'Ohne Nummer' } }], null)]);

    const result = await tedEformsConnector.fetchBatch(buildContext(), null);

    expect(result.records).toHaveLength(0);
    expect(warnings.some((entry) => entry.message.includes('publication-number'))).toBe(
      true,
    );
  });

  it('wiederholt eine 503 und meldet danach Erfolg', async () => {
    stubFetch([
      { status: 503, body: { message: 'Service Unavailable' } },
      tedPage([TED_COMPETITION_NOTICE], null),
    ]);

    const result = await tedEformsConnector.fetchBatch(
      buildContext({ maxRetries: 2 }),
      null,
    );

    expect(result.records).toHaveLength(1);
  });

  it('wiederholt eine abgelehnte Abfrage nicht', async () => {
    const { requests } = stubFetch([
      { status: 400, body: { message: "Unknown search field 'nonsense'" } },
    ]);

    await expect(
      tedEformsConnector.fetchBatch(buildContext({ maxRetries: 3 }), null),
    ).rejects.toThrow(ConnectorError);

    // A rejected query is rejected again on every attempt — retrying only
    // hides the reason from the operator.
    expect(requests).toHaveLength(1);
  });

  it('gibt nach erschöpften Wiederholungen einen ConnectorError zurück', async () => {
    const { requests } = stubFetch([{ status: 502, body: { message: 'Bad Gateway' } }]);

    await expect(
      tedEformsConnector.fetchBatch(buildContext({ maxRetries: 1 }), null),
    ).rejects.toThrow(ConnectorError);

    expect(requests).toHaveLength(2);
  });

  it('meldet eine ungültige Quellkonfiguration als Connector-Fehler', async () => {
    await expect(
      tedEformsConnector.fetchBatch(buildContext({ lookbackDays: 0 }), null),
    ).rejects.toThrow(ConnectorError);
  });

  it('meldet im Health-Check die Größe des Suchfensters', async () => {
    stubFetch([tedPage([TED_COMPETITION_NOTICE], null, 877)]);

    const health = await tedEformsConnector.healthCheck(buildContext());

    expect(health.reachable).toBe(true);
    expect(health.message).toContain('877');
  });

  it('meldet im Health-Check eine nicht erreichbare API, ohne zu werfen', async () => {
    stubFetch([{ status: 500, body: { message: 'kaputt' } }]);

    const health = await tedEformsConnector.healthCheck(buildContext({ maxRetries: 0 }));

    expect(health.reachable).toBe(false);
    expect(health.message.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Mapper — competition notice
// ---------------------------------------------------------------------------

describe('Mapper: Bekanntmachung', () => {
  const draft = tedEformsMapper.map(TED_COMPETITION_NOTICE, mapperContext);

  it('übernimmt Herkunft und Titel des Auftraggebers', () => {
    expect(draft.externalId).toBe('479730-2026');
    // `title-proc` is the buyer's wording; `notice-title` is TED's generated
    // headline and only the fallback.
    expect(draft.title).toBe('Bewachung Henning-von-Tresckow-Kaserne');
    expect(draft.referenceNumber).toBe('f97b0751-7d7b-485d-98a9-fc089091040f');
  });

  it('leitet Verfahren, Leistungsart und Status ab', () => {
    expect(draft.procedureType).toBe('restricted');
    expect(draft.procurementType).toBe('services');
    expect(draft.status).toBe('published');
    expect(draft.award).toBeNull();
  });

  it('entdoppelt CPV-Codes und leitet daraus die Branchen ab', () => {
    expect(draft.cpvCodes).toEqual(['79713000']);
    expect(draft.sectors).toContain('security_services');
  });

  it('übersetzt Ländercode und NUTS-Code in das interne Format', () => {
    expect(draft.countryCode).toBe('DE');
    // DE40E → NUTS-1 DE4 → Brandenburg.
    expect(draft.regionCode).toBe('BB');
    expect(draft.city).toBe('Schwielowsee');
    expect(draft.postalCode).toBe('14548');
    expect(draft.nutsCodes).toEqual(['DE40E', 'DEU']);
  });

  it('übernimmt Datumsangaben als ISO-8601', () => {
    expect(draft.publicationDate).toBe('2026-07-12T22:00:00.000Z');
    expect(draft.contractStart).toBe('2027-07-31');
    expect(draft.contractEnd).toBe('2031-07-31');
  });

  it('erfindet keine Angebotsfrist, wenn die Bekanntmachung keine nennt', () => {
    // A restricted procedure publishes a request-to-participate deadline
    // first. It is kept, but it is not an offer deadline.
    expect(draft.submissionDeadline).toBeNull();
    // 10 August in the notice's own offset (+02:00), not padded to a
    // made-up hour of the day.
    expect(draft.sourceExtras.tedRequestDeadline).toBe('2026-08-09T22:00:00.000Z');
  });

  it('verlinkt das Vergabeportal des Auftraggebers als Quelle', () => {
    expect(draft.sourceUrl).toBe(
      'https://www.evergabe-online.de/tenderdetails.html?id=874855',
    );
    expect(draft.sourceExtras.tedNoticeUrl).toBe(
      'https://ted.europa.eu/de/notice/-/detail/479730-2026',
    );
  });

  it('übernimmt den Auftraggeber mit Herkunftsangaben', () => {
    expect(draft.authority?.name).toBe('Bundeswehr-Dienstleistungszentrum Berlin');
    expect(draft.authority?.countryCode).toBe('DE');
    expect(draft.authority?.postalCode).toBe('13405');
    expect(draft.authority?.authorityType).toBe('cga');
    // TED states no region for the buyer, and a postcode is not a state.
    expect(draft.authority?.regionCode).toBeNull();
  });

  it('führt die TED-Renditionen als Dokumente, nicht die Vergabeunterlagen', () => {
    expect(draft.documents.map((document) => document.fileType)).toEqual(['pdf', 'xml']);
    expect(draft.documents[0]?.sourceUrl).toContain('/de/notice/479730-2026/pdf');
    // TED reports no size; estimating one would be fiction.
    expect(draft.documents[0]?.fileSizeBytes).toBeNull();
  });

  it('übernimmt bei einem einzigen Los die CPV-Codes der Bekanntmachung', () => {
    expect(draft.lots).toHaveLength(1);
    expect(draft.lots[0]?.lotNumber).toBe('LOT-0000');
    expect(draft.lots[0]?.cpvCodes).toEqual(['79713000']);
  });

  it('extrahiert keine Eignungskriterien aus der Suchantwort', () => {
    // They are not in the search response. An empty list is honest; an
    // invented one would be treated as evidence.
    expect(draft.requirements).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Mapper — result notice
// ---------------------------------------------------------------------------

describe('Mapper: Zuschlagsbekanntmachung', () => {
  const draft = tedEformsMapper.map(TED_RESULT_NOTICE, mapperContext);

  it('erkennt den Zuschlag am Formulartyp', () => {
    expect(draft.status).toBe('awarded');
    expect(draft.award).not.toBeNull();
    expect(draft.award?.winnerName).toBe('Wach- und Werkschutz Kurt Strube GmbH');
  });

  it('lässt nicht zuordenbare Zuschlagsangaben leer', () => {
    // Three awarded lots, three tender values, two winner cities: no field
    // here can be tied to the first winner with certainty.
    expect(draft.award?.awardValueNet).toBeNull();
    expect(draft.award?.winnerCity).toBeNull();
    expect(draft.award?.bidderCount).toBeNull();
  });

  it('bewahrt alle Bieter und Zuschlagswerte in den Quell-Zusatzfeldern', () => {
    expect(draft.sourceExtras.tedWinners).toEqual([
      'Wach- und Werkschutz Kurt Strube GmbH',
      'Wach- und Werkschutz Kurt Strube GmbH',
      'AWD-Gebäudedienste',
    ]);
    expect(draft.sourceExtras.tedTenderValues).toEqual([
      '320649.86',
      '210787.86',
      '5850.00',
    ]);
  });

  it('bildet alle Lose mit ihren eigenen Titeln ab', () => {
    expect(draft.lots.map((lot) => lot.lotNumber)).toEqual([
      'LOT-0001',
      'LOT-0002',
      'LOT-0003',
    ]);
    expect(draft.lots[2]?.title).toBe('Reinigung Friedhof');
    // CPV codes are published per notice, not per lot — repeating them on
    // every lot would fake a precision TED does not deliver.
    expect(draft.lots[0]?.cpvCodes).toEqual([]);
  });

  it('leitet mehrere Branchen aus den CPV-Codes ab', () => {
    expect(draft.sectors).toContain('security_services');
    expect(draft.sectors).toContain('cleaning');
  });
});

// ---------------------------------------------------------------------------
// Mapper — edge cases
// ---------------------------------------------------------------------------

/** The smallest payload the mapper accepts, for single-aspect cases. */
const BASE_NOTICE: Record<string, unknown> = {
  'publication-number': '1-2026',
  'title-proc': { deu: 'Objekt 5' },
};

describe('Mapper: Randfälle', () => {
  it('wirft ohne publication-number', () => {
    expect(() => tedEformsMapper.map({ 'title-proc': { deu: 'X' } }, mapperContext)).toThrow(
      /publication-number/,
    );
  });

  it('wirft ohne jeden Titel', () => {
    expect(() =>
      tedEformsMapper.map({ 'publication-number': '1-2026' }, mapperContext),
    ).toThrow(/Titel/);
  });

  it('weicht auf den von TED erzeugten Titel aus', () => {
    const draft = tedEformsMapper.map(
      {
        'publication-number': '1-2026',
        'notice-title': { deu: 'Deutschland – Bewachungsdienste – Objekt 5' },
      },
      mapperContext,
    );

    expect(draft.title).toBe('Deutschland – Bewachungsdienste – Objekt 5');
  });

  it('erkennt eine Korrektur an der Versionsnummer, nicht an ihrer Existenz', () => {
    const original = tedEformsMapper.map(
      { ...BASE_NOTICE, 'change-notice-version-identifier': ['abc-01'] },
      mapperContext,
    );
    const corrected = tedEformsMapper.map(
      { ...BASE_NOTICE, 'change-notice-version-identifier': ['abc-02'] },
      mapperContext,
    );

    expect(original.status).toBe('published');
    expect(corrected.status).toBe('amended');
  });

  it('leitet den Status nie aus der aktuellen Uhrzeit ab', () => {
    const draft = tedEformsMapper.map(
      {
        'publication-number': '1-2000',
        'title-proc': { deu: 'Längst abgelaufen' },
        'deadline-receipt-tender-date-lot': ['2000-01-01+01:00'],
        'deadline-receipt-tender-time-lot': ['10:00:00+01:00'],
      },
      mapperContext,
    );

    // The payload will not change again, so a derived `closed` would freeze
    // in place and never be corrected.
    expect(draft.status).toBe('published');
    expect(draft.submissionDeadline).toBe('2000-01-01T09:00:00.000Z');
  });

  it('nimmt die früheste Frist, wenn Lose unterschiedliche Fristen nennen', () => {
    const draft = tedEformsMapper.map(
      {
        'publication-number': '1-2026',
        'title-proc': { deu: 'Zwei Lose' },
        'deadline-receipt-tender-date-lot': ['2026-09-30+02:00', '2026-09-15+02:00'],
        'deadline-receipt-tender-time-lot': ['12:00:00+02:00', '10:00:00+02:00'],
      },
      mapperContext,
    );

    expect(draft.submissionDeadline).toBe('2026-09-15T08:00:00.000Z');
  });

  it('warnt bei unbekannter Verfahrensart und lässt das Feld leer', () => {
    const draft = tedEformsMapper.map(
      {
        'publication-number': '1-2026',
        'title-proc': { deu: 'Objekt 5' },
        'procedure-type': 'brandneues-verfahren',
      },
      mapperContext,
    );

    expect(draft.procedureType).toBeNull();
    expect(warnings.some((entry) => entry.message.includes('Verfahrensart'))).toBe(true);
  });

  it('rechnet eine eindeutige Laufzeit in Monate um', () => {
    const draft = tedEformsMapper.map(
      {
        'publication-number': '1-2026',
        'title-proc': { deu: 'Objekt 5' },
        'duration-period-value-lot': ['10'],
        'duration-period-unit-lot': ['YEAR'],
      },
      mapperContext,
    );

    expect(draft.durationMonths).toBe(120);
  });

  it('lässt die Laufzeit leer, wenn mehrere Lose verschiedene Laufzeiten nennen', () => {
    const draft = tedEformsMapper.map(
      {
        'publication-number': '1-2026',
        'title-proc': { deu: 'Objekt 5' },
        'duration-period-value-lot': ['10', '24'],
        'duration-period-unit-lot': ['YEAR', 'MONTH'],
      },
      mapperContext,
    );

    expect(draft.durationMonths).toBeNull();
  });

  it('liest den Auftragswert als Dezimalzahl und behält die Währung', () => {
    const draft = tedEformsMapper.map(
      {
        'publication-number': '1-2026',
        'title-proc': { deu: 'Objekt 5' },
        'estimated-value-proc': '320649.86',
        'estimated-value-cur-proc': ['EUR'],
      },
      mapperContext,
    );

    expect(draft.estimatedValueNet).toBeCloseTo(320_649.86, 2);
    expect(draft.currency).toBe('EUR');
  });

  it('übernimmt keinen Auftragswert, den TED nicht als Zahl liefert', () => {
    const draft = tedEformsMapper.map(
      {
        'publication-number': '1-2026',
        'title-proc': { deu: 'Objekt 5' },
        'estimated-value-proc': 'auf Anfrage',
      },
      mapperContext,
    );

    expect(draft.estimatedValueNet).toBeNull();
  });

  it('übersetzt den TED-Sprachcode in das zweistellige Format der Spalte', () => {
    // `tenders.original_language` ist char(2); "deu" würde die Datenbank
    // bei jedem einzelnen Datensatz ablehnen.
    const draft = tedEformsMapper.map(
      { ...BASE_NOTICE, 'official-language': ['DEU'] },
      mapperContext,
    );

    expect(draft.originalLanguage).toBe('de');
  });

  it('fällt bei unbekanntem Sprachcode sichtbar zurück', () => {
    // Untranslated title, so the notice's stated language is the only clue.
    const draft = tedEformsMapper.map(
      {
        'publication-number': '1-2026',
        'title-proc': 'Objekt 5',
        'official-language': ['xyz'],
      },
      mapperContext,
    );

    expect(draft.originalLanguage).toBe('de');
    expect(warnings.some((entry) => entry.message.includes('Sprachcode'))).toBe(true);
  });

  it('übernimmt "nicht veröffentlicht" nicht als negativen Betrag', () => {
    // TED trägt -1 ein, wenn ein Wert nicht offengelegt wird. Wörtlich
    // genommen wäre das ein Auftrag über minus einen Euro.
    const draft = tedEformsMapper.map(
      {
        ...BASE_NOTICE,
        'notice-type': 'can-standard',
        'form-type': 'result',
        'winner-name': { deu: ['Beispiel Wachdienst GmbH'] },
        'tender-value': ['-1'],
        'estimated-value-proc': '-1',
      },
      mapperContext,
    );

    expect(draft.estimatedValueNet).toBeNull();
    expect(draft.award?.awardValueNet).toBeNull();
  });

  it('nutzt die Veröffentlichungsnummer als Zuschlags-ID, nicht die Bieterkennung', () => {
    // `awards` ist eindeutig über (source_id, external_id). Die Kennung des
    // Bieters würde bei jedem weiteren Auftrag desselben Unternehmens
    // kollidieren.
    const draft = tedEformsMapper.map(
      {
        ...BASE_NOTICE,
        'notice-type': 'can-standard',
        'form-type': 'result',
        'winner-name': { deu: ['Beispiel Wachdienst GmbH'] },
        'winner-identifier': ['DE123456789'],
      },
      mapperContext,
    );

    expect(draft.award?.externalId).toBe('1-2026');
    expect(draft.sourceExtras.tedWinnerIdentifiers).toEqual(['DE123456789']);
  });

  it('übernimmt keine Bieterzahl von null', () => {
    // `awards_bidder_count_positive` verlangt eine positive Zahl, und "null
    // Angebote" ist nicht, was dieses Feld aussagt.
    const draft = tedEformsMapper.map(
      {
        ...BASE_NOTICE,
        'notice-type': 'can-standard',
        'form-type': 'result',
        'winner-name': { deu: ['Beispiel Wachdienst GmbH'] },
        'received-submissions-type-code': ['tenders'],
        'received-submissions-type-val': ['0'],
      },
      mapperContext,
    );

    expect(draft.award?.bidderCount).toBeNull();
  });

  it('legt ein wiederholtes Los nur einmal an', () => {
    // TED wiederholt Einträge in seinen parallelen Arrays; die Losnummer ist
    // je Ausschreibung eindeutig.
    const draft = tedEformsMapper.map(
      {
        ...BASE_NOTICE,
        'identifier-lot': ['LOT-0001', 'LOT-0001', 'LOT-0002'],
      },
      mapperContext,
    );

    expect(draft.lots.map((lot) => lot.lotNumber)).toEqual(['LOT-0001', 'LOT-0002']);
  });

  it('übernimmt nur eine dreistellige Währung', () => {
    const draft = tedEformsMapper.map(
      { ...BASE_NOTICE, 'estimated-value-cur-proc': ['Euro'] },
      mapperContext,
    );

    expect(draft.currency).toBe('EUR');
  });

  it('erzeugt keine Branchen für fachfremde CPV-Codes', () => {
    const draft = tedEformsMapper.map(
      {
        'publication-number': '1-2026',
        'title-proc': { deu: 'Straßenbau' },
        'classification-cpv': ['45233120'],
      },
      mapperContext,
    );

    expect(draft.sectors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Shared reference data
// ---------------------------------------------------------------------------

describe('Referenzdaten', () => {
  it('löst deutsche NUTS-Codes auf Bundeslandebene auf', () => {
    expect(nutsToRegionCode('DE40E')).toBe('BB');
    expect(nutsToRegionCode('DEB39')).toBe('RP');
    expect(nutsToRegionCode('DE300')).toBe('BE');
  });

  it('rät kein Bundesland für nicht-deutsche oder unbekannte Codes', () => {
    expect(nutsToRegionCode('FR101')).toBeNull();
    expect(nutsToRegionCode('DEU')).toBeNull();
    expect(nutsToRegionCode('DEZ')).toBeNull();
    expect(nutsToRegionCode(null)).toBeNull();
  });

  it('übersetzt alpha-3- in alpha-2-Ländercodes', () => {
    expect(alpha3ToAlpha2('DEU')).toBe('DE');
    expect(alpha3ToAlpha2('AUT')).toBe('AT');
    expect(alpha3ToAlpha2('XXX')).toBeNull();
    expect(alpha3ToAlpha2(null)).toBeNull();
  });

  it('ordnet den CPV-Wurzelcode einer Branche zu', () => {
    // Buyers file security tenders under the branch root 79700000 as often as
    // under a child code; both must land in the sector.
    expect(findSectorsForCpvCodes(['79700000'])).toContain('security_services');
    // 79992000 sits in a different CPV division and must not be pulled in.
    expect(findSectorsForCpvCodes(['79992000'])).not.toContain('security_services');
  });

  it('ordnet CPV-Codes über die Hierarchie den Branchen zu', () => {
    // 90911200 is a child of 90910000, so the trailing zeros must not block
    // the match.
    expect(findSectorsForCpvCodes(['90911200'])).toContain('cleaning');
    expect(findSectorsForCpvCodes(['79713000'])).toContain('security_services');
    expect(findSectorsForCpvCodes(['98341120'])).toContain('reception_gate_services');
  });

  it('ordnet einen Oberbegriff keiner spezielleren Branche zu', () => {
    // `90000000` is "Abwasser, Abfall, Reinigung, Umwelt" — far too broad to
    // call a cleaning tender.
    expect(findSectorsForCpvCodes(['90000000'])).toEqual([]);
  });
});
