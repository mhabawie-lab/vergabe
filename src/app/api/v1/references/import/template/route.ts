import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { NotFoundError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/references/import/template
 *
 * Serves the anonymised CSV template. The file lives under `docs/` and is the
 * only reference-import file tracked in git — every value in it is obviously
 * fictional.
 */
export async function GET() {
  try {
    await requirePermission('references:import');

    const filePath = path.join(process.cwd(), 'docs', 'reference-import-template.csv');

    let content: string;
    try {
      content = await readFile(filePath, 'utf8');
    } catch {
      throw new NotFoundError('Importvorlage');
    }

    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="reference-import-template.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error, 'api:references:import:template');
  }
}
