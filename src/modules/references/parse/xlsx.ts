/**
 * XLSX reader for reference imports.
 *
 * Reads the first worksheet into the same `ParsedTable` shape the CSV reader
 * produces, so everything downstream — mapping, validation, import — is
 * format-agnostic.
 *
 * Server-only: ExcelJS is a Node library and the file never reaches the client.
 */

import 'server-only';

import ExcelJS from 'exceljs';
import type { ParsedTable } from './csv';

/**
 * Renders a cell as the text a user would see in Excel.
 *
 * Dates are emitted as ISO dates rather than locale strings, so the validator
 * downstream gets one predictable shape. Formula cells contribute their
 * computed result, not the formula.
 */
function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') {
      // Hyperlink or rich-text cell.
      return value.text;
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
    if ('result' in value) {
      const { result } = value;
      if (result === null || result === undefined) return '';
      return String(result);
    }
    if ('error' in value) {
      // A cell in error state carries no usable value; keep it empty so the
      // validator reports a missing field rather than the Excel error code.
      return '';
    }
    return '';
  }

  return String(value);
}

/**
 * Parses the first worksheet of an XLSX file.
 *
 * @throws Error when the workbook has no sheet or no header row.
 */
export async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedTable> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (worksheet === undefined) {
    throw new Error('Die Datei enthält kein Tabellenblatt.');
  }

  const records: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    // `columnCount` rather than the sparse cell list, so empty cells in the
    // middle of a row keep their position.
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      cells.push(cellToText(row.getCell(column).value).trim());
    }
    records.push(cells);
  });

  const headerRecord = records[0];
  if (headerRecord === undefined) {
    throw new Error('Die Datei enthält keine Kopfzeile.');
  }

  // Trailing empty header cells come from Excel's notion of "used range" and
  // carry no data.
  let lastUsed = headerRecord.length;
  while (lastUsed > 0 && (headerRecord[lastUsed - 1] ?? '').length === 0) {
    lastUsed -= 1;
  }

  const headers = headerRecord.slice(0, lastUsed);
  const rows = records
    .slice(1)
    .map((record) => {
      const row = record.slice(0, lastUsed);
      while (row.length < headers.length) row.push('');
      return row;
    })
    .filter((row) => row.some((cell) => cell.length > 0));

  return { headers, rows, delimiter: '' };
}
