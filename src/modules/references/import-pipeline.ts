/**
 * The reference import pipeline.
 *
 * Runs in two modes over the same code path:
 *
 *  - **dry run** — validates, checks for duplicates and reports what *would*
 *    happen. Writes nothing except the import protocol itself.
 *  - **commit** — same analysis, then writes the rows the user confirmed.
 *
 * Sharing the path matters: a dry run that exercised different logic than the
 * real import would give false confidence about customer data.
 *
 * Rows with an error are never written. Rows with a warning are written only
 * when the caller opted in, so a suspected duplicate cannot slip in unnoticed.
 */

import { logger } from '@/lib/logging';
import { toErrorMessage } from '@/lib/errors';
import type { ReferenceStore } from '@/lib/db/reference-ports';
import type {
  ImportRowValidationStatus,
  ReferenceImport,
  ValidationMessage,
} from '@/types/reference';
import { classifyReferenceProject } from './classification';
import { applyMapping, toRawRecord, type ColumnMapping } from './column-mapping';
import { findDuplicates } from './dedupe';
import type { ParsedTable } from './parse/csv';
import {
  createKnownValues,
  validateRow,
  type NormalizedRow,
} from './validation';

export interface ImportPreviewRow {
  rowNumber: number;
  /** Verbatim source row, keyed by header. Never modified. */
  raw: Record<string, string>;
  /** The normalised proposal, held separately from `raw`. */
  normalized: NormalizedRow;
  messages: ValidationMessage[];
  status: ImportRowValidationStatus;
  /** Service proposals derived from the object name. Never pre-confirmed. */
  serviceProposals: ReturnType<typeof classifyReferenceProject>;
}

export interface ImportAnalysis {
  fileName: string;
  fileType: 'csv' | 'xlsx' | 'manual';
  headers: string[];
  rows: ImportPreviewRow[];
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  /** Distinct client names the file would create or reuse. */
  clientNames: string[];
}

export interface ImportOptions {
  /** Also import rows that carry warnings. Errors are never imported. */
  includeWarningRows: boolean;
}

export interface ImportOutcome {
  analysis: ImportAnalysis;
  /** The recorded run — present for a dry run too. */
  importRun: ReferenceImport;
  /** 0 for a dry run. */
  importedRows: number;
  skippedRows: number;
  createdClients: number;
  dryRun: boolean;
}

/**
 * Validates a parsed table without writing anything.
 *
 * Pure apart from the duplicate lookup, which is why the existing stock is
 * passed in rather than fetched here — it keeps the function testable.
 */
export function analyzeTable(
  table: ParsedTable,
  mapping: ColumnMapping,
  existing: Parameters<typeof findDuplicates>[1],
  fileName: string,
  fileType: 'csv' | 'xlsx' | 'manual',
): ImportAnalysis {
  const known = createKnownValues();
  // Object numbers already in the database count as taken, so a collision is
  // reported on the row rather than surfacing as a constraint violation later.
  for (const candidate of existing) {
    if (candidate.externalObjectNumber !== null) {
      known.objectNumbers.add(candidate.externalObjectNumber);
    }
  }

  const rows: ImportPreviewRow[] = table.rows.map((sourceRow, index) => {
    const raw = toRawRecord(table.headers, sourceRow);
    const mapped = applyMapping(mapping, sourceRow);
    const { normalized, messages, status } = validateRow(mapped, known);

    const duplicates = findDuplicates(normalized, existing);
    const allMessages = [...messages, ...duplicates.map((finding) => finding.message)];

    const worst: ImportRowValidationStatus = allMessages.some(
      (message) => message.severity === 'error',
    )
      ? 'error'
      : allMessages.some((message) => message.severity === 'warning')
        ? 'warning'
        : status;

    return {
      rowNumber: index + 1,
      raw,
      normalized,
      messages: allMessages,
      status: worst,
      serviceProposals: classifyReferenceProject({
        projectName: normalized.projectName ?? '',
        objectType: normalized.objectType,
      }),
    };
  });

  const clientNames = [
    ...new Set(
      rows
        .map((row) => row.normalized.clientName)
        .filter((name): name is string => name !== null),
    ),
  ];

  return {
    fileName,
    fileType,
    headers: [...table.headers],
    rows,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === 'valid').length,
    warningRows: rows.filter((row) => row.status === 'warning').length,
    errorRows: rows.filter((row) => row.status === 'error').length,
    clientNames,
  };
}

/** Rows the given options would actually write. */
export function selectImportableRows(
  analysis: ImportAnalysis,
  options: ImportOptions,
): ImportPreviewRow[] {
  return analysis.rows.filter((row) => {
    if (row.status === 'error') return false;
    if (row.status === 'warning') return options.includeWarningRows;
    return row.status === 'valid';
  });
}

/**
 * Runs an import.
 *
 * @param dryRun when true nothing is written except the protocol, so the user
 *        can see the outcome before committing.
 */
export async function runImport(
  store: ReferenceStore,
  context: { organizationId: string; userId: string | null },
  table: ParsedTable,
  mapping: ColumnMapping,
  fileName: string,
  fileType: 'csv' | 'xlsx' | 'manual',
  options: ImportOptions,
  dryRun: boolean,
): Promise<ImportOutcome> {
  const runLogger = logger.child({
    scope: 'references:import',
    organizationId: context.organizationId,
    dryRun,
  });

  const existing = await store.listDuplicateCandidates(context.organizationId);
  const analysis = analyzeTable(table, mapping, existing, fileName, fileType);
  const importable = selectImportableRows(analysis, options);

  const importRun = await store.createImport({
    organizationId: context.organizationId,
    fileName,
    fileType,
    status: dryRun ? 'dry_run' : 'imported',
    totalRows: analysis.totalRows,
    validRows: analysis.validRows,
    warningRows: analysis.warningRows,
    errorRows: analysis.errorRows,
    importedRows: dryRun ? 0 : importable.length,
    createdBy: context.userId,
  });

  let importedRows = 0;
  let createdClients = 0;
  const rowRecords: Parameters<ReferenceStore['addImportRows']>[0][number][] = [];

  if (!dryRun) {
    // Resolve each distinct client once, so one client mentioned on twenty
    // rows produces one record rather than twenty.
    const clientIdByName = new Map<string, string>();

    for (const row of importable) {
      try {
        let businessClientId: string | null = null;
        const clientName = row.normalized.clientName;

        if (clientName !== null) {
          const cached = clientIdByName.get(clientName);
          if (cached !== undefined) {
            businessClientId = cached;
          } else {
            const { client, created } = await store.ensureClient(
              context.organizationId,
              clientName,
              row.normalized.country,
            );
            if (created) createdClients += 1;
            businessClientId = client.id;
            clientIdByName.set(clientName, client.id);
          }
        }

        const project = await store.createProject({
          organizationId: context.organizationId,
          businessClientId,
          externalObjectNumber: row.normalized.externalObjectNumber,
          projectName: row.normalized.projectName ?? '',
          objectType: row.normalized.objectType,
          country: row.normalized.country,
          region: row.normalized.region,
          city: row.normalized.city,
          postalCode: row.normalized.postalCode,
          address: null,
          startDate: row.normalized.startDate,
          endDate: row.normalized.endDate,
          shiftSummaryRaw: row.normalized.shiftSummaryRaw,
          shiftValues: row.normalized.shiftValues,
          invoiceStatus: row.normalized.invoiceStatus,
          // The source list carries no project status; claiming one would be
          // an invention.
          projectStatus: 'unknown',
          description: row.normalized.description,
          sourceImportId: importRun.id,
          services: row.serviceProposals.map((proposal) => ({
            serviceCategory: proposal.serviceCategory,
            serviceLabel: null,
            classificationSource: proposal.classificationSource,
            classificationConfidence: proposal.classificationConfidence,
            // Always false: an imported proposal is never pre-confirmed.
            confirmedByUser: false,
            notes: proposal.reason,
          })),
        });

        importedRows += 1;
        rowRecords.push({
          referenceImportId: importRun.id,
          rowNumber: row.rowNumber,
          rawData: row.raw,
          normalizedData: { ...row.normalized },
          validationStatus: 'imported',
          validationMessages: row.messages,
          importedProjectId: project.id,
        });
      } catch (error) {
        const message = toErrorMessage(error);
        runLogger.error('Zeile konnte nicht importiert werden', {
          rowNumber: row.rowNumber,
          error: message,
        });
        rowRecords.push({
          referenceImportId: importRun.id,
          rowNumber: row.rowNumber,
          rawData: row.raw,
          normalizedData: { ...row.normalized },
          validationStatus: 'error',
          validationMessages: [
            ...row.messages,
            {
              severity: 'error',
              code: 'write_failed',
              field: null,
              message: `Speichern fehlgeschlagen: ${message}`,
              suggestion: null,
            },
          ],
          importedProjectId: null,
        });
      }
    }
  }

  // Record the rows that were not written, so the protocol covers the file in
  // full rather than only its successful part.
  const writtenRowNumbers = new Set(rowRecords.map((record) => record.rowNumber));
  for (const row of analysis.rows) {
    if (writtenRowNumbers.has(row.rowNumber)) continue;
    rowRecords.push({
      referenceImportId: importRun.id,
      rowNumber: row.rowNumber,
      rawData: row.raw,
      normalizedData: { ...row.normalized },
      validationStatus: dryRun ? row.status : 'skipped',
      validationMessages: row.messages,
      importedProjectId: null,
    });
  }

  rowRecords.sort((a, b) => a.rowNumber - b.rowNumber);
  await store.addImportRows(rowRecords);

  runLogger.info('Import abgeschlossen', {
    fileName,
    totalRows: analysis.totalRows,
    importedRows,
    errorRows: analysis.errorRows,
    warningRows: analysis.warningRows,
  });

  return {
    analysis,
    importRun,
    importedRows,
    skippedRows: analysis.totalRows - importedRows,
    createdClients,
    dryRun,
  };
}
