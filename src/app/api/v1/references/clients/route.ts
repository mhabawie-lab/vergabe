import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getReferenceStore } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import {
  CLIENT_AUDIT_ACTIONS,
  CLIENT_NAME_MAX_LENGTH,
  CLIENT_NOTES_MAX_LENGTH,
  CLIENT_WEBSITE_MAX_LENGTH,
  validateClientInput,
} from '@/modules/references/client-validation';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  name: z.string().max(CLIENT_NAME_MAX_LENGTH + 50),
  country: z.string().max(10).nullable().optional(),
  website: z.string().max(CLIENT_WEBSITE_MAX_LENGTH + 50).nullable().optional(),
  notes: z.string().max(CLIENT_NOTES_MAX_LENGTH + 500).nullable().optional(),
  isActive: z.boolean(),
  /**
   * Must be true once a duplicate warning was shown. Saving is an explicit
   * act — a similar name is a question for the user, not something to decide
   * silently in either direction.
   */
  acknowledgeDuplicateWarning: z.boolean().optional(),
});

/**
 * POST /api/v1/references/clients
 *
 * Creates a business client by hand.
 *
 * A warning does not block the save, but it must be acknowledged: the first
 * request comes back with the warning and no record written, the second one —
 * carrying the acknowledgement — writes.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('clients:write');

    const body: unknown = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder zu lang.');
    }

    const input = parsed.data;
    const store = await getReferenceStore();
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
    );

    const warnings = result.messages.filter((message) => message.severity === 'warning');

    if (!result.valid) {
      return apiSuccess({ saved: false, messages: result.messages }, 200);
    }

    if (warnings.length > 0 && input.acknowledgeDuplicateWarning !== true) {
      // Nothing is written yet — the user has to see this first.
      return apiSuccess({ saved: false, requiresAcknowledgement: true, messages: warnings });
    }

    const client = await store.createClient({
      organizationId: session.organization.id,
      name: result.normalized.name,
      country: result.normalized.country,
      website: result.normalized.website,
      notes: result.normalized.notes,
      isActive: result.normalized.isActive,
    });

    await store.recordAuditEntry({
      organizationId: session.organization.id,
      userId: session.profile.id,
      action: CLIENT_AUDIT_ACTIONS.created,
      resourceType: 'business_clients',
      resourceId: client.id,
      // Metadata only: which fields were filled, never their contents.
      metadata: {
        hasWebsite: result.normalized.website !== null,
        hasNotes: result.normalized.notes !== null,
        isActive: result.normalized.isActive,
        acknowledgedDuplicateWarning: warnings.length > 0,
      },
    });

    logger.info('Kunde angelegt', {
      scope: 'api:references:clients',
      organizationId: session.organization.id,
      clientId: client.id,
    });

    return apiSuccess({ saved: true, id: client.id, messages: warnings }, 201);
  } catch (error) {
    return handleApiError(error, 'api:references:clients');
  }
}
