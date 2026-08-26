import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import {
  PARTNER_AUDIT_ACTIONS,
  diffPartner,
  validatePartnerInput,
  type PartnerFormInput,
} from '@/modules/partners/validation';
import { companySchema } from '../../schemas';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/v1/partners/companies/:id
 *
 * Edits a partner company.
 *
 * The record is resolved within the caller's organisation, so an id belonging
 * to another tenant reads as "not found" rather than as a permission error —
 * anything else would confirm that the id exists.
 *
 * Blocking, unblocking, a status change and a notes change are separate audit
 * events, because they are separate decisions with different consequences.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission('subcontractors:write');
    const { id } = await params;

    const body: unknown = await request.json();
    const parsed = companySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder zu lang.');
    }

    const input = parsed.data;
    const store = await getPartnerStore();

    const current = await store.findCompanyRecord(session.organization.id, id);
    if (current === null) throw new NotFoundError('Partner', id);

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

    // The record being edited is not its own duplicate.
    const result = validatePartnerInput(formInput, existing, id);
    const warnings = result.messages.filter((message) => message.severity === 'warning');

    if (!result.valid) {
      return apiSuccess({ saved: false, messages: result.messages }, 200);
    }

    if (warnings.length > 0 && input.acknowledgeDuplicateWarning !== true) {
      return apiSuccess({ saved: false, requiresAcknowledgement: true, messages: warnings });
    }

    const changes = diffPartner(
      {
        legalName: current.legalName,
        tradeName: current.tradeName,
        relationshipDirection: current.relationshipDirection,
        partnerLevel: current.partnerLevel,
        status: current.status,
        verificationStatus: current.verificationStatus,
        country: current.country,
        region: current.region,
        city: current.city,
        postalCode: current.postalCode,
        address: current.address,
        website: current.website,
        email: current.email,
        phone: current.phone,
        registryName: current.registryName,
        registryNumber: current.registryNumber,
        vatId: current.vatId,
        lei: current.lei,
        staffModel: current.staffModel,
        furtherSubcontractingStatus: current.furtherSubcontractingStatus,
        datacenterExperienceStatus: current.datacenterExperienceStatus,
        isPreferred: current.isPreferred,
        isBlocked: current.isBlocked,
        blockedReason: current.blockedReason,
        internalRating: current.internalRating,
        sourceType: current.sourceType,
        sourceName: current.sourceName,
        sourceUrl: current.sourceUrl,
        internalNotes: current.internalNotes,
      },
      result.normalized,
    );

    if (changes.changedFields.length === 0) {
      // Nothing changed: no write, no audit entry. A log full of non-events
      // makes the real ones harder to find.
      return apiSuccess({ saved: true, id, unchanged: true, messages: [] });
    }

    const updated = await store.updateCompany(session.organization.id, id, {
      ...result.normalized,
      lastContactAt: input.lastContactAt ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      linkedBusinessClientId: input.linkedBusinessClientId ?? null,
    });
    if (updated === null) throw new NotFoundError('Partner', id);

    const auditBase = {
      organizationId: session.organization.id,
      userId: session.profile.id,
      resourceType: 'partner_companies',
      resourceId: id,
    };

    await store.recordAuditEntry({
      ...auditBase,
      action: PARTNER_AUDIT_ACTIONS.updated,
      metadata: {
        changedFields: changes.changedFields,
        acknowledgedDuplicateWarning: warnings.length > 0,
      },
    });

    if (changes.statusChanged) {
      await store.recordAuditEntry({
        ...auditBase,
        action: PARTNER_AUDIT_ACTIONS.statusChanged,
        metadata: { previousStatus: current.status, newStatus: updated.status },
      });
    }

    if (changes.blockChanged) {
      await store.recordAuditEntry({
        ...auditBase,
        action: updated.isBlocked
          ? PARTNER_AUDIT_ACTIONS.blocked
          : PARTNER_AUDIT_ACTIONS.unblocked,
        // Whether a reason exists, never the reason itself.
        metadata: { hasReason: updated.blockedReason !== null },
      });
    }

    if (changes.preferredChanged) {
      await store.recordAuditEntry({
        ...auditBase,
        action: PARTNER_AUDIT_ACTIONS.preferredChanged,
        metadata: { isPreferred: updated.isPreferred },
      });
    }

    if (changes.notesChanged) {
      await store.recordAuditEntry({
        ...auditBase,
        action: PARTNER_AUDIT_ACTIONS.notesChanged,
        metadata: {
          hadNotes: current.internalNotes !== null,
          hasNotes: updated.internalNotes !== null,
        },
      });
    }

    logger.info('Partner bearbeitet', {
      scope: 'api:partners:companies',
      organizationId: session.organization.id,
      partnerCompanyId: id,
      changedFields: changes.changedFields.length,
    });

    return apiSuccess({ saved: true, id, messages: warnings });
  } catch (error) {
    return handleApiError(error, 'api:partners:companies');
  }
}
