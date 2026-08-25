import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getReferenceStore } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import {
  CONFIRMATION_AUDIT_ACTIONS,
  SERVICE_NOTE_MAX_LENGTH,
  canBulkConfirm,
} from '@/modules/references/confirmation';

export const dynamic = 'force-dynamic';

/** Upper bound so one request cannot assert something about hundreds of rows. */
const MAX_BULK_SIZE = 100;

const requestSchema = z.object({
  serviceIds: z.array(z.string().min(1)).min(1).max(MAX_BULK_SIZE),
  /** Must be true. Guards against an unintended bulk assertion. */
  confirmed: z.literal(true),
  /**
   * One note for the whole selection. Recorded on every entry, so a later
   * reader sees the reason on each individual service, not only on a batch.
   */
  note: z.string().trim().max(SERVICE_NOTE_MAX_LENGTH).nullable().optional(),
});

/**
 * POST /api/v1/references/services/bulk-confirm
 *
 * Confirms several proposals at once.
 *
 * This is the only place where one click asserts something about several
 * customer references, so the rules are strict and enforced here rather than
 * trusted from the client: every entry must still be an untouched proposal of
 * the *same* category, `unknown` is excluded, and the request must carry an
 * explicit confirmation flag. The set is also re-read from the store first, so
 * a client that sent stale state cannot confirm something already decided.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('references:write');

    const body: unknown = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Die Sammelbestätigung muss ausdrücklich bestätigt werden und darf höchstens 100 Einträge umfassen.',
      );
    }

    const store = await getReferenceStore();

    // Re-read within the organisation: ids from another tenant simply do not
    // come back, and stale statuses are corrected before the rule check.
    const services = await store.listServicesByIds(
      session.organization.id,
      parsed.data.serviceIds,
    );

    if (services.length !== parsed.data.serviceIds.length) {
      throw new ValidationError(
        'Teile der Auswahl sind nicht mehr verfügbar. Bitte laden Sie die Seite neu.',
      );
    }

    const check = canBulkConfirm(services);
    if (!check.allowed) {
      throw new ValidationError(check.reason ?? 'Sammelbestätigung nicht möglich.');
    }

    const note = parsed.data.note ?? null;

    let confirmed = 0;
    for (const service of services) {
      const result = await store.applyServiceDecision({
        organizationId: session.organization.id,
        serviceId: service.id,
        action: 'confirm',
        targetCategory: null,
        userId: session.profile.id,
        // An empty note must not erase a note somebody wrote on a single
        // service earlier, so it is only passed on when something was typed.
        ...(note === null ? {} : { note }),
      });

      if (result === null) continue;
      confirmed += 1;

      await store.recordAuditEntry({
        organizationId: session.organization.id,
        userId: session.profile.id,
        action: CONFIRMATION_AUDIT_ACTIONS.confirm,
        resourceType: 'reference_project_services',
        resourceId: service.id,
        metadata: {
          referenceProjectId: result.referenceProjectId,
          previousCategory: result.before.serviceCategory,
          newCategory: result.after.serviceCategory,
          previousStatus: result.before.confirmationStatus,
          newStatus: result.after.confirmationStatus,
          bulk: true,
          hasNote: result.after.notes !== null,
        },
      });
    }

    logger.info('Leistungsarten sammelbestätigt', {
      scope: 'api:references:services:bulk',
      organizationId: session.organization.id,
      confirmed,
    });

    return apiSuccess({ confirmed });
  } catch (error) {
    return handleApiError(error, 'api:references:services:bulk');
  }
}
