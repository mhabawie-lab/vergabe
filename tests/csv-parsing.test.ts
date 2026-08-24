import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from '@/modules/references/parse/csv';

describe('CSV-Parser', () => {
  it('erkennt das Semikolon deutscher Excel-Exporte', () => {
    const text = 'Objekt-Nr.;Objektname;Ort\nBSP-1;Halle Nord;Musterstadt';
    expect(detectDelimiter(text)).toBe(';');
  });

  it('erkennt das Komma', () => {
    const text = 'Objekt-Nr.,Objektname,Ort\nBSP-1,Halle Nord,Musterstadt';
    expect(detectDelimiter(text)).toBe(',');
  });

  it('zählt Trennzeichen innerhalb von Anführungszeichen nicht mit', () => {
    // The quoted header contains three commas but only one real separator.
    const text = '"Name, Zusatz, weiteres";Ort\n"Wert";Musterstadt';
    expect(detectDelimiter(text)).toBe(';');
  });

  it('liest Kopfzeile und Datenzeilen', () => {
    const table = parseCsv('a;b;c\n1;2;3\n4;5;6');
    expect(table.headers).toEqual(['a', 'b', 'c']);
    expect(table.rows).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('entfernt das BOM aus dem ersten Spaltennamen', () => {
    const table = parseCsv('﻿Objekt-Nr.;Ort\nBSP-1;Musterstadt');
    expect(table.headers[0]).toBe('Objekt-Nr.');
  });

  it('behandelt doppelte Anführungszeichen als Literal', () => {
    const table = parseCsv('a;b\n"Er sagte ""Hallo""";x');
    expect(table.rows[0]?.[0]).toBe('Er sagte "Hallo"');
  });

  it('erhält Trennzeichen innerhalb eines maskierten Feldes', () => {
    const table = parseCsv('a;b\n"Musterstadt; Ortsteil Nord";x');
    expect(table.rows[0]?.[0]).toBe('Musterstadt; Ortsteil Nord');
  });

  it('kommt mit CRLF-Zeilenenden zurecht', () => {
    const table = parseCsv('a;b\r\n1;2\r\n3;4');
    expect(table.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('füllt zu kurze Zeilen auf, statt Spalten zu verlieren', () => {
    const table = parseCsv('a;b;c\n1;2');
    expect(table.rows[0]).toEqual(['1', '2', '']);
  });

  it('verwirft leere Zeilen', () => {
    const table = parseCsv('a;b\n1;2\n\n3;4\n');
    expect(table.rows).toHaveLength(2);
  });

  it('wirft einen Fehler ohne Kopfzeile', () => {
    expect(() => parseCsv('')).toThrow(/Kopfzeile/);
  });

  it('liest die mitgelieferte Beispielvorlage', () => {
    const template = [
      'Objekt-Nr.;Objektname;Objektart;Ort;Kunde;Schichten;Rechnung?',
      'BSP-0001;Security Musterwerk Nord;Werksgelände;Musterstadt;Beispiel Industrie GmbH (MUSTER);218/146/0;Ja',
    ].join('\n');

    const table = parseCsv(template);
    expect(table.headers).toHaveLength(7);
    expect(table.rows[0]?.[5]).toBe('218/146/0');
  });
});
