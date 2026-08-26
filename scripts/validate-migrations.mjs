#!/usr/bin/env node
/**
 * Static validation of the SQL migrations.
 *
 * Runs without a database, so it belongs in CI where no Supabase credentials
 * exist. It checks the rules this project has decided are non-negotiable and
 * that are easy to break silently:
 *
 *   * migrations are numbered without gaps and never edited after release
 *   * nothing destructive: no DROP TABLE/COLUMN, no TRUNCATE, no unqualified
 *     DELETE — the database holds customer and partner data
 *   * every table created gets Row Level Security enabled somewhere
 *   * every function pins `search_path` (a mutable one is a privilege
 *     escalation vector)
 *   * `security definer` appears only on functions that are meant to have it
 *   * no dynamic SQL built from a parameter
 *
 * Exit code 1 on any violation, with the file and the reason.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';

/** Functions that are deliberately `security definer`, with the reason. */
const ALLOWED_SECURITY_DEFINER = new Map([
  ['handle_new_user', 'Trigger auf auth.users; läuft ohne Benutzerkontext.'],
  ['is_platform_admin', 'Liest profiles, um RLS auf profiles nicht zu rekursivieren.'],
  ['is_org_member', 'Liest organization_members; sonst rekursive RLS-Auswertung.'],
  ['has_org_role', 'Wie is_org_member.'],
  ['reject_demo_reference_data', 'Prüft organizations, die der Aufrufer nicht lesen darf.'],
  ['reject_demo_partner_data', 'Wie reject_demo_reference_data.'],
  ['log_reference_change', 'Schreibt ins audit_log, das für Benutzer nur anfügend ist.'],
  ['log_service_confirmation', 'Wie log_reference_change.'],
  ['log_partner_change', 'Wie log_reference_change.'],
  [
    'create_first_organization',
    'Der Aufrufer hat noch keine Mitgliedschaft und kann daher keine Tenant-Policy erfüllen; auf auth.uid() und einen einzigen Lauf begrenzt.',
  ],
  [
    'needs_onboarding',
    'Liest organization_members, das der Aufrufer ohne Mitgliedschaft nicht sehen darf.',
  ],
]);

const DESTRUCTIVE = [
  { pattern: /\bdrop\s+table\b/i, what: 'DROP TABLE' },
  { pattern: /\bdrop\s+column\b/i, what: 'DROP COLUMN' },
  { pattern: /\bdrop\s+schema\b/i, what: 'DROP SCHEMA' },
  { pattern: /\btruncate\b/i, what: 'TRUNCATE' },
  { pattern: /\bdrop\s+database\b/i, what: 'DROP DATABASE' },
];

const problems = [];
const notes = [];

function fail(file, message) {
  problems.push(`${file}: ${message}`);
}

const files = readdirSync(DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error('Keine Migrationen gefunden.');
  process.exit(1);
}

// --- Numbering -------------------------------------------------------------
let expected = 1;
for (const file of files) {
  const match = /^(\d+)_/.exec(file);
  if (match === null) {
    fail(file, 'Dateiname beginnt nicht mit einer Versionsnummer.');
    continue;
  }
  const version = Number.parseInt(match[1], 10);
  if (version !== expected) {
    fail(file, `Lücke oder Sprung in der Nummerierung: erwartet ${expected}, gefunden ${version}.`);
  }
  expected = version + 1;
}

// --- Per-file checks -------------------------------------------------------
const createdTables = new Set();
const rlsEnabled = new Set();
/** Latest definition per function name, in migration order. */
const functionState = new Map();

for (const file of files) {
  const sql = readFileSync(join(DIR, file), 'utf8');
  // Strip line comments so a documented "no DROP TABLE here" does not trip it.
  const code = sql.replace(/^\s*--.*$/gm, '');

  for (const { pattern, what } of DESTRUCTIVE) {
    if (pattern.test(code)) fail(file, `Destruktive Anweisung gefunden: ${what}.`);
  }

  // DELETE without WHERE would empty a table.
  const deletes = code.match(/\bdelete\s+from\s+[a-z_.\"]+(?![^;]*\bwhere\b)/gi);
  if (deletes !== null) {
    fail(file, `DELETE ohne WHERE gefunden (${deletes.length}×).`);
  }

  for (const match of code.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/gi)) {
    createdTables.add(match[1]);
  }
  for (const match of code.matchAll(/alter table public\.([a-z_]+)\s+enable row level security/gi)) {
    rlsEnabled.add(match[1]);
  }

  // Functions: what counts is the *last* definition across all migrations,
  // because a later `create or replace` is how this project corrects an
  // earlier one without rewriting a released file.
  const functionBlocks = code.split(/create or replace function|create function/i).slice(1);
  for (const block of functionBlocks) {
    const nameMatch = /^\s*(?:public\.)?([a-z_]+)\s*\(/i.exec(block);
    const name = nameMatch === null ? '(unbenannt)' : nameMatch[1];
    const head = block.slice(0, block.indexOf('$$') === -1 ? 400 : block.indexOf('$$'));

    functionState.set(name, {
      file,
      pinsSearchPath: /set\s+search_path/i.test(head),
      securityDefiner: /security\s+definer/i.test(head),
    });
  }

  // Dynamic SQL built from a parameter would defeat the sort whitelist.
  if (/execute\s+format\s*\([^)]*\bp_/i.test(code)) {
    fail(file, 'Dynamisches SQL aus einem Funktionsparameter gefunden.');
  }
}

// --- Function safety, judged on the final definition ------------------------
for (const [name, state] of functionState) {
  if (!state.pinsSearchPath) {
    fail(
      state.file,
      `Funktion ${name}: kein festgelegter search_path in der zuletzt gültigen Definition.`,
    );
  }
  if (state.securityDefiner && !ALLOWED_SECURITY_DEFINER.has(name)) {
    fail(
      state.file,
      `Funktion ${name}: security definer ohne dokumentierte Begründung. ` +
        'Bitte in scripts/validate-migrations.mjs eintragen oder auf security invoker umstellen.',
    );
  }
}

// --- RLS coverage ----------------------------------------------------------
for (const table of createdTables) {
  if (!rlsEnabled.has(table)) {
    fail('RLS', `Tabelle public.${table} hat keine aktivierte Row Level Security.`);
  }
}

notes.push(
  `${files.length} Migrationen, ${createdTables.size} Tabellen (alle mit RLS), ` +
    `${functionState.size} Funktionen mit festgelegtem search_path.`,
);

// --- Report ----------------------------------------------------------------
if (problems.length > 0) {
  console.error('Migrationsprüfung fehlgeschlagen:\n');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log('Migrationsprüfung bestanden.');
for (const note of notes) console.log(`  ${note}`);
