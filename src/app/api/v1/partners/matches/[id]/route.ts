import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { PARTNER_AUDIT_ACTIONS } from '@/modules/partners/validation';
import { matchStatusSchema } from '../../schemas';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/v1/partners/matches/:id
 *
 * Records what a person decided about a proposed match — shortlisted,
 * rejected, selected. The score itself is never edited: it is a computed
 * figure, and letting it be overwritten by hand would make it meaningless.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission('subcontractors:write');
    const { id } = await params;

    const body: unknown = await request.json();
    const parsed = matchStatusSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Der Status ist ungültig.');

    const store = await getPartnerStore();
    const updated = await store.updateMatchStatus(
      session.organization.id,
      id,
      parsed.data.status,
      session.profile.id,
    );

    if (updated === null) throw new NotFoundError('Match', id);

    // A blocked partner is excluded from scoring; putting one on a shortlist
    // by hand would defeat the exclusion.
    if (updated.companyIsBlocked && parsed.data.status === 'shortlisted') {
      throw new ValidationError(
        'Ein gesperrter Partner kann nicht auf die Shortlist gesetzt werden.',
      );
    }

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: PARTNER_AUDIT_ACTIONS.matchReviewed,
      resourceType: 'subcontractor_matches',
      resourceId: id,
      metadata: {
        newStatus: updated.status,
        totalScore: updated.totalScore,
        scoreVersion: updated.scoreVersion,
      },
    });

    return apiSuccess({ saved: true, record: updated });
  } catch (error) {
    return handleApiError(error, 'api:partners:matches');
  }
}
