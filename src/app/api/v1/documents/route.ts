import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { hasPermission, requireSession } from '@/lib/auth/session';
import { getDocumentStore } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import {
  DOCUMENT_OWNER_TYPES,
  MAX_DOCUMENT_BYTES,
  bucketForOwner,
  validateUpload,
} from '@/modules/documents/storage';
import { permissionsFor } from '@/modules/documents/permissions';
import { CONFIDENTIALITY_LEVELS } from '@/types/reference';
import { CREDENTIAL_TYPES } from '@/types/partner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const metadataSchema = z.object({
  ownerType: z.enum(DOCUMENT_OWNER_TYPES),
  ownerId: z.string().uuid(),
  credentialType: z.enum(CREDENTIAL_TYPES),
  title: z.string().max(300).nullable().optional(),
  issuer: z.string().max(300).nullable().optional(),
  documentNumber: z.string().max(120).nullable().optional(),
  confidentiality: z.enum(CONFIDENTIALITY_LEVELS),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

/**
 * GET /api/v1/documents?ownerType=…&ownerId=…
 *
 * Lists the documents of one record. Metadata only — the file itself needs a
 * separate, permission-checked request.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const params = request.nextUrl.searchParams;

    const owner = z
      .object({
        ownerType: z.enum(DOCUMENT_OWNER_TYPES),
        ownerId: z.string().uuid(),
        includeArchived: z.enum(['true', 'false']).optional(),
      })
      .safeParse({
        ownerType: params.get('ownerType'),
        ownerId: params.get('ownerId'),
        includeArchived: params.get('includeArchived') ?? undefined,
      });

    if (!owner.success) throw new ValidationError('Die Anfrage ist unvollständig.');

    const required = permissionsFor(owner.data.ownerType).read;
    if (!hasPermission(session, required)) {
      throw new ForbiddenError(
        `Die Rolle "${session.role}" besitzt die Berechtigung "${required}" nicht.`,
      );
    }

    const store = await getDocumentStore();
    const documents = await store.list(
      session.organization.id,
      { ownerType: owner.data.ownerType, ownerId: owner.data.ownerId },
      { includeArchived: owner.data.includeArchived === 'true' },
    );

    return apiSuccess({
      documents,
      capabilities: store.capabilities(),
    });
  } catch (error) {
    return handleApiError(error, 'api:documents');
  }
}

/**
 * POST /api/v1/documents
 *
 * Uploads one document. Multipart: the file plus a `metadata` JSON field.
 *
 * The organisation is taken from the session, never from the request — a
 * form field naming an organisation would be an invitation to write into
 * somebody else's bucket. The owner record is resolved inside that
 * organisation, so a foreign id reads as "not found".
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();

    // The runtime refuses to parse a body beyond its own limit, and that
    // refusal reads as an internal error. Checking the declared length first
    // turns "500" into "your file is too large", which is what it is.
    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DOCUMENT_BYTES) {
      throw new ValidationError(
        `Die Datei ist zu groß. Erlaubt sind höchstens ${Math.round(
          MAX_DOCUMENT_BYTES / (1024 * 1024),
        )} MB.`,
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      // Almost always the size limit; there is no other realistic cause for a
      // browser-generated multipart body to be unparseable.
      throw new ValidationError(
        'Die Übertragung konnte nicht gelesen werden. Häufigste Ursache: die ' +
          `Datei überschreitet die zulässigen ${Math.round(
            MAX_DOCUMENT_BYTES / (1024 * 1024),
          )} MB.`,
      );
    }

    const file = formData.get('file');
    const rawMetadata = formData.get('metadata');

    if (!(file instanceof File)) {
      throw new ValidationError('Es wurde keine Datei übermittelt.');
    }
    if (typeof rawMetadata !== 'string') {
      throw new ValidationError('Die Angaben zum Dokument fehlen.');
    }

    let parsedMetadata: unknown;
    try {
      parsedMetadata = JSON.parse(rawMetadata);
    } catch {
      throw new ValidationError('Die Angaben zum Dokument sind nicht lesbar.');
    }

    const metadata = metadataSchema.safeParse(parsedMetadata);
    if (!metadata.success) {
      throw new ValidationError('Die Angaben zum Dokument sind unvollständig oder ungültig.');
    }

    const required = permissionsFor(metadata.data.ownerType).write;
    if (!hasPermission(session, required)) {
      throw new ForbiddenError(
        `Die Rolle "${session.role}" besitzt die Berechtigung "${required}" nicht.`,
      );
    }

    // Size and type are checked before a single byte is read into memory
    // beyond what the runtime already buffered.
    const check = validateUpload({
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    });
    if (!check.valid) {
      return apiSuccess({ saved: false, messages: check.messages }, 200);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
      throw new ValidationError('Die Datei ist zu groß.');
    }

    const store = await getDocumentStore();
    const document = await store.create({
      organizationId: session.organization.id,
      ownerType: metadata.data.ownerType,
      ownerId: metadata.data.ownerId,
      credentialType: metadata.data.credentialType,
      title: metadata.data.title ?? null,
      issuer: metadata.data.issuer ?? null,
      documentNumber: metadata.data.documentNumber ?? null,
      confidentiality: metadata.data.confidentiality,
      validFrom: metadata.data.validFrom ?? null,
      validUntil: metadata.data.validUntil ?? null,
      note: metadata.data.note ?? null,
      uploadedBy: session.profile.id,
      file: {
        fileName: file.name,
        mimeType: file.type.length > 0 ? file.type : null,
        size: file.size,
        bytes,
      },
    });

    if (document === null) {
      throw new NotFoundError('Datensatz', metadata.data.ownerId);
    }

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: 'document_uploaded',
      resourceType: 'documents',
      resourceId: document.id,
      // Metadata only: never the file name, never the contents.
      metadata: {
        ownerType: document.ownerType,
        credentialType: document.credentialType,
        bucket: bucketForOwner(document.ownerType),
        fileSize: document.fileSize,
        hasExpiryDate: document.validUntil !== null,
      },
    });

    logger.info('Dokument hochgeladen', {
      scope: 'api:documents',
      organizationId: session.organization.id,
      documentId: document.id,
      ownerType: document.ownerType,
    });

    return apiSuccess(
      { saved: true, document, capabilities: store.capabilities() },
      201,
    );
  } catch (error) {
    return handleApiError(error, 'api:documents');
  }
}
