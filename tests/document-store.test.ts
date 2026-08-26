/**
 * The document store against the in-process adapter.
 *
 * Covers the behaviour the API depends on: tenancy, checksums, archiving that
 * preserves the record, deletion that removes it, signed links that expire and
 * are never stored, and the refusal to claim a malware scan that does not
 * exist.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createEmptyDocumentTables,
  MemoryDocumentStore,
} from '@/lib/db/memory/document-store';
import type { CreateDocumentInput } from '@/lib/db/document-ports';

const ORG = '00000000-0000-4000-8000-00000000000a';
const OTHER_ORG = '00000000-0000-4000-8000-00000000000b';
const OWNER = '00000000-0000-4000-8000-0000000000c1';
const USER = '00000000-0000-4000-8000-0000000000u1';

function createStore() {
  const tables = createEmptyDocumentTables();
  const store = new MemoryDocumentStore(tables, {
    // Only this one owner exists, and only in ORG.
    exists: (organizationId, _ownerType, ownerId) =>
      organizationId === ORG && ownerId === OWNER,
  });
  return { store, tables };
}

function documentInput(overrides: Partial<CreateDocumentInput> = {}): CreateDocumentInput {
  return {
    organizationId: ORG,
    ownerType: 'partner_company',
    ownerId: OWNER,
    credentialType: 'guard_permit',
    title: 'Musterbescheinigung',
    issuer: 'Musterbehörde',
    documentNumber: 'MUSTER-1',
    confidentiality: 'confidential',
    validFrom: '2026-01-01',
    validUntil: '2027-01-01',
    note: null,
    uploadedBy: USER,
    file: {
      fileName: 'nachweis.pdf',
      mimeType: 'application/pdf',
      size: 11,
      bytes: new TextEncoder().encode('MUSTERDATEI'),
    },
    ...overrides,
  };
}

describe('Dokumentspeicher', () => {
  it('21 — legt ein Dokument mit Prüfsumme und Metadaten an', async () => {
    const { store } = createStore();
    const document = await store.create(documentInput());

    expect(document).not.toBeNull();
    // SHA-256 of "MUSTERDATEI" — 64 hex characters, stored so the file can be
    // identified again later.
    expect(document?.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(document?.fileSize).toBe(11);
    expect(document?.mimeType).toBe('application/pdf');
    expect(document?.uploadedBy).toBe(USER);
    expect(document?.originalFileName).toBe('nachweis.pdf');
  });

  it('22 — der Scanstatus bleibt „nicht geprüft"', async () => {
    const { store } = createStore();
    const document = await store.create(documentInput());

    expect(document?.scanStatus).toBe('not_scanned');
    expect(store.capabilities().malwareScanning).toBe(false);
  });

  it('23 — der Prüfstatus beginnt als ungeprüft', async () => {
    const { store } = createStore();
    const document = await store.create(documentInput());
    expect(document?.reviewStatus).toBe('pending');
    expect(document?.lifecycle).toBe('active');
  });

  it('24 — ein Dokument für einen fremden Datensatz wird abgelehnt', async () => {
    const { store } = createStore();
    const foreign = await store.create(
      documentInput({ ownerId: '00000000-0000-4000-8000-0000000000ff' }),
    );
    expect(foreign).toBeNull();
  });

  it('25 — eine fremde Organisation sieht das Dokument nicht', async () => {
    const { store } = createStore();
    const document = await store.create(documentInput());

    expect(await store.findById(OTHER_ORG, document!.id)).toBeNull();
    expect(
      await store.list(OTHER_ORG, { ownerType: 'partner_company', ownerId: OWNER }),
    ).toHaveLength(0);
  });

  it('26 — der Objektpfad beginnt mit der Organisation', async () => {
    const { store } = createStore();
    const document = await store.create(documentInput());

    expect(document?.storagePath.startsWith(`${ORG}/partner_company/${OWNER}/`)).toBe(true);
    expect(document?.storagePath.startsWith('http')).toBe(false);
  });

  it('27 — Archivieren erhält den Datensatz', async () => {
    const { store } = createStore();
    const document = await store.create(documentInput());

    const archived = await store.archive(ORG, document!.id, USER);
    expect(archived?.lifecycle).toBe('archived');
    expect(archived?.archivedAt).not.toBeNull();
    expect(archived?.archivedBy).toBe(USER);

    // Hidden by default, still there when asked for.
    expect(
      await store.list(ORG, { ownerType: 'partner_company', ownerId: OWNER }),
    ).toHaveLength(0);
    expect(
      await store.list(
        ORG,
        { ownerType: 'partner_company', ownerId: OWNER },
        { includeArchived: true },
      ),
    ).toHaveLength(1);
  });

  it('28 — Löschen entfernt Datensatz und Objekt', async () => {
    const { store, tables } = createStore();
    const document = await store.create(documentInput());
    expect(tables.objects.size).toBe(1);

    await store.remove(ORG, document!.id);
    expect(tables.documents).toHaveLength(0);
    expect(tables.objects.size).toBe(0);
  });

  it('29 — eine fremde Organisation kann nicht löschen', async () => {
    const { store, tables } = createStore();
    const document = await store.create(documentInput());

    expect(await store.remove(OTHER_ORG, document!.id)).toBeNull();
    expect(tables.documents).toHaveLength(1);
  });

  it('30 — der signierte Link läuft ab und wird nicht gespeichert', async () => {
    const { store, tables } = createStore();
    const document = await store.create(documentInput());

    const download = await store.createSignedDownload(ORG, document!.id, 300);
    expect(download).not.toBeNull();
    expect(new Date(download!.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // The URL exists only in the response. Nothing in the stored record
    // carries it — a stored link outlives the reason it was created.
    const stored = JSON.stringify(tables.documents[0]);
    expect(stored).not.toContain(download!.url);
  });

  it('31 — eine fremde Organisation erhält keinen Link', async () => {
    const { store } = createStore();
    const document = await store.create(documentInput());
    expect(await store.createSignedDownload(OTHER_ORG, document!.id, 300)).toBeNull();
  });

  it('32 — die Prüfung wird mit Person und Zeitpunkt festgehalten', async () => {
    const { store } = createStore();
    const document = await store.create(documentInput());

    const reviewed = await store.update(ORG, document!.id, {
      reviewStatus: 'accepted',
      reviewedBy: USER,
    });
    expect(reviewed?.reviewStatus).toBe('accepted');
    expect(reviewed?.reviewedBy).toBe(USER);
    expect(reviewed?.reviewedAt).not.toBeNull();
  });

  it('33 — ablaufende Dokumente werden gefunden', async () => {
    const { store } = createStore();
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 20);

    await store.create(
      documentInput({ validUntil: soon.toISOString().slice(0, 10) }),
    );
    await store.create(documentInput({ validUntil: '2099-01-01' }));

    const expiring = await store.listExpiring(ORG, 90);
    expect(expiring).toHaveLength(1);
  });

  it('34 — der Speicher sagt, dass er nichts dauerhaft ablegt', () => {
    const { store } = createStore();
    const capabilities = store.capabilities();

    expect(capabilities.malwareScanning).toBe(false);
    expect(capabilities.note).toContain('Arbeitsspeicher');
    expect(capabilities.note).toContain('keine echten');
  });
});

describe('Upload-Grenzen an der Systemgrenze', () => {
  const route = readFileSync('src/app/api/v1/documents/route.ts', 'utf8');

  it('15 — eine zu große Datei wird als Eingabefehler beantwortet, nicht als Serverfehler', () => {
    // The runtime refuses to parse an oversized body, which surfaces as a 500
    // unless the declared length is checked first.
    expect(route).toContain("request.headers.get('content-length')");
    expect(route).toContain('MAX_DOCUMENT_BYTES');
    expect(route).toMatch(/catch\s*\{[^}]*ValidationError/s);
  });

  it('16 — die Organisation stammt aus der Sitzung, nicht aus dem Formular', () => {
    expect(route).toContain('session.organization.id');
    expect(route).not.toContain("formData.get('organizationId')");
  });
});
