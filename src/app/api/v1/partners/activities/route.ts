import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { activitySchema } from '../schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/partners/activities
 *
 * Records a call, a meeting, a follow-up. The note text stays on the record;
 * the audit log gets only the type and whether a follow-up was set.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:write');

    const body: unknown = await request.json();
    const parsed = activitySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder ungültig.');
    }

    const input = parsed.data;
    const store = await getPartnerStore();

    const saved = await store.saveActivity({
      organizationId: session.organization.id,
      partnerCompanyId: input.partnerCompanyId,
      partnerContactId: input.partnerContactId ?? null,
      activityType: input.activityType,
      occurredAt: input.occurredAt,
      summary: input.summary ?? null,
      outcome: input.outcome ?? null,
      nextAction: input.nextAction ?? null,
      followUpAt: input.followUpAt ?? null,
      createdBy: session.profile.id,
    });

    if (saved === null) throw new NotFoundError('Partner', input.partnerCompanyId);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: 'partner_activity_recorded',
      resourceType: 'partner_companies',
      resourceId: input.partnerCompanyId,
      metadata: {
        activityType: saved.activityType,
        hasFollowUp: saved.followUpAt !== null,
      },
    });

    return apiSuccess({ saved: true, record: saved }, 201);
  } catch (error) {
    return handleApiError(error, 'api:partners:activities');
  }
}
