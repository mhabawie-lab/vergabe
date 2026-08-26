/**
 * First-organisation onboarding and role/permission boundaries.
 *
 * The database is the authority for onboarding — `create_first_organization`
 * is covered by supabase/tests/onboarding.sql. These cases cover the parts
 * that live in the application: the slug proposal, the input rules that must
 * mirror the database check, and the role matrix the API layer enforces on
 * top of RLS.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_SLUG_PATTERN,
  suggestOrganizationSlug,
  validateOnboardingInput,
} from '@/modules/organizations/onboarding';
import { ROLES, ROLE_PERMISSIONS, isRole } from '@/config/roles';

describe('Kennungsvorschlag', () => {
  it('1 — schlägt eine Kennung aus dem Namen vor', () => {
    expect(suggestOrganizationSlug('Musterbetrieb Sicherheit GmbH')).toBe(
      'musterbetrieb-sicherheit-gmbh',
    );
  });

  it('2 — löst deutsche Umlaute auf', () => {
    expect(suggestOrganizationSlug('Wächter & Söhne KG')).toBe('waechter-soehne-kg');
  });

  it('3 — erzeugt keine führenden oder abschließenden Bindestriche', () => {
    const slug = suggestOrganizationSlug('  — Sicherheit —  ');
    expect(slug).toBe('sicherheit');
    expect(ORGANIZATION_SLUG_PATTERN.test(slug)).toBe(true);
  });

  it('4 — kürzt lange Namen auf eine gültige Kennung', () => {
    const slug = suggestOrganizationSlug('A'.repeat(200));
    expect(slug.length).toBeLessThanOrEqual(50);
    expect(ORGANIZATION_SLUG_PATTERN.test(slug)).toBe(true);
  });

  it('5 — der Vorschlag ist nur ein Vorschlag, kein Zwang', () => {
    // The form keeps the field editable; the module never rewrites input.
    const form = readFileSync('src/components/auth/onboarding-form.tsx', 'utf8');
    expect(form).toContain('slugEdited');
    expect(form).toContain('setSlugEdited(true)');
  });
});

describe('Onboarding-Eingaben', () => {
  it('6 — akzeptiert eine vollständige Eingabe', () => {
    expect(
      validateOnboardingInput({ name: 'Musterbetrieb GmbH', slug: 'musterbetrieb' }),
    ).toEqual([]);
  });

  it('7 — weist einen leeren Namen ab', () => {
    const issues = validateOnboardingInput({ name: '   ', slug: 'musterbetrieb' });
    expect(issues.map((issue) => issue.field)).toEqual(['name']);
  });

  it('8 — weist einen zu langen Namen ab', () => {
    const issues = validateOnboardingInput({
      name: 'A'.repeat(ORGANIZATION_NAME_MAX_LENGTH + 1),
      slug: 'musterbetrieb',
    });
    expect(issues.map((issue) => issue.field)).toEqual(['name']);
  });

  it('9 — weist ungültige Kennungen ab', () => {
    for (const slug of ['ab', 'mit leerzeichen', '-vorne', 'hinten-', 'ä-umlaut', '!']) {
      const issues = validateOnboardingInput({ name: 'Musterbetrieb GmbH', slug });
      expect(issues.map((issue) => issue.field)).toEqual(['slug']);
    }
  });

  it('9a — Großschreibung wird normalisiert, nicht abgewiesen', () => {
    // The database lowercases the slug as well, so rejecting it here would
    // be stricter than the rule that actually applies.
    expect(
      validateOnboardingInput({ name: 'Musterbetrieb GmbH', slug: 'Musterbetrieb' }),
    ).toEqual([]);
  });

  it('10 — meldet alle Probleme gemeinsam, nicht nur das erste', () => {
    const issues = validateOnboardingInput({ name: '', slug: '!' });
    expect(issues.map((issue) => issue.field).sort()).toEqual(['name', 'slug']);
  });

  it('11 — die Prüfung entspricht der Prüfung in der Datenbank', () => {
    const migration = readFileSync(
      'supabase/migrations/0016_organization_onboarding.sql',
      'utf8',
    );
    // Same pattern on both sides. If one is loosened, the other must follow.
    expect(migration).toContain(ORGANIZATION_SLUG_PATTERN.source.replace(/\\/g, ''));
  });
});

describe('Onboarding-Grenzen', () => {
  const migration = readFileSync(
    'supabase/migrations/0016_organization_onboarding.sql',
    'utf8',
  );
  const route = readFileSync(
    'src/app/api/v1/onboarding/organization/route.ts',
    'utf8',
  );

  it('12 — anon darf die Funktion nicht ausführen', () => {
    expect(migration).toMatch(
      /revoke all on function public\.create_first_organization[^;]*from anon;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.create_first_organization[^;]*to authenticated;/,
    );
  });

  it('13 — ein zweites Onboarding wird abgewiesen', () => {
    expect(migration).toContain('gehört bereits zu einer Organisation');
    expect(route).toContain('bereits zu einer Organisation');
  });

  it('14 — gleichzeitige Aufrufe werden serialisiert', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
  });

  it('15 — die neue Organisation ist keine Demo-Organisation', () => {
    expect(migration).toMatch(/is_demo\s*\)\s*\n?\s*values|false\n?\s*\)\s*\n\s*returning/);
    expect(migration).toContain('Never a demo tenant');
  });

  it('16 — der Auditeintrag enthält keine Inhalte, nur Metadaten', () => {
    expect(migration).toContain("jsonb_build_object('role', 'org_admin', 'via', 'first_organization')");
    expect(migration).not.toContain('jsonb_build_object(\'name\'');
  });

  it('17 — der Aufrufer wird aus der Sitzung abgeleitet, nicht aus dem Request', () => {
    // No user id anywhere in the request schema: the database reads auth.uid().
    expect(route).not.toContain('userId');
    expect(migration).toMatch(/v_user\s+uuid := auth\.uid\(\)/);
  });

  it('18 — im Speicherbackend gibt es keine Registrierung', () => {
    expect(route).toContain("resolveBackend().backend === 'memory'");
  });
});

describe('Rollen und Berechtigungen', () => {
  it('19 — jede Rolle hat eine definierte Berechtigungsmenge', () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });

  it('20 — der erste Benutzer wird Organisations-Admin, nicht Plattform-Admin', () => {
    const migration = readFileSync(
      'supabase/migrations/0016_organization_onboarding.sql',
      'utf8',
    );
    expect(migration).toContain("'org_admin'");
    expect(migration).not.toContain('is_platform_admin');
  });

  it('21 — ein Betrachter darf keine vertraulichen Partnerdaten sehen', () => {
    expect(ROLE_PERMISSIONS.viewer).not.toContain('subcontractors:financial');
    expect(ROLE_PERMISSIONS.viewer).not.toContain('subcontractors:documents');
    expect(ROLE_PERMISSIONS.viewer).not.toContain('subcontractors:admin');
  });

  it('22 — ein Bid Manager darf keine Plattformadministration', () => {
    expect(ROLE_PERMISSIONS.bid_manager).not.toContain('admin:platform');
  });

  it('23 — eine unbekannte Rolle gilt nicht als Rolle', () => {
    expect(isRole('org_admin')).toBe(true);
    expect(isRole('root')).toBe(false);
    expect(isRole('')).toBe(false);
  });

  it('24 — die Organisation kommt aus der Sitzung, nie aus dem Request', () => {
    const session = readFileSync('src/lib/auth/session.ts', 'utf8');
    expect(session).toContain('organization_members');
    // Three states: anonymous, onboarding, session. A signed-in user without
    // an organisation must not silently become a demo super admin.
    expect(session).toContain("kind: 'onboarding'");
    expect(session).toContain("redirect('/onboarding')");
  });
});
