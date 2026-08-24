import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getReferenceStore, isUsingDemoStore } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { runImport } from '@/modules/references/import-pipeline';
import { IMPORT_FIELDS } from '@/modules/references/column-mapping';

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
      field: z.enum(IMPORT_FIELDS).nullable(),
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
 * POST /api/v1/references/import/run
 *
 * Runs the import — as a dry run or, after explicit confirmation, for real.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('references:import');

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
        'Der Import muss ausdrücklich bestätigt werden.',
      );
    }

    if (input.table.rows.length === 0) {
      throw new ValidationError('Es wurden keine Datenzeilen übermittelt.');
    }

    const store = await getReferenceStore();

    const outcome = await runImport(
      store,
      { organizationId: session.organization.id, userId: session.profile.id },
      input.table,
      input.mapping,
      input.fileName,
      input.fileType,
      { includeWarningRows: input.includeWarningRows },
      input.dryRun,
    );

    logger.info('Referenzimport ausgeführt', {
      scope: 'api:references:import',
      organizationId: session.organization.id,
      dryRun: input.dryRun,
      importedRows: outcome.importedRows,
      totalRows: outcome.analysis.totalRows,
    });

    return apiSuccess({
      dryRun: outcome.dryRun,
      importRunId: outcome.importRun.id,
      totalRows: outcome.analysis.totalRows,
      validRows: outcome.analysis.validRows,
      warningRows: outcome.analysis.warningRows,
      errorRows: outcome.analysis.errorRows,
      importedRows: outcome.importedRows,
      skippedRows: outcome.skippedRows,
      createdClients: outcome.createdClients,
      /** True when the data landed in the volatile development store. */
      volatileStorage: isUsingDemoStore(),
    });
  } catch (error) {
    return handleApiError(error, 'api:references:import:run');
  }
}
