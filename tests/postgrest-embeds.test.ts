/**
 * Eindeutigkeit eingebetteter Beziehungen.
 *
 * PostgREST löst `tabelle ( spalte )` über den Fremdschlüssel auf. Gibt es
 * mehr als einen zwischen beiden Tabellen, verweigert es die Abfrage — die
 * Seite lädt dann gar nicht. Der prozessinterne Speicher kennt dieses
 * Problem nicht, deshalb fällt es erst gegen eine echte Datenbank auf.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const store = readFileSync('src/lib/db/supabase/partner-store.ts', 'utf8');
const migration = readFileSync('supabase/migrations/0011_partner_companies.sql', 'utf8');

describe('Eingebettete Beziehungen', () => {
  it('1 — subcontractor_assignments hat zwei Fremdschlüssel auf partner_companies', () => {
    // Genau das macht die Einbettung mehrdeutig.
    expect(migration).toContain('subcontractor_assignments_company_fk');
    expect(migration).toContain('subcontractor_assignments_contract_partner_fk');
  });

  it('2 — die Einbettung benennt den Fremdschlüssel ausdrücklich', () => {
    expect(store).toContain(
      'partner_companies!subcontractor_assignments_company_fk ( legal_name, is_blocked )',
    );
  });

  it('3 — keine unbenannte Einbettung auf subcontractor_assignments', () => {
    // Nur der select-Ausdruck selbst wird geprüft, nicht der umgebende Code:
    // eine eigenständige Abfrage auf partner_companies daneben ist erlaubt.
    const selects = [
      ...store.matchAll(
        /from\('subcontractor_assignments'\)\s*\.select\(\s*((?:'[^']*'|`[^`]*`)(?:\s*\+\s*(?:'[^']*'|`[^`]*`))*)/g,
      ),
    ].map((match) => match[1] ?? '');

    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) {
      if (select.includes('partner_companies')) {
        expect(select).toContain('partner_companies!');
      }
    }
  });
});
