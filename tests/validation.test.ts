import { describe, expect, it } from 'vitest';
import { parseShiftSummary } from '@/modules/references/shift-format';
import {
  createKnownValues,
  validateRow,
} from '@/modules/references/validation';
import {
  applyMapping,
  findMissingRequiredFields,
  proposeColumnMapping,
} from '@/modules/references/column-mapping';

describe('Schichtformat', () => {
  it('liest 218/146/0 und erhält den Originalwert', () => {
    const result = parseShiftSummary('218/146/0');
    expect(result.isValid).toBe(true);
    expect(result.values).toEqual([218, 146, 0]);
    expect(result.raw).toBe('218/146/0');
  });

  it('akzeptiert einen einzelnen Wert', () => {
    expect(parseShiftSummary('218').values).toEqual([218]);
  });

  it('toleriert Leerzeichen um die Schrägstriche', () => {
    expect(parseShiftSummary('218 / 146 / 0').values).toEqual([218, 146, 0]);
  });

  it('behandelt einen leeren Wert nicht als Fehler', () => {
    const result = parseShiftSummary('');
    expect(result.isValid).toBe(true);
    expect(result.values).toEqual([]);
  });

  it.each(['218-146-0', 'abc', '218//146', '218/x/0', '-5/3'])(
    'meldet „%s" als ungültig, ohne den Wert zu verändern',
    (input) => {
      const result = parseShiftSummary(input);
      expect(result.isValid).toBe(false);
      expect(result.raw).toBe(input);
      expect(result.problem).not.toBeNull();
    },
  );
});

describe('Spaltenzuordnung', () => {
  const headers = [
    'Objekt-Nr.',
    'Objektname',
    'Objektart',
    'Ort',
    'Kunde',
    'Schichten',
    'Rechnung?',
  ];

  it('erkennt alle deutschen Standardspalten eindeutig', () => {
    const mapping = proposeColumnMapping(headers);
    expect(mapping.map((assignment) => assignment.field)).toEqual([
      'externalObjectNumber',
      'projectName',
      'objectType',
      'city',
      'clientName',
      'shiftSummary',
      'invoiceStatus',
    ]);
    expect(mapping.every((assignment) => assignment.matchType === 'exact')).toBe(true);
  });

  it('meldet fehlende Pflichtfelder', () => {
    const mapping = proposeColumnMapping(['Objekt-Nr.', 'Ort']);
    expect(findMissingRequiredFields(mapping)).toEqual(['projectName', 'clientName']);
  });

  it('ordnet ein Feld höchstens einer Spalte zu', () => {
    const mapping = proposeColumnMapping(['Ort', 'Stadt']);
    const assigned = mapping.filter((assignment) => assignment.field === 'city');
    expect(assigned).toHaveLength(1);
  });

  it('lässt unbekannte Spalten unzugeordnet', () => {
    const mapping = proposeColumnMapping(['Objektname', 'Kunde', 'Interne Kennung XY']);
    expect(mapping[2]?.field).toBeNull();
  });

  it('liest eine Zeile entsprechend der Zuordnung', () => {
    const mapping = proposeColumnMapping(headers);
    const mapped = applyMapping(mapping, [
      'BSP-1',
      'Security Nord',
      'Werk',
      'Musterstadt',
      'Beispiel GmbH',
      '218/146/0',
      'Ja',
    ]);

    expect(mapped.externalObjectNumber).toBe('BSP-1');
    expect(mapped.clientName).toBe('Beispiel GmbH');
    expect(mapped.shiftSummary).toBe('218/146/0');
  });
});

describe('Zeilenvalidierung', () => {
  it('akzeptiert eine vollständige Zeile ohne Beanstandung', () => {
    const result = validateRow(
      {
        clientName: 'Beispiel GmbH',
        projectName: 'Security Nord',
        city: 'Musterstadt',
        externalObjectNumber: 'BSP-1',
        shiftSummary: '218/146/0',
        invoiceStatus: 'Ja',
      },
      createKnownValues(),
    );

    expect(result.status).toBe('valid');
    expect(result.messages).toHaveLength(0);
    expect(result.normalized.invoiceStatus).toBe('invoiced');
  });

  it('meldet einen fehlenden Kunden als Fehler', () => {
    const result = validateRow(
      { projectName: 'Security Nord', city: 'Musterstadt' },
      createKnownValues(),
    );
    expect(result.status).toBe('error');
    expect(result.messages.map((message) => message.code)).toContain('missing_client');
  });

  it('meldet einen fehlenden Objektnamen als Fehler', () => {
    const result = validateRow(
      { clientName: 'Beispiel GmbH', city: 'Musterstadt' },
      createKnownValues(),
    );
    expect(result.messages.map((message) => message.code)).toContain(
      'missing_project_name',
    );
  });

  it('meldet einen fehlenden Ort als Fehler', () => {
    const result = validateRow(
      { clientName: 'Beispiel GmbH', projectName: 'Security Nord' },
      createKnownValues(),
    );
    expect(result.messages.map((message) => message.code)).toContain('missing_city');
  });

  it('weist eine ungültige Objekt-Nr. zurück', () => {
    const result = validateRow(
      {
        clientName: 'Beispiel GmbH',
        projectName: 'Security Nord',
        city: 'Musterstadt',
        externalObjectNumber: 'BSP 1/#',
      },
      createKnownValues(),
    );
    expect(result.messages.map((message) => message.code)).toContain(
      'invalid_object_number',
    );
  });

  it('erkennt dieselbe Objekt-Nr. zweimal in derselben Datei', () => {
    const known = createKnownValues();
    const row = {
      clientName: 'Beispiel GmbH',
      projectName: 'Security Nord',
      city: 'Musterstadt',
      externalObjectNumber: 'BSP-1',
    };

    expect(validateRow(row, known).status).toBe('valid');
    const second = validateRow(row, known);
    expect(second.messages.map((message) => message.code)).toContain(
      'duplicate_object_number',
    );
  });

  it('meldet abweichende Schreibweisen eines Kunden als Vorschlag', () => {
    const known = createKnownValues();
    validateRow(
      { clientName: 'Beispiel Industrie GmbH', projectName: 'A', city: 'Musterstadt' },
      known,
    );

    const second = validateRow(
      { clientName: 'Beispiel Industrei GmbH', projectName: 'B', city: 'Musterstadt' },
      known,
    );

    const finding = second.messages.find(
      (message) => message.code === 'client_possible_typo',
    );
    expect(finding).toBeDefined();
    // A suggestion, never an automatic correction.
    expect(finding?.severity).toBe('warning');
    expect(finding?.suggestion).toBe('Beispiel Industrie GmbH');
    expect(second.normalized.clientName).toBe('Beispiel Industrei GmbH');
  });

  it('meldet abweichende Ortsschreibweisen, ohne sie zu ändern', () => {
    const known = createKnownValues();
    validateRow(
      { clientName: 'A GmbH', projectName: 'A', city: 'Musterstadt' },
      known,
    );

    const second = validateRow(
      { clientName: 'A GmbH', projectName: 'B', city: 'Musterstdt' },
      known,
    );

    expect(second.messages.map((message) => message.code)).toContain(
      'city_possible_typo',
    );
    expect(second.normalized.city).toBe('Musterstdt');
  });

  it('warnt bei ungültigem Schichtformat und behält den Originalwert', () => {
    const result = validateRow(
      {
        clientName: 'A GmbH',
        projectName: 'A',
        city: 'Musterstadt',
        shiftSummary: '218-146-0',
      },
      createKnownValues(),
    );

    expect(result.status).toBe('warning');
    expect(result.messages.map((message) => message.code)).toContain(
      'invalid_shift_format',
    );
    expect(result.normalized.shiftSummaryRaw).toBe('218-146-0');
    expect(result.normalized.shiftValues).toEqual([]);
  });

  it('warnt bei unbekanntem Rechnungsstatus und setzt unknown', () => {
    const result = validateRow(
      {
        clientName: 'A GmbH',
        projectName: 'A',
        city: 'Musterstadt',
        invoiceStatus: 'vielleicht',
      },
      createKnownValues(),
    );

    expect(result.messages.map((message) => message.code)).toContain(
      'unknown_invoice_status',
    );
    expect(result.normalized.invoiceStatus).toBe('unknown');
  });

  it('erkennt ein Projektende vor dem Projektbeginn', () => {
    const result = validateRow(
      {
        clientName: 'A GmbH',
        projectName: 'A',
        city: 'Musterstadt',
        startDate: '01.06.2026',
        endDate: '01.01.2026',
      },
      createKnownValues(),
    );

    expect(result.status).toBe('error');
    expect(result.messages.map((message) => message.code)).toContain('date_order');
  });

  it('liest deutsche und ISO-Datumsangaben', () => {
    const result = validateRow(
      {
        clientName: 'A GmbH',
        projectName: 'A',
        city: 'Musterstadt',
        startDate: '01.06.2026',
        endDate: '2026-12-31',
      },
      createKnownValues(),
    );

    expect(result.normalized.startDate).toBe('2026-06-01');
    expect(result.normalized.endDate).toBe('2026-12-31');
  });

  it('ergänzt fehlende Ortsangaben nicht selbstständig', () => {
    const result = validateRow(
      { clientName: 'A GmbH', projectName: 'A', city: 'Musterstadt' },
      createKnownValues(),
    );

    expect(result.normalized.region).toBeNull();
    expect(result.normalized.country).toBeNull();
    expect(result.normalized.postalCode).toBeNull();
  });
});
