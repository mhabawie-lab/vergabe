import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { PARTNER_AUDIT_ACTIONS } from '@/modules/partners/validation';
import { regionSchema } from '../schemas';

export const dynamic = 'force-dynamic';

/** POST /api/v1/partners/regions — where a partner says it can work. */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:write');

    const body: unknown = await request.json();
    const parsed = regionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder ungültig.');
    }

    const input = parsed.data;
    const store = await getPartnerStore();

    const saved = await store.saveRegion({
      organizationId: session.organization.id,
      partnerCompanyId: input.partnerCompanyId,
      ...(input.id === undefined ? {} : { id: input.id }),
      country: input.country ?? null,
      region: input.region ?? null,
      city: input.city ?? null,
      radiusKm: input.radiusKm ?? null,
      nationwide: input.nationwide,
      willingToTravel: input.willingToTravel,
      isConfirmed: input.isConfirmed,
      note: input.note ?? null,
    });

    if (saved === null) throw new NotFoundError('Partner', input.partnerCompanyId);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: PARTNER_AUDIT_ACTIONS.updated,
      resourceType: 'partner_companies',
      resourceId: input.partnerCompanyId,
      metadata: { kind: 'service_region', isConfirmed: input.isConfirmed },
    });

    return apiSuccess({ saved: true, record: saved }, 201);
  } catch (error) {
    return handleApiError(error, 'api:partners:regions');
  }
}
