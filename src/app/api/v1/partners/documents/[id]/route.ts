import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { PARTNER_AUDIT_ACTIONS } from '@/modules/partners/validation';
import { documentReviewSchema } from '../../schemas';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/v1/partners/documents/:id
 *
 * Records the outcome of checking a document. Only an accepted, unexpired
 * credential counts as proof anywhere else in the application.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission('subcontractors:documents');
    const { id } = await params;

    const body: unknown = await request.json();
    const parsed = documentReviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind ungültig.');
    }

    const store = await getPartnerStore();
    const updated = await store.reviewDocument(session.organization.id, id, {
      reviewStatus: parsed.data.reviewStatus,
      reviewedBy: session.profile.id,
      note: parsed.data.note ?? null,
    });

    if (updated === null) throw new NotFoundError('Dokument', id);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: PARTNER_AUDIT_ACTIONS.documentReviewed,
      resourceType: 'partner_documents',
      resourceId: id,
      metadata: { reviewStatus: updated.reviewStatus },
    });

    return apiSuccess({ saved: true, record: updated });
  } catch (error) {
    return handleApiError(error, 'api:partners:documents');
  }
}
