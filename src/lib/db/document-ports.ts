/**
 * Storage port for private documents.
 *
 * Split from the reference and partner ports because a document is two things
 * at once: a row of metadata and an object in a bucket. Keeping both behind
 * one interface means the route handlers never touch a storage client
 * directly, and the "which organisation is this?" check happens in exactly
 * one place per operation.
 */

import type { AuditEntryInput } from './reference-ports';
import type { DocumentOwnerType } from '@/modules/documents/storage';
import type { ConfidentialityLevel } from '@/types/reference';
import type {
  CredentialReviewStatus,
  CredentialType,
  DocumentScanStatus,
} from '@/types/partner';

export type DocumentLifecycle = 'active' | 'archived';

export interface StoredDocument {
  id: string;
  organizationId: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  credentialType: CredentialType;
  title: string | null;
  issuer: string | null;
  documentNumber: string | null;
  bucketId: string;
  /** Object key inside the private bucket. Never a URL. */
  storagePath: string;
  fileName: string;
  /** The name as the user knew it, kept apart from the sanitised key. */
  originalFileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  checksum: string | null;
  confidentiality: ConfidentialityLevel;
  scanStatus: DocumentScanStatus;
  lifecycle: DocumentLifecycle;
  validFrom: string | null;
  validUntil: string | null;
  reviewStatus: CredentialReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  note: string | null;
  uploadedBy: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentInput {
  organizationId: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  credentialType: CredentialType;
  title: string | null;
  issuer: string | null;
  documentNumber: string | null;
  confidentiality: ConfidentialityLevel;
  validFrom: string | null;
  validUntil: string | null;
  note: string | null;
  uploadedBy: string | null;
  /** The file itself. The adapter decides where the bytes go. */
  file: {
    fileName: string;
    mimeType: string | null;
    size: number;
    bytes: Uint8Array;
  };
}

export interface UpdateDocumentInput {
  title?: string | null;
  issuer?: string | null;
  documentNumber?: string | null;
  credentialType?: CredentialType;
  confidentiality?: ConfidentialityLevel;
  validFrom?: string | null;
  validUntil?: string | null;
  note?: string | null;
  reviewStatus?: CredentialReviewStatus;
  reviewedBy?: string | null;
}

export interface SignedDownload {
  url: string;
  /** ISO timestamp at which the link stops working. */
  expiresAt: string;
  fileName: string;
}

export interface DocumentStoreCapabilities {
  /** False when file content is not actually persisted anywhere. */
  storesFileContent: boolean;
  /** False when no scanner is connected. Never claimed to be true. */
  malwareScanning: boolean;
  /** Human-readable explanation, shown in the UI. */
  note: string;
}

export interface DocumentStore {
  capabilities(): DocumentStoreCapabilities;

  /**
   * Stores the file and its metadata.
   *
   * Returns null when the owner record does not belong to the organisation —
   * the same answer a missing record gets, so a foreign id cannot be probed.
   */
  create(input: CreateDocumentInput): Promise<StoredDocument | null>;

  list(
    organizationId: string,
    owner: { ownerType: DocumentOwnerType; ownerId: string },
    options?: { includeArchived?: boolean },
  ): Promise<StoredDocument[]>;

  findById(organizationId: string, id: string): Promise<StoredDocument | null>;

  update(
    organizationId: string,
    id: string,
    patch: UpdateDocumentInput,
  ): Promise<StoredDocument | null>;

  /** Marks the document archived. The object stays; the record stays visible. */
  archive(
    organizationId: string,
    id: string,
    archivedBy: string | null,
  ): Promise<StoredDocument | null>;

  /** Removes the object and the row. Only for an explicit, permitted deletion. */
  remove(organizationId: string, id: string): Promise<StoredDocument | null>;

  /**
   * A short-lived link to the file.
   *
   * Never stored: a signed URL is a bearer token with a filename attached, and
   * a copy in the database outlives the reason it was created.
   */
  createSignedDownload(
    organizationId: string,
    id: string,
    ttlSeconds: number,
  ): Promise<SignedDownload | null>;

  /** Expiring credentials across all document kinds, for the monitor. */
  listExpiring(
    organizationId: string,
    withinDays: number,
  ): Promise<StoredDocument[]>;

  recordAuditEntry(input: AuditEntryInput): Promise<void>;
}
