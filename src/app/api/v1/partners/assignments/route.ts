import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { ChainRuleError, mayAddChildAssignment } from '@/modules/partners/chain';
import { PARTNER_AUDIT_ACTIONS } from '@/modules/partners/validation';
import { assignmentSchema } from '../schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/partners/assignments
 *
 * Places a partner on a project, optionally under another assignment — that is
 * how the subcontracting chain is recorded.
 *
 * Two rules are enforced before anything is written: the chain may not close a
 * cycle or exceed its depth, and a partner may only be placed *under* another
 * one when that assignment actually permits further subcontracting. "Unknown"
 * is not permission.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:write');

    const body: unknown = await request.json();
    const parsed = assignmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder ungültig.');
    }

    const input = parsed.data;
    const store = await getPartnerStore();

    if (input.parentAssignmentId !== undefined && input.parentAssignmentId !== null) {
      const parent = await store.findAssignmentById(
        session.organization.id,
        input.parentAssignmentId,
      );
      // A foreign parent reads as "not found", like everywhere else.
      if (parent === null) throw new NotFoundError('Zuordnung', input.parentAssignmentId);

      const permission = mayAddChildAssignment(parent);
      if (!permission.allowed) throw new ValidationError(permission.reason);
    }

    let saved;
    try {
      saved = await store.saveAssignment({
        organizationId: session.organization.id,
        ...(input.id === undefined ? {} : { id: input.id }),
        partnerCompanyId: input.partnerCompanyId,
        referenceProjectId: input.referenceProjectId ?? null,
        needId: input.needId ?? null,
        role: input.role,
        parentAssignmentId: input.parentAssignmentId ?? null,
        contractPartnerCompanyId: input.contractPartnerCompanyId ?? null,
        scope: input.scope ?? null,
        staffCount: input.staffCount ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        furtherSubcontractingAllowed: input.furtherSubcontractingAllowed,
        status: input.status,
        internalRating: input.internalRating ?? null,
        note: input.note ?? null,
        createdBy: session.profile.id,
      });
    } catch (error) {
      if (error instanceof ChainRuleError) throw new ValidationError(error.message);
      throw error;
    }

    if (saved === null) throw new NotFoundError('Partner', input.partnerCompanyId);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action:
        input.id === undefined
          ? PARTNER_AUDIT_ACTIONS.assignmentCreated
          : PARTNER_AUDIT_ACTIONS.assignmentUpdated,
      resourceType: 'subcontractor_assignments',
      resourceId: saved.id,
      metadata: {
        role: saved.role,
        chainLevel: saved.chainLevel,
        status: saved.status,
      },
    });

    return apiSuccess({ saved: true, id: saved.id, record: saved }, 201);
  } catch (error) {
    return handleApiError(error, 'api:partners:assignments');
  }
}
