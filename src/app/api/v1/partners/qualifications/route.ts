import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { PARTNER_AUDIT_ACTIONS } from '@/modules/partners/validation';
import { qualificationSchema } from '../schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/partners/qualifications
 *
 * Records a credential. The expiry date is taken as given or left empty —
 * it is never derived from the issue date, because a guessed expiry is worse
 * than a missing one: it can make an expired credential look valid.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:write');

    const body: unknown = await request.json();
    const parsed = qualificationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder ungültig.');
    }

    const input = parsed.data;
    const store = await getPartnerStore();

    const saved = await store.saveQualification({
      organizationId: session.organization.id,
      partnerCompanyId: input.partnerCompanyId,
      ...(input.id === undefined ? {} : { id: input.id }),
      credentialType: input.credentialType,
      title: input.title ?? null,
      issuer: input.issuer ?? null,
      documentNumber: input.documentNumber ?? null,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      reviewStatus: input.reviewStatus,
      // Who accepted it is taken from the session, never from the request.
      reviewedBy: input.reviewStatus === 'pending' ? null : session.profile.id,
      note: input.note ?? null,
    });

    if (saved === null) throw new NotFoundError('Partner', input.partnerCompanyId);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: PARTNER_AUDIT_ACTIONS.documentReviewed,
      resourceType: 'partner_companies',
      resourceId: input.partnerCompanyId,
      metadata: {
        credentialType: saved.credentialType,
        reviewStatus: saved.reviewStatus,
        hasExpiryDate: saved.validUntil !== null,
      },
    });

    return apiSuccess({ saved: true, record: saved }, 201);
  } catch (error) {
    return handleApiError(error, 'api:partners:qualifications');
  }
}
