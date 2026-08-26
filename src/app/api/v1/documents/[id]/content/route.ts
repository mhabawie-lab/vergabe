import type { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/api/response';
import { hasPermission, requireSession } from '@/lib/auth/session';
import { getDocumentStore, isUsingDemoStore } from '@/lib/db';
import { getMemoryDocumentStore } from '@/lib/db/memory';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { permissionsFor } from '@/modules/documents/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/documents/:id/content
 *
 * Serves the bytes **in local development only**.
 *
 * With Supabase configured there is no such route: the file comes from the
 * private bucket through a signed URL, and a second path to the same bytes
 * would be a second thing to secure. This exists so the local mode can show
 * a working download without pretending it is a storage service.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    if (!isUsingDemoStore()) {
      // Against Supabase, the signed URL is the only way in.
      throw new NotFoundError('Dokument', id);
    }

    const store = await getDocumentStore();
    const document = await store.findById(session.organization.id, id);
    if (document === null) throw new NotFoundError('Dokument', id);

    const required = permissionsFor(document.ownerType).read;
    if (!hasPermission(session, required)) {
      throw new ForbiddenError(
        `Die Rolle "${session.role}" besitzt die Berechtigung "${required}" nicht.`,
      );
    }

    const bytes = getMemoryDocumentStore().readObject(document.storagePath);
    if (bytes === null) throw new NotFoundError('Dokument', id);

    return new Response(bytes as BodyInit, {
      headers: {
        'Content-Type': document.mimeType ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${document.fileName}"`,
        // Never cached: the permission is checked per request.
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error, 'api:documents:content');
  }
}
