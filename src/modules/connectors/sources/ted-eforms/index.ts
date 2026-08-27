/**
 * TED / EU eForms connector — the first live source.
 *
 * TED (Tenders Electronic Daily) publishes every EU-wide procurement notice
 * above the threshold. The connector fetches notices matching the configured
 * CPV scope and hands them on untouched: no field is renamed, no date is
 * parsed, no value is converted. All of that happens in the mapper
 * (`normalizer/mappers/ted-eforms.ts`).
 *
 * These records are real. Unlike the DEMO source, the registered source row
 * carries `is_demo = false`, so nothing produced here may ever be presented
 * as a demo record — or the other way round.
 */

import { ConnectorError } from '@/lib/errors';
import type { Logger } from '@/lib/logging';
import type {
  ConnectorContext,
  ConnectorFetchResult,
  ConnectorHealth,
  RawRecord,
  TenderConnector,
} from '../../core/types';
import { TedSearchClient } from './client';
import { parseTedConfig, type TedConfig } from './config';
import { TED_NOTICE_FIELDS } from './fields';
import { buildTedQuery } from './query';

export const TED_SOURCE_KEY = 'ted-eforms';

/**
 * Cursor format: `<records so far>:<TED scroll token>`.
 *
 * The counter travels in the cursor because `fetchBatch` is stateless by
 * contract — it is what lets the connector stop at `maxNoticesPerRun`
 * instead of walking a widened CPV scope to the end. TED's token is
 * base64 and never contains a colon, so the first one separates the two.
 */
function encodeCursor(fetched: number, token: string): string {
  return `${fetched}:${token}`;
}

function decodeCursor(cursor: string | null): { fetched: number; token: string | null } {
  if (cursor === null) return { fetched: 0, token: null };

  const separator = cursor.indexOf(':');
  if (separator === -1) return { fetched: 0, token: null };

  const fetched = Number.parseInt(cursor.slice(0, separator), 10);
  const token = cursor.slice(separator + 1);

  return {
    fetched: Number.isFinite(fetched) && fetched > 0 ? fetched : 0,
    token: token.length > 0 ? token : null,
  };
}

function readConfig(context: ConnectorContext): TedConfig {
  try {
    return parseTedConfig(context.source.config);
  } catch (error) {
    throw new ConnectorError(
      TED_SOURCE_KEY,
      `Die Konfiguration der Quelle "${context.source.key}" ist ungültig: ${
        error instanceof Error ? error.message : 'Unbekannter Fehler'
      }`,
      error,
    );
  }
}

function createClient(config: TedConfig, log: Logger): TedSearchClient {
  return new TedSearchClient({
    baseUrl: config.baseUrl,
    requestTimeoutMs: config.requestTimeoutMs,
    maxRetries: config.maxRetries,
    minRequestIntervalMs: config.minRequestIntervalMs,
    logger: log,
  });
}

/**
 * TED's own identifier for a notice, e.g. `479730-2026`.
 *
 * A correction is published under its own number, so this stays stable for
 * the life of a record and is what `raw_imports.external_id` holds.
 */
function readPublicationNumber(notice: Record<string, unknown>): string | null {
  const value = notice['publication-number'];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const tedEformsConnector: TenderConnector = {
  key: TED_SOURCE_KEY,
  sourceType: 'api',
  description:
    'Tenders Electronic Daily (TED) — EU-weite Vergabebekanntmachungen im eForms-Format. Echte Live-Daten, gefiltert nach den konfigurierten CPV-Codes.',

  async fetchBatch(
    context: ConnectorContext,
    cursor: string | null,
  ): Promise<ConnectorFetchResult> {
    context.signal.throwIfAborted();

    const config = readConfig(context);
    const { fetched, token } = decodeCursor(cursor);

    const remaining = config.maxNoticesPerRun - fetched;
    if (remaining <= 0) {
      context.logger.warn('Obergrenze für diesen Lauf erreicht', {
        maxNoticesPerRun: config.maxNoticesPerRun,
      });
      return { records: [], nextCursor: null };
    }

    const client = createClient(config, context.logger);
    const query = buildTedQuery(config);

    const response = await client.search(
      {
        query,
        fields: TED_NOTICE_FIELDS,
        limit: Math.min(config.pageSize, remaining),
        iterationNextToken: token,
      },
      context.signal,
    );

    const records: RawRecord[] = [];
    let withoutId = 0;

    for (const notice of response.notices) {
      const externalId = readPublicationNumber(notice);
      if (externalId === null) {
        // Nothing can be stored without a source identifier, and inventing
        // one would break provenance (CLAUDE.md § Rohdaten).
        withoutId += 1;
        continue;
      }
      records.push({ externalId, payload: notice });
    }

    if (withoutId > 0) {
      context.logger.warn('Bekanntmachungen ohne publication-number übersprungen', {
        skipped: withoutId,
      });
    }

    const totalFetched = fetched + response.notices.length;
    const exhausted =
      response.iterationNextToken === null ||
      response.notices.length === 0 ||
      totalFetched >= config.maxNoticesPerRun;

    context.logger.debug('TED-Batch geliefert', {
      returned: records.length,
      totalFetched,
      totalNoticeCount: response.totalNoticeCount,
    });

    return {
      records,
      nextCursor:
        exhausted || response.iterationNextToken === null
          ? null
          : encodeCursor(totalFetched, response.iterationNextToken),
    };
  },

  async healthCheck(context: ConnectorContext): Promise<ConnectorHealth> {
    const checkedAt = new Date().toISOString();
    const log = context.logger.child({ scope: 'connector:ted-eforms' });

    try {
      const config = readConfig(context);
      const client = createClient(config, log);

      // One notice is enough to prove the endpoint answers and the query is
      // accepted; a rejected query is exactly what this check should surface.
      const response = await client.search(
        {
          query: buildTedQuery(config),
          fields: ['publication-number'],
          limit: 1,
          iterationNextToken: null,
        },
        context.signal,
      );

      return {
        reachable: true,
        message: `TED erreichbar. ${response.totalNoticeCount} Bekanntmachungen im konfigurierten Suchfenster (${config.lookbackDays} Tage).`,
        checkedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      log.error('TED-Health-Check fehlgeschlagen', { error: message });
      return { reachable: false, message, checkedAt };
    }
  },
};

export { TED_DEFAULT_BASE_URL, TED_DEFAULT_CPV_CODES, parseTedConfig } from './config';
export { buildTedQuery } from './query';
export { TED_NOTICE_FIELDS } from './fields';
export type { TedConfig } from './config';
