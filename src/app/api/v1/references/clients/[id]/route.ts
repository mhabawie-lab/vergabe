import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getReferenceStore } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import {
  CLIENT_AUDIT_ACTIONS,
  CLIENT_NAME_MAX_LENGTH,
  CLIENT_NOTES_MAX_LENGTH,
  CLIENT_WEBSITE_MAX_LENGTH,
  diffClient,
  validateClientInput,
} from '@/modules/references/client-validation';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  name: z.string().max(CLIENT_NAME_MAX_LENGTH + 50),
  country: z.string().max(10).nullable().optional(),
  website: z.string().max(CLIENT_WEBSITE_MAX_LENGTH + 50).nullable().optional(),
  notes: z.string().max(CLIENT_NOTES_MAX_LENGTH + 500).nullable().optional(),
  isActive: z.boolean(),
  acknowledgeDuplicateWarning: z.boolean().optional(),
});

/**
 * PATCH /api/v1/references/clients/:id
 *
 * Edits a business client.
 *
 * The record is resolved within the caller's organisation, so an id belonging
 * to another tenant reads as "not found" rather than as a permission error —
 * anything else would confirm that the id exists.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission('clients:write');
    const { id } = await params;

    const body: unknown = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder zu lang.');
    }

    const input = parsed.data;
    const store = await getReferenceStore();

    const current = await store.findClientRecord(session.organization.id, id);
    if (current === null) {
      throw new NotFoundError('Kunde', id);
    }

    const existing = await store.listClientNames(session.organization.id);

    const result = validateClientInput(
      {
        name: input.name,
        country: input.country ?? null,
        website: input.website ?? null,
        notes: input.notes ?? null,
        isActive: input.isActive,
      },
      existing,
      // The record being edited is not its own duplicate.
      id,
    );

    const warnings = result.messages.filter((message) => message.severity === 'warning');

    if (!result.valid) {
      return apiSuccess({ saved: false, messages: result.messages }, 200);
    }

    if (warnings.length > 0 && input.acknowledgeDuplicateWarning !== true) {
      // Nothing is written yet — the user has to see this first.
      return apiSuccess({ saved: false, requiresAcknowledgement: true, messages: warnings });
    }

    const changes = diffClient(
      {
        name: current.name,
        country: current.country,
        website: current.website,
        notes: current.notes,
        isActive: current.isActive,
      },
      result.normalized,
    );

    if (changes.changedFields.length === 0) {
      // Nothing changed: no write, no audit entry. An audit log that records
      // non-events makes the real ones harder to find.
      return apiSuccess({ saved: true, id, unchanged: true, messages: [] });
    }

    const updated = await store.updateClient(session.organization.id, id, {
      name: result.normalized.name,
      country: result.normalized.country,
      website: result.normalized.website,
      notes: result.normalized.notes,
      isActive: result.normalized.isActive,
    });

    if (updated === null) {
      throw new NotFoundError('Kunde', id);
    }

    // Metadata only — which fields changed, never their contents. Status and
    // notes get their own entries because they are separate, auditable events.
    const auditBase = {
      organizationId: session.organization.id,
      userId: session.profile.id,
      resourceType: 'business_clients',
      resourceId: id,
    };

    await store.recordAuditEntry({
      ...auditBase,
      action: CLIENT_AUDIT_ACTIONS.updated,
      metadata: {
        changedFields: changes.changedFields,
        acknowledgedDuplicateWarning: warnings.length > 0,
      },
    });

    if (changes.statusChanged) {
      await store.recordAuditEntry({
        ...auditBase,
        action: CLIENT_AUDIT_ACTIONS.statusChanged,
        metadata: {
          previousIsActive: current.isActive,
          newIsActive: result.normalized.isActive,
        },
      });
    }

    if (changes.notesChanged) {
      await store.recordAuditEntry({
        ...auditBase,
        action: CLIENT_AUDIT_ACTIONS.notesChanged,
        metadata: {
          hadNotes: current.notes !== null,
          hasNotes: result.normalized.notes !== null,
        },
      });
    }

    logger.info('Kunde bearbeitet', {
      scope: 'api:references:clients',
      organizationId: session.organization.id,
      clientId: id,
      changedFields: changes.changedFields.length,
    });

    return apiSuccess({ saved: true, id, messages: warnings });
  } catch (error) {
    return handleApiError(error, 'api:references:clients');
  }
}
