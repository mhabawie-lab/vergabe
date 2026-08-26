import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess, handleApiError } from '@/lib/api/response';
import { getAuthState } from '@/lib/auth/session';
import { resolveBackend } from '@/lib/env';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_SLUG_PATTERN,
  suggestOrganizationSlug,
} from '@/modules/organizations/onboarding';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  name: z.string().max(ORGANIZATION_NAME_MAX_LENGTH + 50),
  slug: z.string().max(80),
  legalForm: z.string().max(80).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  countryCode: z.string().max(2).nullable().optional(),
});

/**
 * POST /api/v1/onboarding/organization
 *
 * Creates the first organisation for a signed-in user who belongs nowhere yet
 * and makes them its org_admin.
 *
 * This is not open self-registration. It requires an authenticated session,
 * it acts only for that session's user, and the database refuses a second
 * call — organisation, membership and audit entry are written by
 * `create_first_organization` in one transaction, so a failure leaves nothing
 * half-created (CLAUDE.md § 11: partner firms never get accounts).
 */
export async function POST(request: NextRequest) {
  try {
    if (resolveBackend().backend === 'memory') {
      return apiError(
        'configuration_missing',
        'Im lokalen DEMO-Modus gibt es keine Registrierung. Die Demo-Organisation ist bereits vorhanden.',
        503,
      );
    }

    const state = await getAuthState();

    if (state.kind === 'anonymous') {
      return apiError('unauthenticated', 'Bitte melden Sie sich zuerst an.', 401);
    }

    if (state.kind === 'session') {
      // Already a member. Not an error the user caused — but not a second
      // organisation either.
      return apiError(
        'conflict',
        'Dieses Konto gehört bereits zu einer Organisation.',
        409,
      );
    }

    const body: unknown = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Die Eingaben sind unvollständig oder zu lang.');
    }

    const name = parsed.data.name.trim();
    const slug = parsed.data.slug.trim().toLowerCase();

    if (name.length === 0 || name.length > ORGANIZATION_NAME_MAX_LENGTH) {
      throw new ValidationError(
        `Der Name der Organisation muss 1 bis ${ORGANIZATION_NAME_MAX_LENGTH} Zeichen lang sein.`,
      );
    }

    if (!ORGANIZATION_SLUG_PATTERN.test(slug)) {
      throw new ValidationError(
        'Die Kennung ist ungültig. Erlaubt sind 3 bis 50 Zeichen: a–z, 0–9 und Bindestrich.',
        { suggestion: suggestOrganizationSlug(name) },
      );
    }

    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc('create_first_organization', {
      p_name: name,
      p_slug: slug,
      p_legal_form: parsed.data.legalForm ?? null,
      p_city: parsed.data.city ?? null,
      p_country_code: parsed.data.countryCode ?? 'DE',
    });

    if (error !== null) {
      // The database is the authority here; its checks are the ones that hold
      // under concurrency. Its messages are user-facing German and contain no
      // internals, so they are passed through.
      logger.warn('Onboarding abgewiesen', {
        scope: 'api:onboarding',
        code: error.code,
      });
      const status = error.code === '23505' ? 409 : 400;
      return apiError(
        status === 409 ? 'conflict' : 'validation_failed',
        error.message,
        status,
      );
    }

    logger.info('Organisation im Onboarding angelegt', {
      scope: 'api:onboarding',
      organizationId: typeof data === 'string' ? data : undefined,
    });

    return apiSuccess({ organizationId: data }, 201);
  } catch (error) {
    return handleApiError(error, 'api:onboarding');
  }
}
