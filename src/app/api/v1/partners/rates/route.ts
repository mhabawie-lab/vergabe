import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { PARTNER_AUDIT_ACTIONS } from '@/modules/partners/validation';
import { rateSchema } from '../schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/partners/rates
 *
 * Negotiated conditions — the most confidential records in this area.
 * Guarded by its own permission, so a bid manager can maintain the partner
 * list without seeing what was agreed on price.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:financial');

    const body: unknown = await request.json();
    const parsed = rateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder ungültig.');
    }

    const input = parsed.data;
    const store = await getPartnerStore();

    const saved = await store.saveRate({
      organizationId: session.organization.id,
      partnerCompanyId: input.partnerCompanyId,
      ...(input.id === undefined ? {} : { id: input.id }),
      serviceCategory: input.serviceCategory ?? null,
      region: input.region ?? null,
      rateModel: input.rateModel,
      unit: input.unit ?? null,
      netAmount: input.netAmount ?? null,
      currency: input.currency,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      surcharges: input.surcharges ?? null,
      negotiationStatus: input.negotiationStatus,
      internalNote: input.internalNote ?? null,
      createdBy: session.profile.id,
    });

    if (saved === null) throw new NotFoundError('Partner', input.partnerCompanyId);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: PARTNER_AUDIT_ACTIONS.rateSaved,
      resourceType: 'partner_companies',
      resourceId: input.partnerCompanyId,
      // Deliberately without the amount: the audit log must not become a
      // second, less-guarded copy of the price list.
      metadata: {
        rateModel: saved.rateModel,
        negotiationStatus: saved.negotiationStatus,
        hasAmount: saved.netAmount !== null,
      },
    });

    return apiSuccess({ saved: true, record: saved }, 201);
  } catch (error) {
    return handleApiError(error, 'api:partners:rates');
  }
}
