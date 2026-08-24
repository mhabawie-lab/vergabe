import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseXlsx } from '@/modules/references/parse/xlsx';
import { proposeColumnMapping } from '@/modules/references/column-mapping';

/**
 * Builds a real workbook in memory and reads it back, so the test exercises
 * the actual XLSX path rather than a hand-made fixture.
 */
async function buildWorkbook(
  rows: Array<Array<string | number | Date | null>>,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Objekte');
  for (const row of rows) {
    sheet.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

describe('XLSX-Parser', () => {
  it('liest Kopfzeile und Datenzeilen', async () => {
    const buffer = await buildWorkbook([
      ['Objekt-Nr.', 'Objektname', 'Ort', 'Kunde', 'Schichten'],
      ['BSP-1', 'Security Nord', 'Musterstadt', 'Beispiel GmbH', '218/146/0'],
      ['BSP-2', 'Objekt 47', 'Beispielhausen', 'Beispiel GmbH', '96/96/0'],
    ]);

    const table = await parseXlsx(buffer);

    expect(table.headers).toEqual([
      'Objekt-Nr.',
      'Objektname',
      'Ort',
      'Kunde',
      'Schichten',
    ]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.[4]).toBe('218/146/0');
  });

  it('liefert dieselbe Spaltenerkennung wie bei CSV', async () => {
    const buffer = await buildWorkbook([
      ['Objekt-Nr.', 'Objektname', 'Objektart', 'Ort', 'Kunde', 'Schichten', 'Rechnung?'],
      ['BSP-1', 'Security Nord', 'Werk', 'Musterstadt', 'Beispiel GmbH', '218/146/0', 'Ja'],
    ]);

    const table = await parseXlsx(buffer);
    const mapping = proposeColumnMapping(table.headers);

    expect(mapping.map((assignment) => assignment.field)).toEqual([
      'externalObjectNumber',
      'projectName',
      'objectType',
      'city',
      'clientName',
      'shiftSummary',
      'invoiceStatus',
    ]);
  });

  it('wandelt Zahlen und Datumswerte in Text um', async () => {
    const buffer = await buildWorkbook([
      ['Objektname', 'Kunde', 'Ort', 'Beginn', 'PLZ'],
      ['Security Nord', 'Beispiel GmbH', 'Musterstadt', new Date('2026-06-01'), 40210],
    ]);

    const table = await parseXlsx(buffer);
    expect(table.rows[0]?.[3]).toBe('2026-06-01');
    expect(table.rows[0]?.[4]).toBe('40210');
  });

  it('behält leere Zellen an ihrer Position', async () => {
    const buffer = await buildWorkbook([
      ['Objektname', 'Objektart', 'Ort', 'Kunde'],
      ['Security Nord', null, 'Musterstadt', 'Beispiel GmbH'],
    ]);

    const table = await parseXlsx(buffer);
    expect(table.rows[0]).toEqual(['Security Nord', '', 'Musterstadt', 'Beispiel GmbH']);
  });

  it('überspringt vollständig leere Zeilen', async () => {
    const buffer = await buildWorkbook([
      ['Objektname', 'Kunde', 'Ort'],
      ['Security Nord', 'Beispiel GmbH', 'Musterstadt'],
      [null, null, null],
      ['Lager West', 'Beispiel GmbH', 'Musterstadt'],
    ]);

    const table = await parseXlsx(buffer);
    expect(table.rows).toHaveLength(2);
  });

  it('meldet eine Mappe ohne Kopfzeile', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Leer');
    const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;

    await expect(parseXlsx(buffer)).rejects.toThrow(/Kopfzeile/);
  });
});
