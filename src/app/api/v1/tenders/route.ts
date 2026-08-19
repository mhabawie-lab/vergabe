import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth/session';
import { getTenderRepository } from '@/lib/db';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { parseTenderSearchQuery, type RawSearchParams } from '@/modules/tenders/query';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/tenders
 *
 * Search over the normalised tender store. Reads only from the database —
 * never from a connector or an external portal
 * (CLAUDE.md § Architektur-Pipeline).
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission('tenders:read');

    const params: RawSearchParams = {};
    for (const [key, value] of request.nextUrl.searchParams.entries()) {
      params[key] = value;
    }

    const query = parseTenderSearchQuery(params);
    const repository = await getTenderRepository();
    const result = await repository.search(query);

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error, 'api:tenders');
  }
}
