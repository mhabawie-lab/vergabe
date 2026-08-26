/**
 * Where private documents live and what is allowed into them.
 *
 * Three rules shape everything in this file:
 *
 *   * **The buckets are private.** These files are third-party certificates,
 *     insurance policies and customer paperwork. A public URL for one of them
 *     is a breach that search engines will index, so there is no public
 *     bucket and no public object URL anywhere in the application.
 *   * **The organisation is the first path segment.** That makes the storage
 *     policies expressible in SQL (`storage_path_organization`) and means a
 *     mistake in the application cannot put a file where another tenant can
 *     read it.
 *   * **The name the user gave is kept apart from the object key.** The key
 *     is sanitised and prefixed with a UUID; the original name is a column.
 *     Sanitising in place would quietly rename people's documents.
 */

export const DOCUMENT_BUCKETS = {
  reference: 'reference-documents',
  partner: 'partner-documents',
  organization: 'organization-documents',
} as const;

export type DocumentBucket = (typeof DOCUMENT_BUCKETS)[keyof typeof DOCUMENT_BUCKETS];

/** Which record a document hangs off. Mirrors `document_owner_type` in SQL. */
export const DOCUMENT_OWNER_TYPES = [
  'reference_project',
  'business_client',
  'partner_company',
  'organization',
] as const;

export type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number];

export const DOCUMENT_OWNER_LABELS: Record<DocumentOwnerType, string> = {
  reference_project: 'Referenzprojekt',
  business_client: 'Kunde',
  partner_company: 'Partnerfirma',
  organization: 'Organisation',
};

export function bucketForOwner(owner: DocumentOwnerType): DocumentBucket {
  switch (owner) {
    case 'partner_company':
      return DOCUMENT_BUCKETS.partner;
    case 'organization':
      return DOCUMENT_BUCKETS.organization;
    default:
      return DOCUMENT_BUCKETS.reference;
  }
}

/**
 * 25 MB.
 *
 * Comfortably above a scanned multi-page certificate and well below anything
 * that would be a video or a disk image. The bucket enforces the same figure,
 * so a client that skips the check still fails.
 */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/**
 * What may be uploaded.
 *
 * Deliberately short. Every entry is a document format; nothing here can be
 * executed, and archives are excluded because their contents cannot be judged
 * from the outside.
 */
export const ALLOWED_DOCUMENT_TYPES = [
  { mime: 'application/pdf', extensions: ['pdf'], label: 'PDF' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    label: 'Word (DOCX)',
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['xlsx'],
    label: 'Excel (XLSX)',
  },
  { mime: 'text/csv', extensions: ['csv'], label: 'CSV' },
  { mime: 'image/png', extensions: ['png'], label: 'PNG' },
  { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], label: 'JPEG' },
] as const;

export const ALLOWED_MIME_TYPES: readonly string[] = ALLOWED_DOCUMENT_TYPES.map(
  (entry) => entry.mime,
);

export function describeAllowedTypes(): string {
  return ALLOWED_DOCUMENT_TYPES.map((entry) => entry.label).join(', ');
}

/**
 * Strips anything that could escape the intended folder.
 *
 * Everything before the last slash or backslash goes, so `../../etc/passwd`
 * becomes `passwd`; then only a conservative character set survives. A name
 * that reduces to nothing gets a neutral fallback rather than an empty key.
 */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    // A leading dot would make a hidden file; a leading dash confuses CLIs.
    .replace(/^[.\-_]+/, '')
    .slice(0, 120);

  return cleaned.length > 0 ? cleaned : 'dokument';
}

export function fileExtension(fileName: string): string | null {
  const cleaned = sanitizeFileName(fileName);
  const dot = cleaned.lastIndexOf('.');
  if (dot <= 0 || dot === cleaned.length - 1) return null;
  return cleaned.slice(dot + 1).toLowerCase();
}

export interface UploadCandidate {
  fileName: string;
  mimeType: string | null;
  size: number;
}

export interface UploadValidation {
  valid: boolean;
  messages: string[];
}

/**
 * Checks a file before anything is written.
 *
 * The extension and the declared MIME type must agree. A browser can be told
 * to send any content type it likes, so treating the two as independent
 * facts — and requiring both to be allowed and consistent — is what keeps an
 * `.exe` renamed to `.pdf` out.
 */
export function validateUpload(candidate: UploadCandidate): UploadValidation {
  const messages: string[] = [];

  if (candidate.size <= 0) {
    messages.push('Die Datei ist leer.');
  }
  if (candidate.size > MAX_DOCUMENT_BYTES) {
    messages.push(
      `Die Datei ist größer als ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB.`,
    );
  }

  const extension = fileExtension(candidate.fileName);
  if (extension === null) {
    messages.push('Der Dateiname hat keine erkennbare Endung.');
  }

  const mime = candidate.mimeType?.split(';')[0]?.trim().toLowerCase() ?? '';
  const byMime = ALLOWED_DOCUMENT_TYPES.find((entry) => entry.mime === mime);
  const byExtension =
    extension === null
      ? undefined
      : ALLOWED_DOCUMENT_TYPES.find((entry) =>
          (entry.extensions as readonly string[]).includes(extension),
        );

  if (byMime === undefined) {
    messages.push(
      `Dieser Dateityp ist nicht zugelassen. Erlaubt sind: ${describeAllowedTypes()}.`,
    );
  }
  if (byExtension === undefined && extension !== null) {
    messages.push(
      `Die Dateiendung „.${extension}" ist nicht zugelassen. Erlaubt sind: ${describeAllowedTypes()}.`,
    );
  }
  if (byMime !== undefined && byExtension !== undefined && byMime.mime !== byExtension.mime) {
    messages.push(
      'Dateiendung und Dateityp passen nicht zusammen. Bitte die Originaldatei hochladen.',
    );
  }

  return { valid: messages.length === 0, messages };
}

export interface StoragePathInput {
  organizationId: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  fileName: string;
  /** Injected in tests so the key is deterministic. */
  uuid: string;
}

/**
 * Object key inside the private bucket.
 *
 *     <organization_id>/<owner_type>/<owner_id>/<uuid>-<sanitised name>
 *
 * The organisation comes first because the storage policies read it from
 * there. The UUID keeps two uploads of the same file name apart without
 * either overwriting the other.
 */
export function buildStoragePath(input: StoragePathInput): string {
  return [
    input.organizationId,
    input.ownerType,
    input.ownerId,
    `${input.uuid}-${sanitizeFileName(input.fileName)}`,
  ].join('/');
}

/** True for anything that would expose the file without a signed URL. */
export function isPublicUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Whether a key belongs to the given organisation.
 *
 * Checked again on every read and delete: the storage policy enforces it, and
 * so does the application, because a single layer is one bug away from a
 * cross-tenant download.
 */
export function pathBelongsToOrganization(
  storagePath: string,
  organizationId: string,
): boolean {
  return storagePath.split('/')[0] === organizationId;
}

/**
 * Scan status vocabulary.
 *
 * `not_scanned` is the honest default and stays the default until a scanner
 * is actually wired up. Displaying "geprüft" without a scanner would be a lie
 * somebody might act on.
 */
export const SCAN_STATUS_LABELS = {
  not_scanned: 'Malware-Scan nicht verfügbar',
  clean: 'Geprüft, unauffällig',
  infected: 'Als schädlich erkannt',
} as const;
