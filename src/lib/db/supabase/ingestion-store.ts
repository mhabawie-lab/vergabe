/**
 * IngestionStore backed by Postgres via Supabase.
 *
 * Uses the service role client: the pipeline writes reference data that no
 * end-user role may write, so RLS is bypassed here by design. Never construct
 * this from a browser-facing code path.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
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
import {
  asRow,
  asRows,
  toConnectorRun,
  toRawImport,
  toSource,
  type ConnectorRunRow,
  type RawImportRow,
  type SourceRow,
} from './rows';

export class SupabaseIngestionStore implements IngestionStore {
  constructor(private readonly client: SupabaseClient) {}

  async getSourceByKey(key: string): Promise<Source | null> {
    const { data, error } = await this.client
      .from('sources')
      .select('*')
      .eq('key', key)
      .maybeSingle();

    if (error !== null) {
      throw new Error(`Quelle "${key}" konnte nicht geladen werden: ${error.message}`);
    }

    const row = asRow<SourceRow>(data);
    return row === null ? null : toSource(row);
  }

  async listActiveSources(): Promise<Source[]> {
    const { data, error } = await this.client
      .from('sources')
      .select('*')
      .eq('is_active', true)
      .order('key');

    if (error !== null) {
      throw new Error(`Aktive Quellen konnten nicht geladen werden: ${error.message}`);
    }

    return asRows<SourceRow>(data).map(toSource);
  }

  async startConnectorRun(sourceId: string): Promise<ConnectorRun> {
    const { data, error } = await this.client
      .from('connector_runs')
      .insert({ source_id: sourceId, status: 'running' })
      .select('*, sources ( key )')
      .single();

    if (error !== null) {
      throw new Error(`Connector-Lauf konnte nicht gestartet werden: ${error.message}`);
    }

    const row = asRow<ConnectorRunRow>(data);
    if (row === null) {
      throw new Error('Connector-Lauf konnte nicht gestartet werden.');
    }

    return toConnectorRun(row);
  }

  async finishConnectorRun(runId: string, result: ConnectorRunResult): Promise<void> {
    const { error } = await this.client
      .from('connector_runs')
      .update({
        status: result.status,
        finished_at: new Date().toISOString(),
        items_found: result.itemsFound,
        items_imported: result.itemsImported,
        items_skipped: result.itemsSkipped,
        items_failed: result.itemsFailed,
        error_message: result.errorMessage,
      })
      .eq('id', runId);

    if (error !== null) {
      throw new Error(`Connector-Lauf konnte nicht beendet werden: ${error.message}`);
    }
  }

  async hasRawImport(
    sourceId: string,
    externalId: string,
    payloadHash: string,
  ): Promise<boolean> {
    const { count, error } = await this.client
      .from('raw_imports')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', sourceId)
      .eq('external_id', externalId)
      .eq('payload_hash', payloadHash);

    if (error !== null) {
      throw new Error(`Rohdaten-Prüfung fehlgeschlagen: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  async insertRawImport(input: RawImportInput): Promise<RawImport> {
    const { data, error } = await this.client
      .from('raw_imports')
      .insert({
        source_id: input.sourceId,
        connector_run_id: input.connectorRunId,
        external_id: input.externalId,
        payload: input.payload,
        payload_hash: input.payloadHash,
        is_demo: input.isDemo,
      })
      .select('*')
      .single();

    if (error !== null) {
      throw new Error(`Rohdaten konnten nicht gespeichert werden: ${error.message}`);
    }

    const row = asRow<RawImportRow>(data);
    if (row === null) {
      throw new Error('Rohdaten konnten nicht gespeichert werden.');
    }

    return toRawImport(row);
  }

  async upsertAuthority(input: AuthorityUpsertInput): Promise<string> {
    const { data, error } = await this.client
      .from('contracting_authorities')
      .upsert(
        {
          source_id: input.sourceId,
          external_id: input.externalId,
          name: input.name,
          authority_type: input.authorityType,
          street: input.street,
          postal_code: input.postalCode,
          city: input.city,
          region_code: input.regionCode,
          country_code: input.countryCode,
          email: input.email,
          phone: input.phone,
          website: input.website,
          dedupe_key: input.dedupeKey,
          is_demo: input.isDemo,
        },
        { onConflict: 'source_id,external_id' },
      )
      .select('id')
      .single();

    if (error !== null) {
      throw new Error(`Auftraggeber konnte nicht gespeichert werden: ${error.message}`);
    }

    const row = asRow<{ id: string }>(data);
    if (row === null) {
      throw new Error('Auftraggeber konnte nicht gespeichert werden.');
    }

    return row.id;
  }

  async upsertTender(input: TenderUpsertInput): Promise<string> {
    const { draft } = input;

    const { data, error } = await this.client
      .from('tenders')
      .upsert(
        {
          source_id: input.sourceId,
          external_id: draft.externalId,
          raw_import_id: input.rawImportId,
          source_url: draft.sourceUrl,
          original_language: draft.originalLanguage,
          fingerprint: input.fingerprint,
          title: draft.title,
          summary: draft.summary,
          description: draft.description,
          reference_number: draft.referenceNumber,
          procurement_type: draft.procurementType,
          procedure_type: draft.procedureType,
          cpv_codes: draft.cpvCodes,
          sectors: draft.sectors,
          nuts_codes: draft.nutsCodes,
          country_code: draft.countryCode,
          region_code: draft.regionCode,
          city: draft.city,
          postal_code: draft.postalCode,
          contracting_authority_id: input.contractingAuthorityId,
          publication_date: draft.publicationDate,
          submission_deadline: draft.submissionDeadline,
          question_deadline: draft.questionDeadline,
          binding_period_end: draft.bindingPeriodEnd,
          contract_start: draft.contractStart,
          contract_end: draft.contractEnd,
          duration_months: draft.durationMonths,
          estimated_value_net: draft.estimatedValueNet,
          currency: draft.currency,
          status: draft.status,
          source_extras: draft.sourceExtras,
          is_demo: input.isDemo,
        },
        { onConflict: 'source_id,external_id' },
      )
      .select('id')
      .single();

    if (error !== null) {
      throw new Error(`Ausschreibung konnte nicht gespeichert werden: ${error.message}`);
    }

    const row = asRow<{ id: string }>(data);
    if (row === null) {
      throw new Error('Ausschreibung konnte nicht gespeichert werden.');
    }

    const tenderId = row.id;

    // Children are replaced wholesale: the raw import is authoritative, so a
    // re-import must not leave stale lots, requirements or documents behind.
    await Promise.all([
      this.client.from('tender_lots').delete().eq('tender_id', tenderId),
      this.client.from('tender_requirements').delete().eq('tender_id', tenderId),
      this.client
        .from('tender_documents')
        .delete()
        .eq('tender_id', tenderId)
        .eq('download_status', 'pending'),
    ]);

    if (draft.lots.length > 0) {
      await this.client.from('tender_lots').insert(
        draft.lots.map((lot) => ({
          tender_id: tenderId,
          lot_number: lot.lotNumber,
          title: lot.title,
          description: lot.description,
          estimated_value_net: lot.estimatedValueNet,
          cpv_codes: lot.cpvCodes,
        })),
      );
    }

    if (draft.requirements.length > 0) {
      await this.client.from('tender_requirements').insert(
        draft.requirements.map((requirement) => ({
          tender_id: tenderId,
          category: requirement.category,
          label: requirement.label,
          description: requirement.description,
          mandatory: requirement.mandatory,
          origin: 'source',
        })),
      );
    }

    if (draft.documents.length > 0) {
      await this.client.from('tender_documents').insert(
        draft.documents.map((document) => ({
          tender_id: tenderId,
          title: document.title,
          file_type: document.fileType,
          file_size_bytes: document.fileSizeBytes,
          source_url: document.sourceUrl,
          download_status: 'pending',
          is_demo: input.isDemo,
        })),
      );
    }

    return tenderId;
  }

  async upsertAward(input: AwardUpsertInput): Promise<string> {
    const { data, error } = await this.client
      .from('awards')
      .upsert(
        {
          source_id: input.sourceId,
          external_id: input.externalId,
          tender_id: input.tenderId,
          contracting_authority_id: input.contractingAuthorityId,
          winner_name: input.winnerName,
          winner_city: input.winnerCity,
          award_value_net: input.awardValueNet,
          currency: input.currency,
          award_date: input.awardDate,
          bidder_count: input.bidderCount,
          source_url: input.sourceUrl,
          is_demo: input.isDemo,
        },
        { onConflict: 'source_id,external_id' },
      )
      .select('id')
      .single();

    if (error !== null) {
      throw new Error(`Zuschlag konnte nicht gespeichert werden: ${error.message}`);
    }

    const row = asRow<{ id: string }>(data);
    if (row === null) {
      throw new Error('Zuschlag konnte nicht gespeichert werden.');
    }

    return row.id;
  }

  async recordNormalization(input: NormalizationRecordInput): Promise<void> {
    const { error } = await this.client.from('normalization_runs').insert({
      raw_import_id: input.rawImportId,
      source_id: input.sourceId,
      tender_id: input.tenderId,
      status: input.status,
      mapper_version: input.mapperVersion,
      error_message: input.errorMessage,
    });

    if (error !== null) {
      throw new Error(
        `Normalisierungsprotokoll konnte nicht geschrieben werden: ${error.message}`,
      );
    }
  }

  async recordDuplicateCandidates(
    tenderId: string,
    fingerprint: string,
  ): Promise<number> {
    const { data, error } = await this.client
      .from('tenders')
      .select('id')
      .eq('fingerprint', fingerprint)
      .neq('id', tenderId);

    if (error !== null) return 0;

    const matches = asRows<{ id: string }>(data);
    if (matches.length === 0) return 0;

    const { error: insertError } = await this.client
      .from('tender_duplicate_candidates')
      .upsert(
        matches.map((match) => ({
          tender_id: tenderId,
          duplicate_of_id: match.id,
          similarity_score: 1,
          detection_method: 'fingerprint',
          status: 'pending',
        })),
        { onConflict: 'tender_id,duplicate_of_id', ignoreDuplicates: true },
      );

    return insertError === null ? matches.length : 0;
  }
}
