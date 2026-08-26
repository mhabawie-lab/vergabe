import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { getIngestionStore } from '@/lib/db/ingestion';
import { env } from '@/lib/env';
import { ConfigurationError, NotFoundError, UnauthenticatedError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { ingestAllActiveSources, ingestSource } from '@/modules/ingestion/pipeline';

export const dynamic = 'force-dynamic';
/** Ingestion can outlast the default handler budget. */
export const maxDuration = 300;

/**
 * POST /api/v1/internal/ingestion/run
 *
 * Triggers the ingestion pipeline. Intended for a scheduler, not for
 * browsers: it authenticates with a shared secret and is excluded from the
 * session proxy (src/proxy.ts).
 *
 *   Authorization: Bearer <INGESTION_TRIGGER_SECRET>
 *   Body (optional): { "sourceKey": "demo" }
 *
 * Without a source key every active source runs. One failing source never
 * blocks the others.
 */

function assertAuthorized(request: NextRequest): void {
  const expected = env.ingestionTriggerSecret;
  if (expected === undefined) {
    throw new ConfigurationError(
      'INGESTION_TRIGGER_SECRET ist nicht gesetzt. Der Import-Endpunkt ist deaktiviert.',
    );
  }

  const header = request.headers.get('authorization');
  const provided = header?.startsWith('Bearer ') === true ? header.slice(7) : '';

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  // Constant-time compare; equal lengths are required by timingSafeEqual.
  const matches =
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);

  if (!matches) {
    throw new UnauthenticatedError('Ungültiges oder fehlendes Import-Token.');
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAuthorized(request);

    let sourceKey: string | undefined;
    try {
      const body: unknown = await request.json();
      if (body !== null && typeof body === 'object' && 'sourceKey' in body) {
        const value = (body as { sourceKey: unknown }).sourceKey;
        if (typeof value === 'string' && value.trim().length > 0) {
          sourceKey = value.trim();
        }
      }
    } catch {
      // An empty or unparsable body means "run every active source".
    }

    const store = getIngestionStore();

    if (sourceKey === undefined) {
      logger.info('Import für alle aktiven Quellen angestoßen', {
        scope: 'api:ingestion',
      });
      const reports = await ingestAllActiveSources(store);
      return apiSuccess({ reports });
    }

    const source = await store.getSourceByKey(sourceKey);
    if (source === null) {
      throw new NotFoundError('Quelle', sourceKey);
    }

    logger.info('Import für eine Quelle angestoßen', {
      scope: 'api:ingestion',
      sourceKey,
    });
    const report = await ingestSource(store, source);
    return apiSuccess({ reports: [report] });
  } catch (error) {
    return handleApiError(error, 'api:ingestion');
  }
}
