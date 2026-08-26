#!/usr/bin/env node
/**
 * Runs the SQL test scripts against a database.
 *
 * Uses `DATABASE_URL`. Every script wraps itself in a transaction that it
 * rolls back, so this leaves nothing behind — but it still refuses to run
 * against anything that looks like production, because "it rolls back" is a
 * promise about the scripts, not about a typo in a connection string.
 *
 *   DATABASE_URL=postgresql://… npm run db:test
 *
 * Without `DATABASE_URL` it exits 0 with an explanation: CI has no database
 * and must not fail for the absence of one.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/tests';
const url = process.env.DATABASE_URL;

if (url === undefined || url.trim().length === 0) {
  console.log('DATABASE_URL ist nicht gesetzt — SQL-Tests werden übersprungen.');
  console.log('Ausführen mit: DATABASE_URL=postgresql://… npm run db:test');
  process.exit(0);
}

// A rollback protects the data, not the operator. Refuse anything that reads
// like a production host unless the run is explicitly acknowledged.
const looksRemote = /supabase\.(co|com|in)\b/i.test(url) || /prod/i.test(url);
if (looksRemote && process.env.ALLOW_SQL_TESTS_AGAINST_REMOTE !== 'true') {
  console.error(
    'DATABASE_URL zeigt auf eine entfernte oder produktive Datenbank.\n' +
      'Die SQL-Tests laufen bewusst nur lokal. Für einen bewussten Lauf gegen\n' +
      'eine Entwicklungsinstanz: ALLOW_SQL_TESTS_AGAINST_REMOTE=true setzen.',
  );
  process.exit(1);
}

const scripts = readdirSync(DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();

let failed = 0;
let total = 0;

for (const script of scripts) {
  process.stdout.write(`\n── ${script}\n`);

  const result = spawnSync(
    'psql',
    [url, '-v', 'ON_ERROR_STOP=1', '-q', '-f', join(DIR, script)],
    { encoding: 'utf8' },
  );

  // psql writes RAISE NOTICE to stderr, and that is where the per-case
  // "ok:" lines live — so both streams are read.
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const passed = (combined.match(/ok: /g) ?? []).length;

  if (result.status !== 0) {
    failed += 1;
    console.error(
      (result.stderr ?? String(result.error ?? 'unbekannter Fehler'))
        .split('\n')
        .slice(0, 12)
        .join('\n'),
    );
    continue;
  }

  if (passed === 0) {
    failed += 1;
    console.error('   Keine bestandene Prüfung gefunden — das Skript hat nichts geprüft.');
    continue;
  }

  total += passed;
  console.log(`   ${passed} Prüfungen bestanden.`);
}

if (failed > 0) {
  console.error(`\n${failed} Skript(e) fehlgeschlagen.`);
  process.exit(1);
}

console.log(`\nAlle SQL-Tests bestanden: ${total} Prüfungen in ${scripts.length} Skripten.`);
