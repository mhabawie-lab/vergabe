import type { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { analyzePartnerTable } from '@/modules/partners/import-pipeline';
import { proposePartnerColumnMapping } from '@/modules/partners/column-mapping';
import { parseCsv } from '@/modules/references/parse/csv';
import { parseXlsx } from '@/modules/references/parse/xlsx';

export const dynamic = 'force-dynamic';

/** Refuse oversized uploads rather than exhausting memory on them. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5000;

/**
 * POST /api/v1/partners/import/parse
 *
 * Reads an uploaded CSV or XLSX file, proposes a column mapping and validates
 * every row. **Writes nothing** — this is the preview step, so the user sees
 * what would happen before deciding.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('subcontractors:write');

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      throw new ValidationError('Es wurde keine Datei übermittelt.');
    }
    if (file.size === 0) throw new ValidationError('Die Datei ist leer.');
    if (file.size > MAX_FILE_BYTES) {
      throw new ValidationError(
        `Die Datei ist größer als ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
      );
    }

    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith('.csv') || lowerName.endsWith('.txt');
    const isXlsx = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xlsm');

    if (!isCsv && !isXlsx) {
      throw new ValidationError(
        'Nur CSV- und XLSX-Dateien werden unterstützt. PDF-Import ist nicht Teil dieser Phase.',
      );
    }

    const table = isCsv
      ? parseCsv(await file.text())
      : await parseXlsx(await file.arrayBuffer());

    if (table.rows.length === 0) {
      throw new ValidationError('Die Datei enthält keine Datenzeilen.');
    }
    if (table.rows.length > MAX_ROWS) {
      throw new ValidationError(
        `Die Datei enthält ${table.rows.length} Zeilen. Maximal ${MAX_ROWS} Zeilen pro Import.`,
      );
    }

    const mapping = proposePartnerColumnMapping(table.headers);

    // Compare against what is already stored, so duplicates surface now
    // rather than at write time.
    const store = await getPartnerStore();
    const candidates = await store.listDuplicateCandidates(session.organization.id);

    const analysis = analyzePartnerTable(
      table,
      mapping,
      candidates.map((candidate) => ({
        id: candidate.id,
        legalName: candidate.legalName,
        normalizedName: candidate.normalizedName,
        registryNumber: candidate.registryNumber,
        city: candidate.city,
      })),
      file.name,
      isCsv ? 'csv' : 'xlsx',
    );

    return apiSuccess({ table, mapping, analysis });
  } catch (error) {
    return handleApiError(error, 'api:partners:import:parse');
  }
}
