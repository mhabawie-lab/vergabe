import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { validateSignalInput } from '@/modules/partners/signals';
import { PARTNER_AUDIT_ACTIONS } from '@/modules/partners/validation';
import { signalSchema } from '../schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/partners/signals
 *
 * Records an observation about a company.
 *
 * The source is mandatory and checked here, not only in the form: an
 * observation whose origin nobody can retrace must not enter this system,
 * because it will later be read as if it were established.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:write');

    const body: unknown = await request.json();
    const parsed = signalSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder ungültig.');
    }

    const input = parsed.data;

    const check = validateSignalInput({
      signalType: input.signalType,
      sourceType: input.sourceType,
      sourceName: input.sourceName ?? null,
      sourceUrl: input.sourceUrl ?? null,
      observedAt: input.observedAt,
      confidence: input.confidence,
      partnerCompanyId: input.partnerCompanyId ?? null,
      companyNameRaw: input.companyNameRaw ?? null,
    });

    if (!check.valid) {
      return apiSuccess({ saved: false, messages: check.messages }, 200);
    }

    const store = await getPartnerStore();
    const saved = await store.saveSignal({
      organizationId: session.organization.id,
      partnerCompanyId: input.partnerCompanyId ?? null,
      companyNameRaw: input.companyNameRaw ?? null,
      signalType: input.signalType,
      serviceCategory: input.serviceCategory ?? null,
      projectName: input.projectName ?? null,
      country: input.country ?? null,
      region: input.region ?? null,
      city: input.city ?? null,
      description: input.description ?? null,
      sourceType: input.sourceType,
      sourceName: input.sourceName ?? null,
      sourceUrl: input.sourceUrl ?? null,
      observedAt: input.observedAt,
      validUntil: input.validUntil ?? null,
      confidence: input.confidence,
      status: input.status,
      assignedTo: null,
      nextAction: input.nextAction ?? null,
      followUpAt: input.followUpAt ?? null,
      internalNote: input.internalNote ?? null,
      createdBy: session.profile.id,
    });

    if (saved === null) {
      throw new NotFoundError('Partner', input.partnerCompanyId ?? 'unbekannt');
    }

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: PARTNER_AUDIT_ACTIONS.signalCreated,
      resourceType: 'partner_signals',
      resourceId: saved.id,
      metadata: {
        signalType: saved.signalType,
        sourceType: saved.sourceType,
        confidence: saved.confidence,
      },
    });

    return apiSuccess({ saved: true, id: saved.id, record: saved }, 201);
  } catch (error) {
    return handleApiError(error, 'api:partners:signals');
  }
}
