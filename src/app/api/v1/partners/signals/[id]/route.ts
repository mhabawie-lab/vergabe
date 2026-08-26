import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import {
  SIGNAL_ACTIONS,
  SIGNAL_AUDIT_ACTIONS,
  SignalRuleError,
  applySignalAction,
} from '@/modules/partners/signals';

export const dynamic = 'force-dynamic';

const actionSchema = z.object({
  action: z.enum(SIGNAL_ACTIONS),
  nextAction: z.string().max(2000).nullable().optional(),
  followUpAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  internalNote: z.string().max(4000).nullable().optional(),
});

/**
 * PATCH /api/v1/partners/signals/:id
 *
 * Moves a signal along: reviewed, relevant, contacted, done, discarded,
 * expired. The signal itself is never rewritten into a fact — the status says
 * what somebody decided about the observation, not that it came true.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission('subcontractors:write');
    const { id } = await params;

    const body: unknown = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Die Anfrage ist ungültig.');

    const store = await getPartnerStore();
    const current = await store.findSignalById(session.organization.id, id);
    if (current === null) throw new NotFoundError('Signal', id);

    let next;
    try {
      next = applySignalAction(current, parsed.data.action);
    } catch (error) {
      if (error instanceof SignalRuleError) throw new ValidationError(error.message);
      throw error;
    }

    const saved = await store.saveSignal({
      organizationId: session.organization.id,
      id: current.id,
      partnerCompanyId: current.partnerCompanyId,
      companyNameRaw: current.companyNameRaw,
      signalType: current.signalType,
      serviceCategory: current.serviceCategory,
      projectName: current.projectName,
      country: current.country,
      region: current.region,
      city: current.city,
      description: current.description,
      sourceType: current.sourceType,
      sourceName: current.sourceName,
      sourceUrl: current.sourceUrl,
      observedAt: current.observedAt,
      validUntil: current.validUntil,
      confidence: current.confidence,
      status: next.status,
      assignedTo: current.assignedTo,
      nextAction: parsed.data.nextAction ?? current.nextAction,
      followUpAt: parsed.data.followUpAt ?? current.followUpAt,
      internalNote: parsed.data.internalNote ?? current.internalNote,
      createdBy: current.createdBy,
    });

    if (saved === null) throw new NotFoundError('Signal', id);

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: SIGNAL_AUDIT_ACTIONS[parsed.data.action],
      resourceType: 'partner_signals',
      resourceId: id,
      metadata: {
        previousStatus: current.status,
        newStatus: saved.status,
        signalType: saved.signalType,
      },
    });

    return apiSuccess({ saved: true, record: saved });
  } catch (error) {
    return handleApiError(error, 'api:partners:signals');
  }
}
