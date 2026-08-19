/**
 * DEMO connector.
 *
 * Serves synthetic records from a local fixture set. It exists so the full
 * pipeline — connector, raw import, normalizer, database, UI — can be run and
 * verified before any live source is connected in phase 2.
 *
 * It reaches no network and produces no data that could be mistaken for a
 * real tender: the registered source is flagged `is_demo`, and a database
 * trigger rejects any derived record that is not flagged the same way.
 */

import { logger } from '@/lib/logging';
import type {
  ConnectorContext,
  ConnectorFetchResult,
  ConnectorHealth,
  RawRecord,
  TenderConnector,
} from '../../core/types';
import { buildDemoPayloads } from './fixtures';

/** Page size, deliberately small so pagination is exercised in development. */
const BATCH_SIZE = 5;

function parseCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  const offset = Number.parseInt(cursor, 10);
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

export const demoConnector: TenderConnector = {
  key: 'demo',
  sourceType: 'manual',
  description:
    'Synthetische Beispieldaten für Entwicklung und Abnahme. Keine echten Ausschreibungen.',

  async fetchBatch(
    context: ConnectorContext,
    cursor: string | null,
  ): Promise<ConnectorFetchResult> {
    context.signal.throwIfAborted();

    const payloads = buildDemoPayloads();
    const offset = parseCursor(cursor);
    const page = payloads.slice(offset, offset + BATCH_SIZE);

    const records: RawRecord[] = page.map((payload) => ({
      externalId: payload.vergabe_id,
      // Cast rather than restructure: the payload is persisted verbatim.
      payload: payload as unknown as Record<string, unknown>,
    }));

    const nextOffset = offset + page.length;
    const hasMore = nextOffset < payloads.length;

    context.logger.debug('Demo-Batch geliefert', {
      offset,
      returned: records.length,
      total: payloads.length,
    });

    return {
      records,
      nextCursor: hasMore ? String(nextOffset) : null,
    };
  },

  async healthCheck(): Promise<ConnectorHealth> {
    const count = buildDemoPayloads().length;
    logger.debug('Demo-Connector Health-Check', { scope: 'connector:demo', count });

    return {
      reachable: true,
      message: `${count} DEMO-Datensätze verfügbar (lokale Fixtures, kein Netzwerkzugriff).`,
      checkedAt: new Date().toISOString(),
    };
  },
};

export { buildDemoPayloads };
export type { DemoTenderPayload } from './fixtures';
