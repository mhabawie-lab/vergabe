import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { PARTNER_AUDIT_ACTIONS } from '@/modules/partners/validation';
import { availabilitySchema } from '../schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/partners/availability
 *
 * `confirmNow` stamps the moment the figure was confirmed with the partner.
 * It is a deliberate act, not a side effect of saving: an entry saved without
 * it keeps its old confirmation date and ages towards "no longer current".
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:write');

    const body: unknown = await request.json();
    const parsed = availabilitySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder ungültig.');
    }

    const input = parsed.data;
    const store = await getPartnerStore();

    const saved = await store.saveAvailability({
      organizationId: session.organization.id,
      partnerCompanyId: input.partnerCompanyId,
      ...(input.id === undefined ? {} : { id: input.id }),
      serviceCategory: input.serviceCategory ?? null,
      availableFrom: input.availableFrom ?? null,
      availableUntil: input.availableUntil ?? null,
      status: input.status,
      availableStaff: input.availableStaff ?? null,
      shiftModel: input.shiftModel,
      nightShift: input.nightShift,
      weekend: input.weekend,
      aroundTheClock: input.aroundTheClock,
      shortNotice: input.shortNotice,
      note: input.note ?? null,
      confirmNow: input.confirmNow,
    });

    if (saved === null) throw new NotFoundError('Partner', input.partnerCompanyId);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: PARTNER_AUDIT_ACTIONS.availabilityChanged,
      resourceType: 'partner_companies',
      resourceId: input.partnerCompanyId,
      metadata: { status: saved.status, confirmed: input.confirmNow },
    });

    return apiSuccess({ saved: true, record: saved }, 201);
  } catch (error) {
    return handleApiError(error, 'api:partners:availability');
  }
}
