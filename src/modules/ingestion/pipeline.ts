/**
 * The ingestion runner.
 *
 * Drives one source through the pipeline:
 *
 *   CONNECTOR → RAW IMPORT → NORMALIZER → DATABASE
 *
 * Guarantees this runner is responsible for:
 *  - raw payloads are stored before anything interprets them;
 *  - an unchanged payload is skipped instead of reprocessed;
 *  - one bad record fails that record only, never the run;
 *  - one failing source never blocks the others;
 *  - every outcome is recorded in connector_runs / normalization_runs, so a
 *    failure is visible in the admin view rather than silent.
 */

import { getConnector } from '@/modules/connectors/core/registry';
import type { ConnectorContext } from '@/modules/connectors/core/types';
import {
  buildAuthorityDedupeKey,
  buildTenderFingerprint,
  hashPayload,
} from '@/modules/ingestion/dedupe/fingerprint';
import { getMapper, normalize } from '@/modules/ingestion/normalizer';
import { ConnectorError, toErrorMessage } from '@/lib/errors';
import { logger } from '@/lib/logging';
import type { ConnectorRunResult, IngestionStore } from '@/lib/db/ports';
import type { Source } from '@/types/source';

/** Safety valve so a paginating connector cannot loop forever. */
const MAX_BATCHES_PER_RUN = 200;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface IngestSourceOptions {
  /** Aborts the run after this many milliseconds. */
  timeoutMs?: number;
  /** Stops after this many records. Useful for a smoke run. */
  maxRecords?: number;
}

export interface IngestSourceReport {
  sourceKey: string;
  connectorRunId: string;
  itemsFound: number;
  itemsImported: number;
  itemsSkipped: number;
  itemsFailed: number;
  duplicateCandidates: number;
  status: ConnectorRunResult['status'];
  errorMessage: string | null;
  durationMs: number;
}

/**
 * Runs one source end to end.
 *
 * Never throws for per-record problems — those are counted and recorded. It
 * throws only when the run cannot be started at all (unknown source, missing
 * connector).
 */
export async function ingestSource(
  store: IngestionStore,
  source: Source,
  options: IngestSourceOptions = {},
): Promise<IngestSourceReport> {
  const startedAt = Date.now();
  const runLogger = logger.child({
    scope: 'ingestion',
    sourceKey: source.key,
  });

  const connector = getConnector(source.key);
  if (connector === undefined) {
    throw new ConnectorError(
      source.key,
      `Für die Quelle "${source.key}" ist kein Connector registriert.`,
    );
  }

  const mapper = getMapper(source.key);
  if (mapper === undefined) {
    throw new ConnectorError(
      source.key,
      `Für die Quelle "${source.key}" ist kein Mapper registriert.`,
    );
  }

  const run = await store.startConnectorRun(source.id);
  const scopedLogger = runLogger.child({ connectorRunId: run.id });
  scopedLogger.info('Connector-Lauf gestartet');

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const context: ConnectorContext = {
    source,
    logger: scopedLogger,
    signal: controller.signal,
  };

  let itemsFound = 0;
  let itemsImported = 0;
  let itemsSkipped = 0;
  let itemsFailed = 0;
  let duplicateCandidates = 0;
  let runError: string | null = null;

  try {
    let cursor: string | null = null;
    let batchCount = 0;

    do {
      const batch = await connector.fetchBatch(context, cursor);
      batchCount += 1;

      for (const record of batch.records) {
        if (options.maxRecords !== undefined && itemsFound >= options.maxRecords) {
          break;
        }
        itemsFound += 1;

        const recordLogger = scopedLogger.child({ externalId: record.externalId });

        try {
          // --- RAW IMPORT -------------------------------------------------
          const payloadHash = hashPayload(record.payload);

          const alreadyImported = await store.hasRawImport(
            source.id,
            record.externalId,
            payloadHash,
          );

          if (alreadyImported) {
            itemsSkipped += 1;
            recordLogger.debug('Unveränderter Datensatz übersprungen');
            continue;
          }

          const rawImport = await store.insertRawImport({
            sourceId: source.id,
            connectorRunId: run.id,
            externalId: record.externalId,
            payload: record.payload,
            payloadHash,
            isDemo: source.isDemo,
          });

          // --- NORMALIZER -------------------------------------------------
          try {
            const draft = normalize(source.key, rawImport.id, record.payload, {
              sourceKey: source.key,
              logger: recordLogger,
            });

            // --- DATABASE -------------------------------------------------
            let authorityId: string | null = null;
            if (draft.authority !== null) {
              authorityId = await store.upsertAuthority({
                sourceId: source.id,
                externalId: draft.authority.externalId,
                name: draft.authority.name,
                authorityType: draft.authority.authorityType,
                street: draft.authority.street,
                postalCode: draft.authority.postalCode,
                city: draft.authority.city,
                regionCode: draft.authority.regionCode,
                countryCode: draft.authority.countryCode,
                email: draft.authority.email,
                phone: draft.authority.phone,
                website: draft.authority.website,
                dedupeKey: buildAuthorityDedupeKey(
                  draft.authority.name,
                  draft.authority.city,
                ),
                isDemo: source.isDemo,
              });
            }

            const fingerprint = buildTenderFingerprint({
              title: draft.title,
              authorityName: draft.authority?.name ?? null,
              submissionDeadline: draft.submissionDeadline,
              estimatedValueNet: draft.estimatedValueNet,
            });

            const tenderId = await store.upsertTender({
              sourceId: source.id,
              rawImportId: rawImport.id,
              contractingAuthorityId: authorityId,
              fingerprint,
              isDemo: source.isDemo,
              draft,
            });

            if (draft.award !== null) {
              await store.upsertAward({
                sourceId: source.id,
                tenderId,
                contractingAuthorityId: authorityId,
                externalId: draft.award.externalId,
                winnerName: draft.award.winnerName,
                winnerCity: draft.award.winnerCity,
                awardValueNet: draft.award.awardValueNet,
                currency: draft.award.currency,
                awardDate: draft.award.awardDate,
                bidderCount: draft.award.bidderCount,
                sourceUrl: draft.award.sourceUrl,
                isDemo: source.isDemo,
              });
            }

            duplicateCandidates += await store.recordDuplicateCandidates(
              tenderId,
              fingerprint,
            );

            await store.recordNormalization({
              rawImportId: rawImport.id,
              sourceId: source.id,
              tenderId,
              status: 'success',
              mapperVersion: mapper.version,
              errorMessage: null,
            });

            itemsImported += 1;
            recordLogger.debug('Datensatz importiert', { tenderId });
          } catch (normalizationError) {
            // The raw payload is already stored, so this record can be
            // reprocessed once the mapper is fixed — no refetch needed.
            itemsFailed += 1;
            const message = toErrorMessage(normalizationError);

            await store.recordNormalization({
              rawImportId: rawImport.id,
              sourceId: source.id,
              tenderId: null,
              status: 'failed',
              mapperVersion: mapper.version,
              errorMessage: message,
            });

            recordLogger.error('Normalisierung fehlgeschlagen', {
              rawImportId: rawImport.id,
              error: message,
            });
          }
        } catch (recordError) {
          itemsFailed += 1;
          recordLogger.error('Datensatz konnte nicht verarbeitet werden', {
            error: toErrorMessage(recordError),
          });
        }
      }

      cursor = batch.nextCursor;

      if (batchCount >= MAX_BATCHES_PER_RUN) {
        scopedLogger.warn('Maximale Batch-Anzahl erreicht, Lauf wird beendet', {
          batchCount,
        });
        break;
      }

      if (options.maxRecords !== undefined && itemsFound >= options.maxRecords) {
        break;
      }
    } while (cursor !== null);
  } catch (error) {
    runError = toErrorMessage(error);
    scopedLogger.error('Connector-Lauf abgebrochen', { error: runError });
  } finally {
    clearTimeout(timeout);
  }

  const status: ConnectorRunResult['status'] =
    runError !== null
      ? 'failed'
      : itemsFailed > 0
        ? 'partial'
        : 'success';

  await store.finishConnectorRun(run.id, {
    status,
    itemsFound,
    itemsImported,
    itemsSkipped,
    itemsFailed,
    errorMessage: runError,
  });

  const durationMs = Date.now() - startedAt;
  scopedLogger.info('Connector-Lauf beendet', {
    status,
    itemsFound,
    itemsImported,
    itemsSkipped,
    itemsFailed,
    durationMs,
  });

  return {
    sourceKey: source.key,
    connectorRunId: run.id,
    itemsFound,
    itemsImported,
    itemsSkipped,
    itemsFailed,
    duplicateCandidates,
    status,
    errorMessage: runError,
    durationMs,
  };
}

/**
 * Runs every active source.
 *
 * Sources are isolated from one another: a failing connector is logged and
 * the loop continues (CLAUDE.md § Connectors).
 */
export async function ingestAllActiveSources(
  store: IngestionStore,
  options: IngestSourceOptions = {},
): Promise<IngestSourceReport[]> {
  const sources = await store.listActiveSources();
  const reports: IngestSourceReport[] = [];

  for (const source of sources) {
    try {
      reports.push(await ingestSource(store, source, options));
    } catch (error) {
      logger.error('Quelle konnte nicht verarbeitet werden', {
        scope: 'ingestion',
        sourceKey: source.key,
        error: toErrorMessage(error),
      });
      reports.push({
        sourceKey: source.key,
        connectorRunId: '',
        itemsFound: 0,
        itemsImported: 0,
        itemsSkipped: 0,
        itemsFailed: 0,
        duplicateCandidates: 0,
        status: 'failed',
        errorMessage: toErrorMessage(error),
        durationMs: 0,
      });
    }
  }

  return reports;
}
