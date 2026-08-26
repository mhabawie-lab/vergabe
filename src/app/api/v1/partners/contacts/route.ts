import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { PARTNER_AUDIT_ACTIONS } from '@/modules/partners/validation';
import { contactSchema } from '../schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/partners/contacts
 *
 * Saves a contact person. The company is resolved within the caller's
 * organisation, so a foreign id reads as "not found".
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:write');

    const body: unknown = await request.json();
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder ungültig.');
    }

    const input = parsed.data;
    const store = await getPartnerStore();

    const saved = await store.saveContact({
      organizationId: session.organization.id,
      partnerCompanyId: input.partnerCompanyId,
      ...(input.id === undefined ? {} : { id: input.id }),
      firstName: input.firstName ?? null,
      lastName: input.lastName,
      role: input.role ?? null,
      businessEmail: input.businessEmail ?? null,
      businessPhone: input.businessPhone ?? null,
      preferredChannel: input.preferredChannel,
      sourceType: input.sourceType ?? null,
      internalNote: input.internalNote ?? null,
      isActive: input.isActive,
    });

    if (saved === null) throw new NotFoundError('Partner', input.partnerCompanyId);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: PARTNER_AUDIT_ACTIONS.contactSaved,
      resourceType: 'partner_companies',
      resourceId: input.partnerCompanyId,
      // Metadata only — never the contact's details.
      metadata: { created: input.id === undefined, isActive: input.isActive },
    });

    return apiSuccess({ saved: true, record: saved }, 201);
  } catch (error) {
    return handleApiError(error, 'api:partners:contacts');
  }
}
