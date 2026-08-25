import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { PARTNER_AUDIT_ACTIONS } from '@/modules/partners/validation';
import { needSchema } from '../schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/partners/needs
 *
 * Records our own demand for a subcontractor. These records are never public
 * and are not offered to anyone — they exist so the match engine has
 * something to score against.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:write');

    const body: unknown = await request.json();
    const parsed = needSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder ungültig.');
    }

    const input = parsed.data;
    const store = await getPartnerStore();

    const saved = await store.saveNeed({
      organizationId: session.organization.id,
      ...(input.id === undefined ? {} : { id: input.id }),
      title: input.title,
      referenceProjectId: input.referenceProjectId ?? null,
      tenderId: input.tenderId ?? null,
      projectType: input.projectType ?? null,
      serviceCategory: input.serviceCategory,
      country: input.country ?? null,
      region: input.region ?? null,
      city: input.city ?? null,
      siteAddress: input.siteAddress ?? null,
      radiusKm: input.radiusKm ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      requiredStaff: input.requiredStaff ?? null,
      shiftModel: input.shiftModel,
      aroundTheClock: input.aroundTheClock,
      nightWork: input.nightWork,
      weekendWork: input.weekendWork,
      requiredQualifications: input.requiredQualifications,
      requiredCredentials: input.requiredCredentials,
      furtherSubcontractingAllowed: input.furtherSubcontractingAllowed,
      targetBudget: input.targetBudget ?? null,
      currency: input.currency,
      confidentiality: input.confidentiality,
      status: input.status,
      internalNote: input.internalNote ?? null,
      createdBy: session.profile.id,
    });

    if (saved === null) throw new ValidationError('Der Bedarf konnte nicht gespeichert werden.');

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action:
        input.id === undefined
          ? PARTNER_AUDIT_ACTIONS.needCreated
          : PARTNER_AUDIT_ACTIONS.needUpdated,
      resourceType: 'subcontractor_needs',
      resourceId: saved.id,
      // Never the budget or the internal note.
      metadata: {
        serviceCategory: saved.serviceCategory,
        status: saved.status,
        hasBudget: saved.targetBudget !== null,
      },
    });

    return apiSuccess({ saved: true, id: saved.id, record: saved }, 201);
  } catch (error) {
    return handleApiError(error, 'api:partners:needs');
  }
}
