import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { hasPermission, requireSession } from '@/lib/auth/session';
import { getDocumentStore } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { permissionsFor } from '@/modules/documents/permissions';
import { CONFIDENTIALITY_LEVELS } from '@/types/reference';
import { CREDENTIAL_REVIEW_STATUSES, CREDENTIAL_TYPES } from '@/types/partner';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  action: z.enum(['update', 'archive']).default('update'),
  credentialType: z.enum(CREDENTIAL_TYPES).optional(),
  title: z.string().max(300).nullable().optional(),
  issuer: z.string().max(300).nullable().optional(),
  documentNumber: z.string().max(120).nullable().optional(),
  confidentiality: z.enum(CONFIDENTIALITY_LEVELS).optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  reviewStatus: z.enum(CREDENTIAL_REVIEW_STATUSES).optional(),
});

/**
 * PATCH /api/v1/documents/:id
 *
 * Edits metadata or archives the document. Archiving is the normal way to
 * retire one: the record of what was filed and when has to survive the
 * decision to stop using it.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const body: unknown = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Die Anfrage ist ungültig.');

    const store = await getDocumentStore();
    const current = await store.findById(session.organization.id, id);
    // A foreign id and a missing one give the same answer.
    if (current === null) throw new NotFoundError('Dokument', id);

    const required = permissionsFor(current.ownerType).write;
    if (!hasPermission(session, required)) {
      throw new ForbiddenError(
        `Die Rolle "${session.role}" besitzt die Berechtigung "${required}" nicht.`,
      );
    }

    const updated =
      parsed.data.action === 'archive'
        ? await store.archive(session.organization.id, id, session.profile.id)
        : await store.update(session.organization.id, id, {
            ...(parsed.data.credentialType === undefined
              ? {}
              : { credentialType: parsed.data.credentialType }),
            ...(parsed.data.title === undefined ? {} : { title: parsed.data.title }),
            ...(parsed.data.issuer === undefined ? {} : { issuer: parsed.data.issuer }),
            ...(parsed.data.documentNumber === undefined
              ? {}
              : { documentNumber: parsed.data.documentNumber }),
            ...(parsed.data.confidentiality === undefined
              ? {}
              : { confidentiality: parsed.data.confidentiality }),
            ...(parsed.data.validFrom === undefined
              ? {}
              : { validFrom: parsed.data.validFrom }),
            ...(parsed.data.validUntil === undefined
              ? {}
              : { validUntil: parsed.data.validUntil }),
            ...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
            ...(parsed.data.reviewStatus === undefined
              ? {}
              : { reviewStatus: parsed.data.reviewStatus, reviewedBy: session.profile.id }),
          });

    if (updated === null) throw new NotFoundError('Dokument', id);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: parsed.data.action === 'archive' ? 'document_archived' : 'document_updated',
      resourceType: 'documents',
      resourceId: id,
      metadata: {
        ownerType: updated.ownerType,
        lifecycle: updated.lifecycle,
        reviewStatus: updated.reviewStatus,
      },
    });

    return apiSuccess({ saved: true, document: updated });
  } catch (error) {
    return handleApiError(error, 'api:documents');
  }
}

/**
 * DELETE /api/v1/documents/:id
 *
 * Removes the file and its row. Guarded by a narrower permission than
 * archiving, because it destroys the evidence rather than retiring it.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const store = await getDocumentStore();
    const current = await store.findById(session.organization.id, id);
    if (current === null) throw new NotFoundError('Dokument', id);

    const required = permissionsFor(current.ownerType).destroy;
    if (!hasPermission(session, required)) {
      throw new ForbiddenError(
        `Das endgültige Löschen erfordert die Berechtigung "${required}". ` +
          'Zum Zurückziehen eines Dokuments bitte archivieren.',
      );
    }

    const removed = await store.remove(session.organization.id, id);
    if (removed === null) throw new NotFoundError('Dokument', id);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: 'document_deleted',
      resourceType: 'documents',
      resourceId: id,
      // What was deleted, never what it contained.
      metadata: {
        ownerType: removed.ownerType,
        credentialType: removed.credentialType,
        hadChecksum: removed.checksum !== null,
      },
    });

    return apiSuccess({ deleted: true, id });
  } catch (error) {
    return handleApiError(error, 'api:documents');
  }
}
