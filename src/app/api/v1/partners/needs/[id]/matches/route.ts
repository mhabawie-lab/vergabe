import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { MATCH_SCORE_VERSION } from '@/modules/partners/matching';
import { logger } from '@/lib/logging';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/partners/needs/:id/matches
 *
 * Recomputes the match list for one need.
 *
 * The scoring is deterministic and lives in `modules/partners/matching`, so
 * running this twice on unchanged data produces identical figures. A human
 * decision already recorded on a match — shortlisted, rejected — is kept; only
 * the computed columns are replaced.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission('subcontractors:write');
    const { id } = await params;

    const store = await getPartnerStore();
    const results = await store.recomputeMatches(session.organization.id, id);
    if (results === null) throw new NotFoundError('Bedarf', id);

    logger.info('Matches berechnet', {
      scope: 'api:partners:matches',
      organizationId: session.organization.id,
      needId: id,
      candidates: results.length,
      scoreVersion: MATCH_SCORE_VERSION,
    });

    return apiSuccess({
      computed: results.length,
      excluded: results.filter((result) => result.exclusionReason !== null).length,
      scoreVersion: MATCH_SCORE_VERSION,
    });
  } catch (error) {
    return handleApiError(error, 'api:partners:matches');
  }
}
