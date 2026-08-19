/**
 * IngestionStore backed by the in-memory tables.
 *
 * Used in local demo mode so the pipeline can be exercised end to end without
 * a database. Write semantics mirror the Postgres constraints: unique
 * (source_id, external_id) on tenders, unique content hash on raw imports.
 */

import { randomUUID } from 'node:crypto';
import type {
  AuthorityUpsertInput,
  AwardUpsertInput,
  ConnectorRunResult,
  IngestionStore,
  NormalizationRecordInput,
  RawImportInput,
  TenderUpsertInput,
} from '@/lib/db/ports';
import type { ConnectorRun, RawImport, Source } from '@/types/source';
import type { Tender, TenderDocument, TenderLot, TenderRequirement } from '@/types/tender';
import type { MemoryTables } from './tables';

export class MemoryIngestionStore implements IngestionStore {
  constructor(private readonly tables: MemoryTables) {}

  async getSourceByKey(key: string): Promise<Source | null> {
    return this.tables.sources.find((source) => source.key === key) ?? null;
  }

  async listActiveSources(): Promise<Source[]> {
    return this.tables.sources.filter((source) => source.isActive);
  }

  async startConnectorRun(sourceId: string): Promise<ConnectorRun> {
    const source = this.tables.sources.find((entry) => entry.id === sourceId);
    const now = new Date().toISOString();

    const run: ConnectorRun = {
      id: randomUUID(),
      sourceId,
      sourceKey: source?.key ?? 'unknown',
      status: 'running',
      startedAt: now,
      finishedAt: null,
      itemsFound: 0,
      itemsImported: 0,
      itemsSkipped: 0,
      itemsFailed: 0,
      errorMessage: null,
      createdAt: now,
    };

    this.tables.connectorRuns.push(run);
    return run;
  }

  async finishConnectorRun(runId: string, result: ConnectorRunResult): Promise<void> {
    const run = this.tables.connectorRuns.find((entry) => entry.id === runId);
    if (run === undefined) return;

    run.status = result.status;
    run.finishedAt = new Date().toISOString();
    run.itemsFound = result.itemsFound;
    run.itemsImported = result.itemsImported;
    run.itemsSkipped = result.itemsSkipped;
    run.itemsFailed = result.itemsFailed;
    run.errorMessage = result.errorMessage;
  }

  async hasRawImport(
    sourceId: string,
    externalId: string,
    payloadHash: string,
  ): Promise<boolean> {
    return this.tables.rawImports.some(
      (entry) =>
        entry.sourceId === sourceId &&
        entry.externalId === externalId &&
        entry.payloadHash === payloadHash,
    );
  }

  async insertRawImport(input: RawImportInput): Promise<RawImport> {
    const now = new Date().toISOString();
    const rawImport: RawImport = {
      id: randomUUID(),
      sourceId: input.sourceId,
      connectorRunId: input.connectorRunId,
      externalId: input.externalId,
      payload: input.payload,
      payloadHash: input.payloadHash,
      fetchedAt: now,
      isDemo: input.isDemo,
      createdAt: now,
    };

    this.tables.rawImports.push(rawImport);
    return rawImport;
  }

  async upsertAuthority(input: AuthorityUpsertInput): Promise<string> {
    const existing = this.tables.authorities.find(
      (entry) =>
        entry.sourceId === input.sourceId && entry.externalId === input.externalId,
    );

    const now = new Date().toISOString();

    if (existing !== undefined) {
      existing.name = input.name;
      existing.authorityType = input.authorityType;
      existing.street = input.street;
      existing.postalCode = input.postalCode;
      existing.city = input.city;
      existing.regionCode = input.regionCode;
      existing.countryCode = input.countryCode;
      existing.email = input.email;
      existing.phone = input.phone;
      existing.website = input.website;
      existing.updatedAt = now;
      return existing.id;
    }

    const id = randomUUID();
    this.tables.authorities.push({
      id,
      sourceId: input.sourceId,
      externalId: input.externalId,
      name: input.name,
      authorityType: input.authorityType,
      street: input.street,
      postalCode: input.postalCode,
      city: input.city,
      regionCode: input.regionCode,
      countryCode: input.countryCode,
      email: input.email,
      phone: input.phone,
      website: input.website,
      isDemo: input.isDemo,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  }

  async upsertTender(input: TenderUpsertInput): Promise<string> {
    const { draft } = input;
    const source = this.tables.sources.find((entry) => entry.id === input.sourceId);
    const authority =
      input.contractingAuthorityId === null
        ? null
        : (this.tables.authorities.find(
            (entry) => entry.id === input.contractingAuthorityId,
          ) ?? null);

    const now = new Date().toISOString();
    const existing = this.tables.tenders.find(
      (entry) =>
        entry.sourceId === input.sourceId && entry.externalId === draft.externalId,
    );

    const id = existing?.id ?? randomUUID();

    const tender: Tender = {
      id,
      sourceId: input.sourceId,
      sourceKey: source?.key ?? 'unknown',
      sourceName: source?.name ?? 'Unbekannte Quelle',
      externalId: draft.externalId,
      rawImportId: input.rawImportId,
      sourceUrl: draft.sourceUrl,
      originalLanguage: draft.originalLanguage,
      fingerprint: input.fingerprint,
      dedupeGroupId: existing?.dedupeGroupId ?? null,
      title: draft.title,
      summary: draft.summary,
      description: draft.description,
      referenceNumber: draft.referenceNumber,
      procurementType: draft.procurementType,
      procedureType: draft.procedureType,
      cpvCodes: draft.cpvCodes,
      sectors: draft.sectors,
      nutsCodes: draft.nutsCodes,
      countryCode: draft.countryCode,
      regionCode: draft.regionCode,
      city: draft.city,
      postalCode: draft.postalCode,
      contractingAuthorityId: input.contractingAuthorityId,
      contractingAuthority: authority,
      publicationDate: draft.publicationDate,
      submissionDeadline: draft.submissionDeadline,
      questionDeadline: draft.questionDeadline,
      bindingPeriodEnd: draft.bindingPeriodEnd,
      contractStart: draft.contractStart,
      contractEnd: draft.contractEnd,
      durationMonths: draft.durationMonths,
      estimatedValueNet: draft.estimatedValueNet,
      currency: draft.currency,
      status: draft.status,
      lots: [],
      requirements: [],
      documents: [],
      sourceExtras: draft.sourceExtras,
      isDemo: input.isDemo,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing === undefined) {
      this.tables.tenders.push(tender);
    } else {
      const index = this.tables.tenders.indexOf(existing);
      this.tables.tenders[index] = tender;
    }

    // Child rows are replaced wholesale — the raw import is the source of
    // truth, so a re-import must not leave stale children behind.
    this.tables.lots = this.tables.lots.filter((lot) => lot.tenderId !== id);
    this.tables.requirements = this.tables.requirements.filter(
      (requirement) => requirement.tenderId !== id,
    );
    this.tables.documents = this.tables.documents.filter(
      (document) => document.tenderId !== id,
    );

    for (const lot of draft.lots) {
      const stored: TenderLot = {
        id: randomUUID(),
        tenderId: id,
        lotNumber: lot.lotNumber,
        title: lot.title,
        description: lot.description,
        estimatedValueNet: lot.estimatedValueNet,
        cpvCodes: lot.cpvCodes,
      };
      this.tables.lots.push(stored);
    }

    for (const requirement of draft.requirements) {
      const stored: TenderRequirement = {
        id: randomUUID(),
        tenderId: id,
        category: requirement.category,
        label: requirement.label,
        description: requirement.description,
        mandatory: requirement.mandatory,
      };
      this.tables.requirements.push(stored);
    }

    for (const document of draft.documents) {
      const stored: TenderDocument = {
        id: randomUUID(),
        tenderId: id,
        title: document.title,
        fileType: document.fileType,
        fileSizeBytes: document.fileSizeBytes,
        sourceUrl: document.sourceUrl,
        storagePath: null,
        downloadStatus: 'pending',
        isDemo: input.isDemo,
      };
      this.tables.documents.push(stored);
    }

    return id;
  }

  async upsertAward(input: AwardUpsertInput): Promise<string> {
    const now = new Date().toISOString();
    const tender = this.tables.tenders.find((entry) => entry.id === input.tenderId);
    const existing = this.tables.awards.find(
      (entry) => entry.tenderId === input.tenderId,
    );

    if (existing !== undefined) {
      existing.winnerName = input.winnerName;
      existing.winnerCity = input.winnerCity;
      existing.awardValueNet = input.awardValueNet;
      existing.awardDate = input.awardDate;
      existing.bidderCount = input.bidderCount;
      return existing.id;
    }

    const id = randomUUID();
    this.tables.awards.push({
      id,
      tenderId: input.tenderId,
      tenderTitle: tender?.title ?? '',
      contractingAuthorityId: input.contractingAuthorityId,
      winnerName: input.winnerName,
      winnerCity: input.winnerCity,
      awardValueNet: input.awardValueNet,
      currency: input.currency,
      awardDate: input.awardDate,
      bidderCount: input.bidderCount,
      sourceUrl: input.sourceUrl,
      isDemo: input.isDemo,
      createdAt: now,
    });

    return id;
  }

  async recordNormalization(input: NormalizationRecordInput): Promise<void> {
    this.tables.normalizationRuns.push({
      id: randomUUID(),
      rawImportId: input.rawImportId,
      sourceId: input.sourceId,
      tenderId: input.tenderId,
      status: input.status,
      mapperVersion: input.mapperVersion,
      errorMessage: input.errorMessage,
      createdAt: new Date().toISOString(),
    });
  }

  async recordDuplicateCandidates(
    tenderId: string,
    fingerprint: string,
  ): Promise<number> {
    const matches = this.tables.tenders.filter(
      (tender) => tender.fingerprint === fingerprint && tender.id !== tenderId,
    );

    let created = 0;
    for (const match of matches) {
      const alreadyKnown = this.tables.duplicateCandidates.some(
        (candidate) =>
          candidate.tenderId === tenderId && candidate.duplicateOfId === match.id,
      );
      if (alreadyKnown) continue;

      this.tables.duplicateCandidates.push({
        id: randomUUID(),
        tenderId,
        duplicateOfId: match.id,
        similarityScore: 1,
        detectionMethod: 'fingerprint',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      created += 1;
    }

    return created;
  }
}
