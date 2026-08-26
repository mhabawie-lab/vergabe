import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import {
  PARTNER_AUDIT_ACTIONS,
  validatePartnerInput,
  type PartnerFormInput,
} from '@/modules/partners/validation';
import { companySchema } from '../schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/partners/companies
 *
 * Creates a partner company.
 *
 * A provable duplicate — same registry number, VAT id or comparison name — is
 * refused outright. A *possible* one (similar name, same domain, same phone)
 * is a warning that must be acknowledged: the first request comes back with
 * it and nothing written, the second one, carrying the acknowledgement,
 * writes. Nothing is ever merged automatically.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:write');

    const body: unknown = await request.json();
    const parsed = companySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder zu lang.');
    }

    const input = parsed.data;
    const store = await getPartnerStore();
    const existing = await store.listDuplicateCandidates(session.organization.id);

    const formInput: PartnerFormInput = {
      legalName: input.legalName,
      tradeName: input.tradeName ?? null,
      relationshipDirection: input.relationshipDirection,
      partnerLevel: input.partnerLevel,
      status: input.status,
      verificationStatus: input.verificationStatus,
      country: input.country ?? null,
      region: input.region ?? null,
      city: input.city ?? null,
      postalCode: input.postalCode ?? null,
      address: input.address ?? null,
      website: input.website ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      registryName: input.registryName ?? null,
      registryNumber: input.registryNumber ?? null,
      vatId: input.vatId ?? null,
      lei: input.lei ?? null,
      staffModel: input.staffModel,
      furtherSubcontractingStatus: input.furtherSubcontractingStatus,
      datacenterExperienceStatus: input.datacenterExperienceStatus,
      isPreferred: input.isPreferred,
      isBlocked: input.isBlocked,
      blockedReason: input.blockedReason ?? null,
      internalRating: input.internalRating ?? null,
      sourceType: input.sourceType ?? null,
      sourceName: input.sourceName ?? null,
      sourceUrl: input.sourceUrl ?? null,
      internalNotes: input.internalNotes ?? null,
    };

    const result = validatePartnerInput(formInput, existing);
    const warnings = result.messages.filter((message) => message.severity === 'warning');

    if (!result.valid) {
      return apiSuccess({ saved: false, messages: result.messages }, 200);
    }

    if (warnings.length > 0 && input.acknowledgeDuplicateWarning !== true) {
      // Nothing is written yet — the user has to see this first.
      return apiSuccess({ saved: false, requiresAcknowledgement: true, messages: warnings });
    }

    const company = await store.createCompany({
      organizationId: session.organization.id,
      createdBy: session.profile.id,
      ...result.normalized,
      lastContactAt: input.lastContactAt ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      linkedBusinessClientId: input.linkedBusinessClientId ?? null,
    });

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: PARTNER_AUDIT_ACTIONS.created,
      resourceType: 'partner_companies',
      resourceId: company.id,
      // Metadata only: which fields were filled, never their contents.
      metadata: {
        relationshipDirection: company.relationshipDirection,
        status: company.status,
        hasRegistryNumber: company.registryNumber !== null,
        hasNotes: company.internalNotes !== null,
        acknowledgedDuplicateWarning: warnings.length > 0,
      },
    });

    logger.info('Partner angelegt', {
      scope: 'api:partners:companies',
      organizationId: session.organization.id,
      partnerCompanyId: company.id,
    });

    return apiSuccess({ saved: true, id: company.id, messages: warnings }, 201);
  } catch (error) {
    return handleApiError(error, 'api:partners:companies');
  }
}
