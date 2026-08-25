/**
 * Partner import: analyse, dry run, confirmed import.
 *
 * The dry run and the real import go through *this* function, with one flag
 * different. A dry run that took a separate path could give false confidence
 * about what the real import would do — the whole point of offering one is
 * that it is the same code.
 *
 * Raw rows are stored untouched next to the normalised proposal, so the
 * normalisation can change later without losing what the source actually said.
 */

import 'server-only';

import { logger } from '@/lib/logging';
import type { PartnerStore } from '@/lib/db/partner-ports';
import type { ParsedTable } from '@/modules/references/parse/csv';
import { normalizeClientName } from '@/modules/references/normalize';
import type { ValidationMessage } from '@/types/reference';
import {
  applyPartnerMapping,
  toRawRecord,
  type PartnerColumnMapping,
} from './column-mapping';
import {
  createKnownPartnerValues,
  validatePartnerRow,
  type ExistingPartnerRef,
  type NormalizedPartnerRow,
} from './import-validation';

export interface AnalyzedPartnerRow {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: NormalizedPartnerRow;
  messages: ValidationMessage[];
  status: 'valid' | 'warning' | 'error';
}

export interface PartnerImportAnalysis {
  fileName: string;
  fileType: 'csv' | 'xlsx' | 'manual';
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  rows: AnalyzedPartnerRow[];
}

export interface PartnerImportOptions {
  /** Import rows that only carry warnings. Errors are never imported. */
  includeWarningRows: boolean;
}

export interface PartnerImportOutcome {
  analysis: PartnerImportAnalysis;
  dryRun: boolean;
  importRunId: string;
  importedCompanies: number;
  createdSignals: number;
  skippedRows: number;
}

/** Reads and validates the table without writing anything. */
export function analyzePartnerTable(
  table: ParsedTable,
  mapping: PartnerColumnMapping,
  existing: readonly ExistingPartnerRef[],
  fileName: string,
  fileType: 'csv' | 'xlsx' | 'manual',
): PartnerImportAnalysis {
  const known = createKnownPartnerValues();
  const seenNames = new Set<string>();
  const rows: AnalyzedPartnerRow[] = [];

  table.rows.forEach((row, index) => {
    const mapped = applyPartnerMapping(mapping, row);
    const result = validatePartnerRow(mapped, existing, known, seenNames);

    if (result.normalized.legalName !== null) {
      seenNames.add(normalizeClientName(result.normalized.legalName));
    }

    rows.push({
      // +2: one for the header line, one because humans count from 1.
      rowNumber: index + 2,
      raw: toRawRecord(table.headers, row),
      normalized: result.normalized,
      messages: result.messages,
      status: result.status,
    });
  });

  return {
    fileName,
    fileType,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === 'valid').length,
    warningRows: rows.filter((row) => row.status === 'warning').length,
    errorRows: rows.filter((row) => row.status === 'error').length,
    rows,
  };
}

function selectImportableRows(
  analysis: PartnerImportAnalysis,
  options: PartnerImportOptions,
): AnalyzedPartnerRow[] {
  return analysis.rows.filter((row) => {
    // Rows with errors are never imported, whatever the options say.
    if (row.status === 'error') return false;
    if (row.status === 'warning' && !options.includeWarningRows) return false;
    return row.normalized.legalName !== null;
  });
}

/**
 * Runs the import.
 *
 * @param dryRun when true nothing is written except the protocol entry, which
 *        is marked as a dry run.
 */
export async function runPartnerImport(
  store: PartnerStore,
  context: { organizationId: string; userId: string | null },
  table: ParsedTable,
  mapping: PartnerColumnMapping,
  fileName: string,
  fileType: 'csv' | 'xlsx' | 'manual',
  options: PartnerImportOptions,
  dryRun: boolean,
): Promise<PartnerImportOutcome> {
  const runLogger = logger.child({
    scope: 'partners:import',
    organizationId: context.organizationId,
    dryRun,
  });

  const candidates = await store.listDuplicateCandidates(context.organizationId);
  const existing: ExistingPartnerRef[] = candidates.map((candidate) => ({
    id: candidate.id,
    legalName: candidate.legalName,
    normalizedName: candidate.normalizedName,
    registryNumber: candidate.registryNumber,
    city: candidate.city,
  }));

  const analysis = analyzePartnerTable(table, mapping, existing, fileName, fileType);
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

  let importedCompanies = 0;
  let createdSignals = 0;
  const writtenIds = new Map<number, string>();

  if (!dryRun) {
    for (const row of importable) {
      const data = row.normalized;
      if (data.legalName === null) continue;

      const company = await store.createCompany({
        organizationId: context.organizationId,
        createdBy: context.userId,
        legalName: data.legalName,
        normalizedName: normalizeClientName(data.legalName),
        tradeName: data.tradeName,
        relationshipDirection: data.relationshipDirection,
        partnerLevel: data.partnerLevel,
        status: data.status,
        verificationStatus: data.verificationStatus,
        country: data.country,
        region: data.region,
        city: data.city,
        postalCode: data.postalCode,
        address: null,
        website: data.website,
        email: data.email,
        phone: data.phone,
        registryName: null,
        registryNumber: null,
        vatId: null,
        lei: null,
        staffModel: data.staffModel,
        furtherSubcontractingStatus: data.furtherSubcontracting,
        datacenterExperienceStatus: data.datacenterExperience,
        isPreferred: false,
        isBlocked: false,
        blockedReason: null,
        internalRating: null,
        sourceType: data.sourceUrl !== null ? 'website' : 'other',
        sourceName: data.sourceName,
        sourceUrl: data.sourceUrl,
        lastContactAt: data.lastContactAt,
        nextFollowUpAt: data.followUpAt,
        internalNotes: data.note,
        linkedBusinessClientId: null,
      });

      importedCompanies += 1;
      writtenIds.set(row.rowNumber, company.id);

      // An imported service is what the source claimed, so it is stored as
      // self-declared — never as confirmed. Confirming is a human act.
      if (data.serviceCategory !== null) {
        await store.saveService({
          organizationId: context.organizationId,
          partnerCompanyId: company.id,
          serviceCategory: data.serviceCategory,
          serviceLabel: null,
          confirmation: 'self_declared',
          confirmationSource: 'import_column',
          capacityNote: null,
          availableStaff: data.availableStaff,
          deliveryMode: 'unknown',
          note: null,
        });
      }

      if (data.region !== null || data.city !== null || data.radiusKm !== null) {
        await store.saveRegion({
          organizationId: context.organizationId,
          partnerCompanyId: company.id,
          country: data.country,
          region: data.region,
          city: data.city,
          radiusKm: data.radiusKm,
          nationwide: false,
          willingToTravel: false,
          // Imported, therefore unconfirmed.
          isConfirmed: false,
          note: null,
        });
      }

      if (data.availableFrom !== null || data.availableStaff !== null) {
        await store.saveAvailability({
          organizationId: context.organizationId,
          partnerCompanyId: company.id,
          serviceCategory: data.serviceCategory,
          availableFrom: data.availableFrom,
          availableUntil: null,
          status: 'unknown',
          availableStaff: data.availableStaff,
          shiftModel: 'unknown',
          nightShift: false,
          weekend: false,
          aroundTheClock: false,
          shortNotice: false,
          note: 'Aus dem Import übernommen, nicht bestätigt.',
          // An imported figure has not been confirmed by anyone.
          confirmNow: false,
        });
      }

      if (data.contactName !== null) {
        await store.saveContact({
          organizationId: context.organizationId,
          partnerCompanyId: company.id,
          firstName: null,
          lastName: data.contactName,
          role: null,
          businessEmail: data.email,
          businessPhone: data.phone,
          preferredChannel: 'unknown',
          sourceType: 'other',
          internalNote: null,
          isActive: true,
        });
      }

      // A signal is only created when the row carries a source, because an
      // observation without one is a rumour.
      if (
        data.signalType !== null &&
        (data.sourceName !== null || data.sourceUrl !== null)
      ) {
        await store.saveSignal({
          organizationId: context.organizationId,
          partnerCompanyId: company.id,
          companyNameRaw: data.legalName,
          signalType: data.signalType,
          serviceCategory: data.serviceCategory,
          projectName: data.projectName,
          country: data.country,
          region: data.region,
          city: data.city,
          description: data.note,
          sourceType: data.sourceUrl !== null ? 'website' : 'other',
          sourceName: data.sourceName,
          sourceUrl: data.sourceUrl,
          observedAt: new Date().toISOString().slice(0, 10),
          validUntil: null,
          // Imported observations start low: nobody has checked them.
          confidence: 'low',
          status: 'new',
          assignedTo: null,
          nextAction: null,
          followUpAt: data.followUpAt,
          internalNote: null,
          createdBy: context.userId,
        });
        createdSignals += 1;
      }
    }
  }

  await store.addImportRows(
    analysis.rows.map((row) => ({
      partnerImportId: importRun.id,
      organizationId: context.organizationId,
      rowNumber: row.rowNumber,
      rawData: row.raw,
      normalizedData: row.normalized as unknown as Record<string, unknown>,
      validationStatus: row.status,
      validationMessages: row.messages,
      importedCompanyId: writtenIds.get(row.rowNumber) ?? null,
    })),
  );

  runLogger.info('Partnerimport abgeschlossen', {
    fileName,
    totalRows: analysis.totalRows,
    importedCompanies,
    createdSignals,
    errorRows: analysis.errorRows,
    warningRows: analysis.warningRows,
  });

  return {
    analysis,
    dryRun,
    importRunId: importRun.id,
    importedCompanies,
    createdSignals,
    skippedRows: analysis.totalRows - importable.length,
  };
}
