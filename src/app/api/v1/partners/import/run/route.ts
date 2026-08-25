import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore, isUsingDemoStore } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { runPartnerImport } from '@/modules/partners/import-pipeline';
import { PARTNER_IMPORT_FIELDS } from '@/modules/partners/column-mapping';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const requestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileType: z.enum(['csv', 'xlsx', 'manual']),
  table: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    delimiter: z.string(),
  }),
  mapping: z.array(
    z.object({
      columnIndex: z.number().int().min(0),
      header: z.string(),
      field: z.enum(PARTNER_IMPORT_FIELDS).nullable(),
      matchType: z.enum(['exact', 'partial', 'none']),
    }),
  ),
  includeWarningRows: z.boolean(),
  /**
   * A dry run must be requested explicitly, and so must a real import — there
   * is no default, so a malformed client can never write by accident.
   */
  dryRun: z.boolean(),
  /** Must be true for a real import. Guards against an unintended commit. */
  confirmed: z.boolean(),
});

/**
 * POST /api/v1/partners/import/run
 *
 * Runs the partner import — as a dry run or, after explicit confirmation, for
 * real. Both go through the same code, so a dry run shows exactly what the
 * real import would do.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:write');

    const body: unknown = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Die Importanfrage ist unvollständig oder ungültig.', {
        issues: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    }

    const input = parsed.data;

    if (!input.dryRun && !input.confirmed) {
      throw new ValidationError(
        'Ein echter Import muss ausdrücklich bestätigt werden.',
      );
    }

    const store = await getPartnerStore();
    const outcome = await runPartnerImport(
      store,
      { organizationId: session.organization.id, userId: session.profile.id },
      input.table,
      input.mapping,
      input.fileName,
      input.fileType,
      { includeWarningRows: input.includeWarningRows },
      input.dryRun,
    );

    logger.info('Partnerimport ausgeführt', {
      scope: 'api:partners:import:run',
      organizationId: session.organization.id,
      dryRun: input.dryRun,
      importedCompanies: outcome.importedCompanies,
    });

    return apiSuccess({
      ...outcome,
      volatileStore: isUsingDemoStore(),
    });
  } catch (error) {
    return handleApiError(error, 'api:partners:import:run');
  }
}
