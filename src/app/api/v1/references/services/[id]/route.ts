import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getReferenceStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import {
  CONFIRMATION_ACTIONS,
  CONFIRMATION_AUDIT_ACTIONS,
  ConfirmationRuleError,
  SERVICE_NOTE_MAX_LENGTH,
} from '@/modules/references/confirmation';
import { REFERENCE_SERVICE_CATEGORIES } from '@/types/reference';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  action: z.enum(CONFIRMATION_ACTIONS),
  /** Required for `change_and_confirm`, ignored otherwise. */
  targetCategory: z.enum(REFERENCE_SERVICE_CATEGORIES).nullable().optional(),
  note: z.string().trim().max(SERVICE_NOTE_MAX_LENGTH).nullable().optional(),
});

/**
 * PATCH /api/v1/references/services/:id
 *
 * Applies a confirmation decision to one service classification.
 *
 * Authorisation is checked twice, deliberately: `requirePermission` rejects a
 * viewer before anything is read, and the store resolves the service only
 * within the caller's organisation, so a valid id from another tenant reads as
 * "not found" rather than as a permission error — that difference would itself
 * leak the existence of the record.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission('references:write');
    const { id } = await params;

    const body: unknown = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Die Anfrage ist ungültig.', {
        issues: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    }

    const input = parsed.data;
    const store = await getReferenceStore();

    let result;
    try {
      result = await store.applyServiceDecision({
        organizationId: session.organization.id,
        serviceId: id,
        action: input.action,
        targetCategory: input.targetCategory ?? null,
        userId: session.profile.id,
        ...(input.note === undefined ? {} : { note: input.note }),
      });
    } catch (error) {
      if (error instanceof ConfirmationRuleError) {
        throw new ValidationError(error.message);
      }
      throw error;
    }

    if (result === null) {
      throw new NotFoundError('Leistungsart', id);
    }

    // The database trigger writes its own entry when Supabase is configured;
    // this call covers the in-process store and keeps both paths auditable.
    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: CONFIRMATION_AUDIT_ACTIONS[input.action],
      resourceType: 'reference_project_services',
      resourceId: id,
      metadata: {
        referenceProjectId: result.referenceProjectId,
        previousCategory: result.before.serviceCategory,
        newCategory: result.after.serviceCategory,
        previousStatus: result.before.confirmationStatus,
        newStatus: result.after.confirmationStatus,
        classificationSource: result.after.classificationSource,
        // Whether a note was written, never the note itself.
        hasNote: result.after.notes !== null,
      },
    });

    logger.info('Leistungsart entschieden', {
      scope: 'api:references:services',
      organizationId: session.organization.id,
      action: input.action,
      previousStatus: result.before.confirmationStatus,
      newStatus: result.after.confirmationStatus,
    });

    return apiSuccess({ service: result.after });
  } catch (error) {
    return handleApiError(error, 'api:references:services');
  }
}
