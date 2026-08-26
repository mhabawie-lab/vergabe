import { handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { PARTNER_IMPORT_TEMPLATE_CSV } from '@/modules/partners/template';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/partners/import/template
 *
 * Hands out the CSV template. Every value in it is invented and marked as
 * such — no real partner data lives in this repository.
 */
export async function GET() {
  try {
    await requirePermission('subcontractors:write');

    return new Response(PARTNER_IMPORT_TEMPLATE_CSV, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="partner-import-vorlage.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error, 'api:partners:import:template');
  }
}
