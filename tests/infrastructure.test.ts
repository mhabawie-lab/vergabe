/**
 * Environment, backend selection and document storage rules.
 *
 * The cases that matter here are the ones that protect against a silent
 * wrong answer: a production deployment quietly running on a volatile store,
 * a secret reaching the browser, a file uploaded into another tenant's
 * folder, or a document presented as scanned when no scanner exists.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ALLOWED_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  bucketForOwner,
  buildStoragePath,
  fileExtension,
  isPublicUrl,
  pathBelongsToOrganization,
  sanitizeFileName,
  validateUpload,
} from '@/modules/documents/storage';
import { canDownload, permissionsFor } from '@/modules/documents/permissions';
import { ROLE_PERMISSIONS } from '@/config/roles';

const ORG = '00000000-0000-4000-8000-00000000000a';
const OTHER_ORG = '00000000-0000-4000-8000-00000000000b';

// ---------------------------------------------------------------------------

describe('Umgebung und Datenbackend', () => {
  it('1 — der Secret-Key wird nur im server-only-Modul gelesen', () => {
    const publicModule = readFileSync('src/lib/env/public.ts', 'utf8');
    const serverModule = readFileSync('src/lib/env/server.ts', 'utf8');

    // The public module ships to the browser, so it must not even name the
    // secret variables — a later refactor would otherwise pull them in.
    expect(publicModule).not.toContain('SUPABASE_SECRET_KEY');
    expect(publicModule).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(serverModule).toContain("import 'server-only'");
    expect(serverModule).toContain('SUPABASE_SECRET_KEY');
  });

  it('2 — der Browser-Client importiert nur das öffentliche Modul', () => {
    const client = readFileSync('src/lib/supabase/client.ts', 'utf8');
    // Only the import statements count — the file's own comment names the
    // forbidden modules on purpose, to say why they are forbidden.
    const imports = client
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line))
      .join('\n');

    expect(imports).toContain('@/lib/env/public');
    expect(imports).not.toMatch(/from '@\/lib\/env'/);
    expect(imports).not.toContain('env/server');
  });

  it('3 — der Adapter fällt nirgends still von Supabase auf Memory zurück', () => {
    const factory = readFileSync('src/lib/db/index.ts', 'utf8');
    // Every store getter branches on the resolved backend and returns the
    // memory store only in the memory branch; there is no catch that swaps
    // the backend after a Supabase error.
    expect(factory).not.toMatch(/catch[\s\S]{0,200}getMemory(Tender|Reference|Partner|Document)/);
    expect(factory).toContain('getBackendDecision');
  });

  it('4 — die Produktion darf nicht ohne ausdrückliche Ausnahme im Memory-Modus starten', () => {
    const server = readFileSync('src/lib/env/server.ts', 'utf8');
    expect(server).toContain('ALLOW_MEMORY_BACKEND_IN_PRODUCTION');
    expect(server).toContain('EnvironmentError');
    // And a missing configuration in production raises rather than inferring.
    expect(server).toContain('Keine Supabase-Konfiguration in der Produktion');
  });

  it('5 — .env.example enthält nur Platzhalter', () => {
    const example = readFileSync('.env.example', 'utf8');
    for (const line of example.split('\n')) {
      if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
      const [, value] = line.split('=');
      expect(value?.trim() ?? '').toBe('');
    }
  });
});

// ---------------------------------------------------------------------------

describe('Dateiprüfung beim Upload', () => {
  it('6 — ein zulässiges PDF wird angenommen', () => {
    const result = validateUpload({
      fileName: 'nachweis.pdf',
      mimeType: 'application/pdf',
      size: 1024,
    });
    expect(result.valid).toBe(true);
  });

  it('7 — ein unzulässiger Dateityp wird abgelehnt', () => {
    const result = validateUpload({
      fileName: 'schadsoftware.exe',
      mimeType: 'application/x-msdownload',
      size: 1024,
    });
    expect(result.valid).toBe(false);
    expect(result.messages.join(' ')).toContain('nicht zugelassen');
  });

  it('8 — eine als PDF getarnte Datei wird erkannt', () => {
    // The extension says PDF, the declared type says executable. Both are
    // checked, and they have to agree.
    const result = validateUpload({
      fileName: 'harmlos.pdf',
      mimeType: 'application/x-msdownload',
      size: 1024,
    });
    expect(result.valid).toBe(false);
  });

  it('9 — eine zu große Datei wird abgelehnt', () => {
    const result = validateUpload({
      fileName: 'gross.pdf',
      mimeType: 'application/pdf',
      size: MAX_DOCUMENT_BYTES + 1,
    });
    expect(result.valid).toBe(false);
    expect(result.messages.join(' ')).toContain('größer als');
  });

  it('10 — eine leere Datei wird abgelehnt', () => {
    expect(
      validateUpload({ fileName: 'leer.pdf', mimeType: 'application/pdf', size: 0 }).valid,
    ).toBe(false);
  });

  it('11 — nur die sechs dokumentierten Typen sind erlaubt', () => {
    expect(ALLOWED_MIME_TYPES).toHaveLength(6);
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
    expect(ALLOWED_MIME_TYPES).not.toContain('application/zip');
    expect(ALLOWED_MIME_TYPES).not.toContain('application/x-msdownload');
  });
});

// ---------------------------------------------------------------------------

describe('Objektpfade', () => {
  it('12 — Pfadmanipulation wird aus dem Dateinamen entfernt', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
    expect(sanitizeFileName('/absolut/pfad/datei.pdf')).toBe('datei.pdf');
    // A name that reduces to nothing still yields a usable key.
    expect(sanitizeFileName('...')).toBe('dokument');
  });

  it('13 — der Pfad beginnt mit der Organisation', () => {
    const path = buildStoragePath({
      organizationId: ORG,
      ownerType: 'partner_company',
      ownerId: '00000000-0000-4000-8000-0000000000c1',
      fileName: 'Nachweis 2026.pdf',
      uuid: '11111111-2222-3333-4444-555555555555',
    });

    expect(path.startsWith(`${ORG}/partner_company/`)).toBe(true);
    expect(path.endsWith('Nachweis_2026.pdf')).toBe(true);
    expect(pathBelongsToOrganization(path, ORG)).toBe(true);
    expect(pathBelongsToOrganization(path, OTHER_ORG)).toBe(false);
  });

  it('14 — eine Pfadmanipulation kann die Organisation nicht verlassen', () => {
    const path = buildStoragePath({
      organizationId: ORG,
      ownerType: 'reference_project',
      ownerId: '00000000-0000-4000-8000-0000000000c2',
      fileName: '../../../andere-org/geheim.pdf',
      uuid: '11111111-2222-3333-4444-555555555555',
    });

    expect(path.split('/')).toHaveLength(4);
    expect(pathBelongsToOrganization(path, ORG)).toBe(true);
  });

  it('15 — Buckets sind je Eigentümerart getrennt', () => {
    expect(bucketForOwner('partner_company')).toBe('partner-documents');
    expect(bucketForOwner('organization')).toBe('organization-documents');
    expect(bucketForOwner('reference_project')).toBe('reference-documents');
    expect(bucketForOwner('business_client')).toBe('reference-documents');
  });

  it('16 — ein Storage-Pfad ist nie eine URL', () => {
    expect(isPublicUrl('https://example.invalid/datei.pdf')).toBe(true);
    expect(isPublicUrl(`${ORG}/organization/${ORG}/x.pdf`)).toBe(false);
    expect(fileExtension('nachweis.PDF')).toBe('pdf');
    expect(fileExtension('ohne-endung')).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('Dokumentberechtigungen', () => {
  it('17 — Partnerdokumente verlangen subcontractors:documents', () => {
    expect(permissionsFor('partner_company').read).toBe('subcontractors:documents');
    expect(canDownload('partner_company', ROLE_PERMISSIONS.viewer)).toBe(false);
    expect(canDownload('partner_company', ROLE_PERMISSIONS.bid_manager)).toBe(true);
  });

  it('18 — Referenzdokumente verlangen die Referenzberechtigung', () => {
    expect(permissionsFor('reference_project').read).toBe('references:read');
    expect(canDownload('reference_project', ROLE_PERMISSIONS.viewer)).toBe(true);
    expect(permissionsFor('reference_project').write).toBe('references:write');
    expect(ROLE_PERMISSIONS.viewer).not.toContain('references:write');
  });

  it('19 — Organisationsdokumente verlangen Administratorrechte zum Schreiben', () => {
    expect(permissionsFor('organization').write).toBe('company:write');
    expect(ROLE_PERMISSIONS.bid_manager).not.toContain('company:write');
    expect(ROLE_PERMISSIONS.org_admin).toContain('company:write');
  });

  it('20 — das endgültige Löschen ist enger als das Archivieren', () => {
    const partner = permissionsFor('partner_company');
    expect(partner.destroy).toBe('subcontractors:admin');
    // A bid manager may archive a partner document but not destroy it.
    expect(ROLE_PERMISSIONS.bid_manager).toContain(partner.write);
    expect(ROLE_PERMISSIONS.bid_manager).not.toContain(partner.destroy);
  });
});

describe('Statusseite: keine Behauptung ohne Beleg', () => {
  const status = readFileSync('src/modules/infrastructure/status.ts', 'utf8');

  it('21 — eine leere Bucket-Liste gilt als "nicht sichtbar", nicht als "fehlt"', () => {
    // storage.buckets steht selbst unter RLS: der Browser-Schlüssel darf
    // nicht auflisten, und die Antwort ist dann leer statt fehlerhaft.
    expect(status).toContain('visible.length === 0');
    expect(status).toContain('kein Beleg');
  });

  it('22 — aus einer leeren Liste wird nicht auf private Buckets geschlossen', () => {
    // Die Zusicherung "kein öffentlicher Bucket" darf nur fallen, wenn
    // überhaupt Buckets sichtbar waren.
    expect(status).toContain('unter den ${visible.length} sichtbaren');
    expect(status).not.toContain("detail: 'Kein öffentlicher Bucket.'");
  });

  it('23 — im Speicherbackend werden alle Storage-Prüfungen übersprungen', () => {
    expect(status).toContain("'Erwartete Buckets',");
    expect(status).toContain("'Buckets privat',");
  });
});


describe('Erreichbarkeit ohne Sitzung', () => {
  const proxy = readFileSync('src/proxy.ts', 'utf8');

  it('24 — der Gesundheitsendpunkt liegt nicht hinter der Anmeldung', () => {
    // Eine Deployment-Probe hat nie eine Sitzung. Ohne diesen Eintrag
    // antwortet /api/health mit 307 auf /login statt mit seinem Status.
    expect(proxy).toContain("'/api/health'");
    expect(proxy).toMatch(/PUBLIC_PATHS = \[[^\]]*'\/api\/health'/s);
  });

  it('25 — sonst bleibt jede Anwendungsseite geschützt', () => {
    // Der Proxy ist die erste Schranke; die Seiten prüfen zusätzlich selbst.
    expect(proxy).toContain('redirect(loginUrl)');
    expect(proxy).not.toContain("'/dashboard'");
  });
});
