/**
 * DocumentStore backed by Supabase: Postgres for the metadata, private
 * buckets for the bytes.
 *
 * Two things are non-negotiable here and are visible in the code:
 *
 *   * The upload happens **server-side with the caller's own session**, so
 *     the storage policy sees the real user and the same RLS that guards the
 *     metadata guards the object. The secret key is never used for this.
 *   * Downloads are **short-lived signed URLs**, created on demand and never
 *     written to the database. A stored signed URL outlives the reason it was
 *     created and is a bearer token with a filename attached.
 *
 * Partner documents live in their own table (0011); reference and
 * organisation documents in the tables added by 0015. The port hides that,
 * because callers should not care which of three tables a document is in.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditEntryInput } from '../reference-ports';
import type {
  CreateDocumentInput,
  DocumentStore,
  DocumentStoreCapabilities,
  SignedDownload,
  StoredDocument,
  UpdateDocumentInput,
} from '../document-ports';
import { asRow, asRows } from './rows';
import {
  bucketForOwner,
  buildStoragePath,
  pathBelongsToOrganization,
  type DocumentOwnerType,
} from '@/modules/documents/storage';
import { daysUntil } from '@/modules/partners/credentials';
import type { ConfidentialityLevel } from '@/types/reference';
import type {
  CredentialReviewStatus,
  CredentialType,
  DocumentScanStatus,
} from '@/types/partner';

/** Which table holds a given owner's documents. */
function tableFor(ownerType: DocumentOwnerType): string {
  switch (ownerType) {
    case 'partner_company':
      return 'partner_documents';
    case 'organization':
      return 'organization_documents';
    default:
      return 'reference_documents';
  }
}

/** The column that names the owner, per table. */
function ownerColumn(ownerType: DocumentOwnerType): string | null {
  switch (ownerType) {
    case 'partner_company':
      return 'partner_company_id';
    case 'reference_project':
      return 'reference_project_id';
    case 'business_client':
      return 'business_client_id';
    case 'organization':
      // Organisation documents are addressed by organization_id alone.
      return null;
  }
}

interface DocumentRow {
  id: string;
  organization_id: string;
  partner_company_id?: string | null;
  reference_project_id?: string | null;
  business_client_id?: string | null;
  credential_type: CredentialType;
  title?: string | null;
  issuer?: string | null;
  document_number?: string | null;
  bucket_id?: string | null;
  storage_path: string;
  file_name: string;
  original_file_name?: string | null;
  mime_type: string | null;
  file_size: number | null;
  checksum: string | null;
  confidentiality: string;
  scan_status: DocumentScanStatus;
  lifecycle?: 'active' | 'archived' | null;
  valid_from: string | null;
  valid_until: string | null;
  review_status: CredentialReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
  uploaded_by: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  created_at: string;
  updated_at: string;
}

function toDocument(row: DocumentRow, ownerType: DocumentOwnerType): StoredDocument {
  const ownerId =
    ownerType === 'partner_company'
      ? (row.partner_company_id ?? '')
      : ownerType === 'reference_project'
        ? (row.reference_project_id ?? '')
        : ownerType === 'business_client'
          ? (row.business_client_id ?? '')
          : row.organization_id;

  return {
    id: row.id,
    organizationId: row.organization_id,
    ownerType,
    ownerId,
    credentialType: row.credential_type,
    title: row.title ?? null,
    issuer: row.issuer ?? null,
    documentNumber: row.document_number ?? null,
    bucketId: row.bucket_id ?? bucketForOwner(ownerType),
    storagePath: row.storage_path,
    fileName: row.file_name,
    originalFileName: row.original_file_name ?? null,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    checksum: row.checksum,
    confidentiality: (row.confidentiality as ConfidentialityLevel) ?? 'confidential',
    scanStatus: row.scan_status,
    lifecycle: row.lifecycle ?? 'active',
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    note: row.note,
    uploadedBy: row.uploaded_by,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Owner types in the order the "find it anywhere" lookups try them. */
const OWNER_TYPES: readonly DocumentOwnerType[] = [
  'reference_project',
  'business_client',
  'partner_company',
  'organization',
];

export class SupabaseDocumentStore implements DocumentStore {
  constructor(private readonly client: SupabaseClient) {}

  capabilities(): DocumentStoreCapabilities {
    return {
      storesFileContent: true,
      // No scanner is connected. Saying otherwise would be a claim somebody
      // might rely on when handing a document to a client.
      malwareScanning: false,
      note:
        'Dateien liegen in privaten Buckets. Downloads laufen ausschließlich über ' +
        'kurzlebige signierte Links. Es ist kein Malware-Scanner angebunden.',
    };
  }

  /** Confirms the owner record belongs to the organisation. */
  private async ownsRecord(
    organizationId: string,
    ownerType: DocumentOwnerType,
    ownerId: string,
  ): Promise<boolean> {
    if (ownerType === 'organization') return organizationId === ownerId;

    const table =
      ownerType === 'partner_company'
        ? 'partner_companies'
        : ownerType === 'reference_project'
          ? 'reference_projects'
          : 'business_clients';

    const { data } = await this.client
      .from(table)
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', ownerId)
      .maybeSingle();

    return asRow<{ id: string }>(data) !== null;
  }

  async create(input: CreateDocumentInput): Promise<StoredDocument | null> {
    if (!(await this.ownsRecord(input.organizationId, input.ownerType, input.ownerId))) {
      return null;
    }

    const bucket = bucketForOwner(input.ownerType);
    const storagePath = buildStoragePath({
      organizationId: input.organizationId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      fileName: input.file.fileName,
      uuid: crypto.randomUUID(),
    });

    const checksum = await sha256Hex(input.file.bytes);

    // Uploaded with the caller's session, so the storage policy applies. A
    // service-role upload would bypass exactly the check that matters.
    const upload = await this.client.storage
      .from(bucket)
      .upload(storagePath, input.file.bytes, {
        contentType: input.file.mimeType ?? 'application/octet-stream',
        upsert: false,
      });

    if (upload.error !== null) {
      throw new Error(`Die Datei konnte nicht abgelegt werden: ${upload.error.message}`);
    }

    const table = tableFor(input.ownerType);
    const column = ownerColumn(input.ownerType);

    const payload: Record<string, unknown> = {
      organization_id: input.organizationId,
      credential_type: input.credentialType,
      storage_path: storagePath,
      file_name: storagePath.split('/').pop(),
      original_file_name: input.file.fileName,
      mime_type: input.file.mimeType,
      file_size: input.file.size,
      checksum,
      confidentiality: input.confidentiality,
      valid_from: input.validFrom,
      valid_until: input.validUntil,
      note: input.note,
      uploaded_by: input.uploadedBy,
    };
    if (column !== null) payload[column] = input.ownerId;
    if (table !== 'partner_documents') {
      payload.bucket_id = bucket;
      payload.title = input.title;
      payload.issuer = input.issuer;
      payload.document_number = input.documentNumber;
    }

    const { data, error } = await this.client
      .from(table)
      .insert(payload)
      .select('*')
      .maybeSingle();

    if (error !== null) {
      // The row failed but the object is already there. Remove it, so a
      // failed upload does not leave an unreferenced file behind.
      await this.client.storage.from(bucket).remove([storagePath]);
      throw new Error(`Das Dokument konnte nicht gespeichert werden: ${error.message}`);
    }

    const row = asRow<DocumentRow>(data);
    return row === null ? null : toDocument(row, input.ownerType);
  }

  async list(
    organizationId: string,
    owner: { ownerType: DocumentOwnerType; ownerId: string },
    options: { includeArchived?: boolean } = {},
  ): Promise<StoredDocument[]> {
    const table = tableFor(owner.ownerType);
    const column = ownerColumn(owner.ownerType);

    let request = this.client
      .from(table)
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (column !== null) request = request.eq(column, owner.ownerId);
    if (options.includeArchived !== true) request = request.neq('lifecycle', 'archived');

    const { data, error } = await request;
    if (error !== null) {
      throw new Error(`Die Dokumente konnten nicht geladen werden: ${error.message}`);
    }

    return asRows<DocumentRow>(data).map((row) => toDocument(row, owner.ownerType));
  }

  async findById(organizationId: string, id: string): Promise<StoredDocument | null> {
    // The id alone does not say which table it is in, so all three are tried.
    // A miss everywhere is "not found" — the same answer a foreign id gets.
    for (const ownerType of ['reference_project', 'partner_company', 'organization'] as const) {
      const { data } = await this.client
        .from(tableFor(ownerType))
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', id)
        .maybeSingle();

      const row = asRow<DocumentRow>(data);
      if (row === null) continue;

      const resolved: DocumentOwnerType =
        ownerType === 'reference_project' && row.business_client_id != null
          ? 'business_client'
          : ownerType;
      return toDocument(row, resolved);
    }

    return null;
  }

  async update(
    organizationId: string,
    id: string,
    patch: UpdateDocumentInput,
  ): Promise<StoredDocument | null> {
    const current = await this.findById(organizationId, id);
    if (current === null) return null;

    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload.title = patch.title;
    if (patch.issuer !== undefined) payload.issuer = patch.issuer;
    if (patch.documentNumber !== undefined) payload.document_number = patch.documentNumber;
    if (patch.credentialType !== undefined) payload.credential_type = patch.credentialType;
    if (patch.confidentiality !== undefined) payload.confidentiality = patch.confidentiality;
    if (patch.validFrom !== undefined) payload.valid_from = patch.validFrom;
    if (patch.validUntil !== undefined) payload.valid_until = patch.validUntil;
    if (patch.note !== undefined) payload.note = patch.note;
    if (patch.reviewStatus !== undefined) {
      payload.review_status = patch.reviewStatus;
      payload.reviewed_by = patch.reviewStatus === 'pending' ? null : (patch.reviewedBy ?? null);
      payload.reviewed_at = patch.reviewStatus === 'pending' ? null : new Date().toISOString();
    }

    // partner_documents has no title/issuer/document_number columns.
    if (tableFor(current.ownerType) === 'partner_documents') {
      delete payload.title;
      delete payload.issuer;
      delete payload.document_number;
    }

    const { data, error } = await this.client
      .from(tableFor(current.ownerType))
      .update(payload)
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Das Dokument konnte nicht gespeichert werden: ${error.message}`);
    }

    const row = asRow<DocumentRow>(data);
    return row === null ? null : toDocument(row, current.ownerType);
  }

  async archive(
    organizationId: string,
    id: string,
    archivedBy: string | null,
  ): Promise<StoredDocument | null> {
    const current = await this.findById(organizationId, id);
    if (current === null) return null;

    const { data, error } = await this.client
      .from(tableFor(current.ownerType))
      .update({
        lifecycle: 'archived',
        archived_at: new Date().toISOString(),
        archived_by: archivedBy,
      })
      .eq('organization_id', organizationId)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Das Dokument konnte nicht archiviert werden: ${error.message}`);
    }

    const row = asRow<DocumentRow>(data);
    return row === null ? null : toDocument(row, current.ownerType);
  }

  async remove(organizationId: string, id: string): Promise<StoredDocument | null> {
    const current = await this.findById(organizationId, id);
    if (current === null) return null;

    // The object goes first: a row without a file is a recoverable
    // inconsistency, a file without a row is an orphan nobody will find.
    const removal = await this.client.storage
      .from(current.bucketId)
      .remove([current.storagePath]);

    if (removal.error !== null) {
      throw new Error(`Die Datei konnte nicht gelöscht werden: ${removal.error.message}`);
    }

    const { error } = await this.client
      .from(tableFor(current.ownerType))
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', id);

    if (error !== null) {
      throw new Error(`Der Dokumentsatz konnte nicht gelöscht werden: ${error.message}`);
    }

    return current;
  }

  async createSignedDownload(
    organizationId: string,
    id: string,
    ttlSeconds: number,
  ): Promise<SignedDownload | null> {
    const document = await this.findById(organizationId, id);
    if (document === null) return null;

    // Checked again even though the row said so: one layer is one bug away
    // from a cross-tenant download.
    if (!pathBelongsToOrganization(document.storagePath, organizationId)) return null;

    const { data, error } = await this.client.storage
      .from(document.bucketId)
      .createSignedUrl(document.storagePath, ttlSeconds, {
        download: document.originalFileName ?? document.fileName,
      });

    if (error !== null) {
      throw new Error(`Der Download-Link konnte nicht erzeugt werden: ${error.message}`);
    }
    if (data === null) return null;

    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      fileName: document.originalFileName ?? document.fileName,
    };
  }

  async listExpiring(
    organizationId: string,
    withinDays: number,
  ): Promise<StoredDocument[]> {
    const limit = new Date();
    limit.setUTCDate(limit.getUTCDate() + withinDays);
    const cutoff = limit.toISOString().slice(0, 10);

    const results: StoredDocument[] = [];

    for (const ownerType of OWNER_TYPES) {
      if (ownerType === 'business_client') continue; // same table as projects

      const { data, error } = await this.client
        .from(tableFor(ownerType))
        .select('*')
        .eq('organization_id', organizationId)
        .not('valid_until', 'is', null)
        .lte('valid_until', cutoff);

      if (error !== null) continue;
      results.push(...asRows<DocumentRow>(data).map((row) => toDocument(row, ownerType)));
    }

    const now = new Date();
    return results
      .filter((document) => document.validUntil !== null)
      .filter((document) => daysUntil(document.validUntil as string, now) <= withinDays)
      .sort((a, b) => (a.validUntil ?? '').localeCompare(b.validUntil ?? ''));
  }

  async recordAuditEntry(input: AuditEntryInput): Promise<void> {
    const { error } = await this.client.from('audit_log').insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      metadata: input.metadata,
    });

    if (error !== null) {
      throw new Error(`Der Audit-Eintrag konnte nicht geschrieben werden: ${error.message}`);
    }
  }
}

/** SHA-256 of the uploaded bytes, stored so a file can be identified later. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
