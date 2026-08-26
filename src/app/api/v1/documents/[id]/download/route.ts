import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { hasPermission, requireSession } from '@/lib/auth/session';
import { getDocumentStore } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { permissionsFor } from '@/modules/documents/permissions';
import { logger } from '@/lib/logging';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/documents/:id/download
 *
 * Hands out a short-lived signed link.
 *
 * A POST rather than a GET on purpose: this has a side effect worth auditing,
 * and a link that appears in browser history or a referrer header is a link
 * that outlives the click. The URL is never stored — it is a bearer token
 * with a filename attached.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const store = await getDocumentStore();
    const document = await store.findById(session.organization.id, id);
    if (document === null) throw new NotFoundError('Dokument', id);

    const required = permissionsFor(document.ownerType).read;
    if (!hasPermission(session, required)) {
      throw new ForbiddenError(
        `Die Rolle "${session.role}" besitzt die Berechtigung "${required}" nicht.`,
      );
    }

    const download = await store.createSignedDownload(
      session.organization.id,
      id,
      serverEnv.signedUrlTtlSeconds,
    );
    if (download === null) throw new NotFoundError('Dokument', id);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: 'document_downloaded',
      resourceType: 'documents',
      resourceId: id,
      // The link itself is deliberately absent from the log.
      metadata: {
        ownerType: document.ownerType,
        ttlSeconds: serverEnv.signedUrlTtlSeconds,
      },
    });

    logger.info('Signierter Download erzeugt', {
      scope: 'api:documents',
      organizationId: session.organization.id,
      documentId: id,
      ttlSeconds: serverEnv.signedUrlTtlSeconds,
    });

    return apiSuccess({ download });
  } catch (error) {
    return handleApiError(error, 'api:documents');
  }
}
