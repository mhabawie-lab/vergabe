/**
 * Was die Anwendung über ihren eigenen Datenbestand behaupten darf.
 *
 * Zweimal ist derselbe Fehler aufgetreten: aus fehlenden Daten wurde eine
 * Aussage abgeleitet — einmal „Buckets fehlen", einmal „nur Demo-Daten".
 * Eine leere Menge trägt keine Information über die Art ihrer Elemente.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MemoryTenderRepository } from '@/lib/db/memory/tender-repository';
import { createEmptyTables, type MemoryTables } from '@/lib/db/memory/tables';
import type { Tender } from '@/types/tender';

/** Only `isDemo` matters here; the rest is filler with invented values. */
function repositoryWith(flags: boolean[]): MemoryTenderRepository {
  const tables: MemoryTables = createEmptyTables();
  tables.tenders = flags.map(
    (isDemo, index) =>
      ({
        id: `00000000-0000-4000-8000-00000000000${index}`,
        isDemo,
      }) as unknown as Tender,
  );
  return new MemoryTenderRepository(tables);
}

describe('Aussage über den Datenbestand', () => {
  it('1 — ein leerer Bestand gilt nicht als Demo-Bestand', async () => {
    // Der eigentliche Fehler: null Ausschreibungen bedeutet null echte,
    // woraus die alte Fassung „ausschließlich Beispieldaten" schloss.
    const repository = repositoryWith([]);
    expect(await repository.isDemoOnly()).toBe(false);
  });

  it('2 — nur Demo-Datensätze gelten als Demo-Bestand', async () => {
    const repository = repositoryWith([true, true]);
    expect(await repository.isDemoOnly()).toBe(true);
  });

  it('3 — ein einziger echter Datensatz beendet die Demo-Aussage', async () => {
    const repository = repositoryWith([true, false]);
    expect(await repository.isDemoOnly()).toBe(false);
  });

  it('4 — der Supabase-Adapter zählt beide Seiten, nicht nur eine', () => {
    const adapter = readFileSync('src/lib/db/supabase/tender-repository.ts', 'utf8');
    // Ohne die zweite Zählung ist "keine echten" von "gar keine" nicht zu
    // unterscheiden.
    expect(adapter).toContain("(real.count ?? 0) === 0 && (demo.count ?? 0) > 0");
  });

  it('5 — die Anmeldeseite behauptet nichts über den Datenbestand', () => {
    const layout = readFileSync('src/app/(auth)/layout.tsx', 'utf8');
    // Vor der Anmeldung ist unbekannt, was die Installation enthält.
    expect(layout).not.toContain('DEMO-Daten');
    expect(layout).not.toContain('Phase 1');
  });

  it('6 — die Quellenseite leitet ihren Hinweis aus den Quellen ab', () => {
    const page = readFileSync('src/app/(app)/sources/page.tsx', 'utf8');
    expect(page).toContain('liveSources');
    expect(page).not.toContain('Phase 1: ausschließlich die DEMO-Quelle');
  });
});
