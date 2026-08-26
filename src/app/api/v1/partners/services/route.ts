import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { PARTNER_AUDIT_ACTIONS } from '@/modules/partners/validation';
import { serviceSchema } from '../schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/partners/services
 *
 * Records what a partner can deliver.
 *
 * Confirming a service is a statement of evidence, so it is audited with the
 * state it moved to — only `confirmed` counts towards a match.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:write');

    const body: unknown = await request.json();
    const parsed = serviceSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder ungültig.');
    }

    const input = parsed.data;

    // A service cannot be "confirmed" while its category is undetermined:
    // that would assert a finding nobody made.
    if (input.serviceCategory === 'unknown' && input.confirmation === 'confirmed') {
      throw new ValidationError(
        'Eine unbestimmte Leistungsart kann nicht bestätigt werden.',
      );
    }

    const store = await getPartnerStore();
    const saved = await store.saveService({
      organizationId: session.organization.id,
      partnerCompanyId: input.partnerCompanyId,
      serviceCategory: input.serviceCategory,
      serviceLabel: input.serviceLabel ?? null,
      confirmation: input.confirmation,
      confirmationSource: input.confirmationSource,
      capacityNote: input.capacityNote ?? null,
      availableStaff: input.availableStaff ?? null,
      deliveryMode: input.deliveryMode,
      note: input.note ?? null,
    });

    if (saved === null) throw new NotFoundError('Partner', input.partnerCompanyId);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: PARTNER_AUDIT_ACTIONS.serviceConfirmed,
      resourceType: 'partner_companies',
      resourceId: input.partnerCompanyId,
      metadata: {
        serviceCategory: saved.serviceCategory,
        confirmation: saved.confirmation,
        confirmationSource: saved.confirmationSource,
      },
    });

    return apiSuccess({ saved: true, record: saved }, 201);
  } catch (error) {
    return handleApiError(error, 'api:partners:services');
  }
}
