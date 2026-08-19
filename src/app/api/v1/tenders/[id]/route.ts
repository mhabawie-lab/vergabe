import { requirePermission } from '@/lib/auth/session';
import { getTenderRepository } from '@/lib/db';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/** GET /api/v1/tenders/:id — one normalised tender with its children. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission('tenders:read');

    const { id } = await params;
    const repository = await getTenderRepository();
    const tender = await repository.findById(id);

    if (tender === null) {
      throw new NotFoundError('Ausschreibung', id);
    }

    return apiSuccess(tender);
  } catch (error) {
    return handleApiError(error, 'api:tenders:detail');
  }
}
