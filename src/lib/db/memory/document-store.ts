/**
 * DocumentStore backed by in-process tables.
 *
 * It records metadata and keeps the bytes in memory for the lifetime of the
 * process. It says so: `capabilities().storesFileContent` is true but
 * `note` explains that nothing is persisted, and the UI repeats that wherever
 * an upload is offered.
 *
 * The one thing it must not do is imply safety. There is no scanner, so
 * `malwareScanning` is false and every document keeps `scan_status =
 * not_scanned`.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { AuditEntry, AuditEntryInput } from '../reference-ports';
import type {
  CreateDocumentInput,
  DocumentStore,
  DocumentStoreCapabilities,
  SignedDownload,
  StoredDocument,
  UpdateDocumentInput,
} from '../document-ports';
import {
  bucketForOwner,
  buildStoragePath,
  pathBelongsToOrganization,
  type DocumentOwnerType,
} from '@/modules/documents/storage';
import { daysUntil } from '@/modules/partners/credentials';

export interface DocumentTables {
  documents: StoredDocument[];
  /** Object key → bytes. Lost on restart, like everything else here. */
  objects: Map<string, Uint8Array>;
  auditLog: AuditEntry[];
}

export function createEmptyDocumentTables(): DocumentTables {
  return { documents: [], objects: new Map(), auditLog: [] };
}

/** Owner records the store may attach a document to, per organisation. */
export interface OwnerResolver {
  exists(
    organizationId: string,
    ownerType: DocumentOwnerType,
    ownerId: string,
  ): boolean;
}

export class MemoryDocumentStore implements DocumentStore {
  constructor(
    private readonly tables: DocumentTables,
    private readonly owners: OwnerResolver,
  ) {}

  capabilities(): DocumentStoreCapabilities {
    return {
      storesFileContent: true,
      malwareScanning: false,
      note:
        'Lokaler Entwicklungsspeicher: Dateien liegen im Arbeitsspeicher und gehen ' +
        'beim Neustart verloren. Keine sichere Ablage, kein Malware-Scan. Hier ' +
        'gehören keine echten vertraulichen Dokumente hinein.',
    };
  }

  async create(input: CreateDocumentInput): Promise<StoredDocument | null> {
    if (!this.owners.exists(input.organizationId, input.ownerType, input.ownerId)) {
      return null;
    }

    const now = new Date().toISOString();
    const storagePath = buildStoragePath({
      organizationId: input.organizationId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      fileName: input.file.fileName,
      uuid: randomUUID(),
    });

    const checksum = createHash('sha256').update(input.file.bytes).digest('hex');

    const document: StoredDocument = {
      id: randomUUID(),
      organizationId: input.organizationId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      credentialType: input.credentialType,
      title: input.title,
      issuer: input.issuer,
      documentNumber: input.documentNumber,
      bucketId: bucketForOwner(input.ownerType),
      storagePath,
      fileName: storagePath.split('/').pop() ?? input.file.fileName,
      originalFileName: input.file.fileName,
      mimeType: input.file.mimeType,
      fileSize: input.file.size,
      checksum,
      confidentiality: input.confidentiality,
      // No scanner exists. Anything else here would be a claim we cannot back.
      scanStatus: 'not_scanned',
      lifecycle: 'active',
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      reviewStatus: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      note: input.note,
      uploadedBy: input.uploadedBy,
      archivedAt: null,
      archivedBy: null,
      createdAt: now,
      updatedAt: now,
    };

    this.tables.objects.set(storagePath, input.file.bytes);
    this.tables.documents.push(document);
    return document;
  }

  async list(
    organizationId: string,
    owner: { ownerType: DocumentOwnerType; ownerId: string },
    options: { includeArchived?: boolean } = {},
  ): Promise<StoredDocument[]> {
    return this.tables.documents
      .filter(
        (document) =>
          document.organizationId === organizationId &&
          document.ownerType === owner.ownerType &&
          document.ownerId === owner.ownerId &&
          (options.includeArchived === true || document.lifecycle === 'active'),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(organizationId: string, id: string): Promise<StoredDocument | null> {
    return (
      this.tables.documents.find(
        (document) => document.id === id && document.organizationId === organizationId,
      ) ?? null
    );
  }

  async update(
    organizationId: string,
    id: string,
    patch: UpdateDocumentInput,
  ): Promise<StoredDocument | null> {
    const document = await this.findById(organizationId, id);
    if (document === null) return null;

    Object.assign(document, patch);
    if (patch.reviewStatus !== undefined) {
      document.reviewedAt = patch.reviewStatus === 'pending' ? null : new Date().toISOString();
      document.reviewedBy = patch.reviewStatus === 'pending' ? null : (patch.reviewedBy ?? null);
    }
    document.updatedAt = new Date().toISOString();
    return document;
  }

  async archive(
    organizationId: string,
    id: string,
    archivedBy: string | null,
  ): Promise<StoredDocument | null> {
    const document = await this.findById(organizationId, id);
    if (document === null) return null;

    // Archiving hides, it does not delete: the record of what was filed and
    // when has to survive the decision to stop using it.
    document.lifecycle = 'archived';
    document.archivedAt = new Date().toISOString();
    document.archivedBy = archivedBy;
    document.updatedAt = document.archivedAt;
    return document;
  }

  async remove(organizationId: string, id: string): Promise<StoredDocument | null> {
    const index = this.tables.documents.findIndex(
      (document) => document.id === id && document.organizationId === organizationId,
    );
    if (index === -1) return null;

    const [document] = this.tables.documents.splice(index, 1);
    if (document === undefined) return null;

    this.tables.objects.delete(document.storagePath);
    return document;
  }

  async createSignedDownload(
    organizationId: string,
    id: string,
    ttlSeconds: number,
  ): Promise<SignedDownload | null> {
    const document = await this.findById(organizationId, id);
    if (document === null) return null;

    // Belt and braces: the path must still belong to this organisation even
    // though the row already said so.
    if (!pathBelongsToOrganization(document.storagePath, organizationId)) return null;

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return {
      // A local route, not a storage URL — there is no storage here. It
      // carries no token because the route re-checks the session.
      url: `/api/v1/documents/${document.id}/content`,
      expiresAt,
      fileName: document.originalFileName ?? document.fileName,
    };
  }

  async listExpiring(
    organizationId: string,
    withinDays: number,
  ): Promise<StoredDocument[]> {
    const now = new Date();
    return this.tables.documents
      .filter((document) => document.organizationId === organizationId)
      .filter((document) => document.validUntil !== null)
      .filter((document) => daysUntil(document.validUntil as string, now) <= withinDays)
      .sort((a, b) => (a.validUntil ?? '').localeCompare(b.validUntil ?? ''));
  }

  async recordAuditEntry(input: AuditEntryInput): Promise<void> {
    this.tables.auditLog.push({
      id: randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      userName: null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    });
  }

  /** Bytes for the local content route. Null when the object is unknown. */
  readObject(storagePath: string): Uint8Array | null {
    return this.tables.objects.get(storagePath) ?? null;
  }
}
