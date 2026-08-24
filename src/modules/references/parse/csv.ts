/**
 * CSV reader for reference imports.
 *
 * Hand-written rather than pulled from a dependency: the format is small, the
 * German dialects it has to survive are specific (semicolon separators, BOM
 * from Excel, CRLF), and the import path handles customer data — fewer
 * third-party parsers in that path is worth the ~100 lines.
 *
 * Follows RFC 4180 for quoting: fields may be wrapped in double quotes, and a
 * doubled quote inside a quoted field is a literal quote.
 */

export interface ParsedTable {
  /** Header cells, trimmed, in source order. */
  headers: string[];
  /**
   * Data rows. Each row has exactly `headers.length` entries — short rows are
   * padded, long rows keep their surplus under generated headers, so nothing
   * from the source is silently dropped.
   */
  rows: string[][];
  /** The separator that was used. */
  delimiter: string;
}

const CANDIDATE_DELIMITERS = [';', ',', '\t', '|'] as const;

/** Excel writes a UTF-8 BOM; it would otherwise end up in the first header. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Picks the separator by counting candidates in the header line, outside of
 * quotes. The most frequent one wins; ties fall back to the semicolon, which
 * is what German Excel exports use.
 */
export function detectDelimiter(text: string): string {
  const firstLine = stripBom(text).split(/\r?\n/, 1)[0] ?? '';

  let best = ';';
  let bestCount = 0;

  for (const candidate of CANDIDATE_DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i += 1) {
      const char = firstLine[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === candidate && !inQuotes) {
        count += 1;
      }
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

/** Splits the whole document into rows of raw cells. */
function splitRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  const pushField = (): void => {
    record.push(field);
    field = '';
  };

  const pushRecord = (): void => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote inside a quoted field.
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      pushField();
    } else if (char === '\n') {
      pushRecord();
    } else if (char === '\r') {
      // Part of CRLF; the \n that follows closes the record.
      if (text[i + 1] !== '\n') pushRecord();
    } else {
      field += char;
    }
  }

  // A file not ending in a newline still has a final record.
  if (field.length > 0 || record.length > 0) {
    pushRecord();
  }

  return records;
}

/**
 * Parses CSV text into headers and rows.
 *
 * @throws Error when the file contains no header line.
 */
export function parseCsv(text: string, delimiter?: string): ParsedTable {
  const content = stripBom(text);
  const usedDelimiter = delimiter ?? detectDelimiter(content);

  const records = splitRecords(content, usedDelimiter).filter(
    // Drop lines that are entirely empty; a line of empty cells is kept,
    // because it may be a genuine but incomplete data row.
    (record) => !(record.length === 1 && (record[0] ?? '').trim().length === 0),
  );

  const headerRecord = records[0];
  if (headerRecord === undefined) {
    throw new Error('Die Datei enthält keine Kopfzeile.');
  }

  const headers = headerRecord.map((header) => header.trim());
  const columnCount = headers.length;

  const rows = records.slice(1).map((record) => {
    const row = record.map((cell) => cell.trim());
    while (row.length < columnCount) row.push('');
    return row;
  });

  // Surplus columns get a generated header so their content stays visible
  // instead of disappearing.
  const widest = rows.reduce((max, row) => Math.max(max, row.length), columnCount);
  for (let index = headers.length; index < widest; index += 1) {
    headers.push(`Spalte ${index + 1}`);
  }

  return { headers, rows, delimiter: usedDelimiter };
}
