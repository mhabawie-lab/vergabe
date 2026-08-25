import 'server-only';

/**
 * Market data facade.
 *
 * The only market entry point for the analysis stages and the UI. It resolves
 * the configured source order and falls over to the next source when one is
 * unavailable, so a single broken exchange never blanks the app.
 */

import { toErrorMessage } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { marketSourceOrder } from '@/config';

import { createBinanceSource } from './sources/binance';
import { createCoinGeckoSource } from './sources/coingecko';
import { createDemoSource } from './sources/demo';
import type { Asset, CandleSeries, MarketSource, Ticker, Timeframe } from './types';

const FACTORIES: Readonly<Record<string, () => MarketSource>> = {
  binance: createBinanceSource,
  coingecko: createCoinGeckoSource,
  demo: createDemoSource,
};

function resolveSources(): readonly MarketSource[] {
  const sources: MarketSource[] = [];
  for (const id of marketSourceOrder()) {
    const factory = FACTORIES[id];
    if (!factory) {
      logger.warn('Unbekannte Marktquelle in der Konfiguration übersprungen', { sourceId: id });
      continue;
    }
    const source = factory();
    if (!source.isConfigured()) {
      logger.info('Marktquelle übersprungen: nicht konfiguriert', { sourceId: id });
      continue;
    }
    sources.push(source);
  }
  // The demo source is always available as a last resort so the UI can render.
  if (!sources.some((source) => source.sourceId === 'demo')) sources.push(createDemoSource());
  return sources;
}

export interface MarketResult<T> {
  readonly data: T;
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly isDemo: boolean;
  /** Sources that failed before this one answered, with their error messages. */
  readonly failures: readonly { sourceId: string; message: string }[];
}

async function withFailover<T>(
  stage: string,
  attempt: (source: MarketSource) => Promise<T>,
): Promise<MarketResult<T>> {
  const failures: { sourceId: string; message: string }[] = [];

  for (const source of resolveSources()) {
    try {
      const data = await attempt(source);
      if (failures.length > 0) {
        logger.warn('Marktdaten über Ersatzquelle geliefert', {
          stage,
          sourceId: source.sourceId,
          skipped: failures.length,
        });
      }
      return {
        data,
        sourceId: source.sourceId,
        sourceLabel: source.label,
        isDemo: source.sourceId === 'demo',
        failures,
      };
    } catch (error) {
      const message = toErrorMessage(error);
      failures.push({ sourceId: source.sourceId, message });
      logger.error('Marktquelle fehlgeschlagen, nächste wird versucht', {
        stage,
        sourceId: source.sourceId,
        reason: message,
      });
    }
  }

  // resolveSources always appends the demo source, so this is unreachable
  // unless the demo source itself throws — which would be a bug, not an outage.
  throw new Error(`Keine Marktquelle konnte ${stage} liefern`);
}

export function fetchTickers(assets: readonly Asset[]): Promise<MarketResult<readonly Ticker[]>> {
  return withFailover('tickers', (source) => source.fetchTickers(assets));
}

export function fetchCandles(
  asset: Asset,
  timeframe: Timeframe,
  limit = 200,
): Promise<MarketResult<CandleSeries>> {
  return withFailover('candles', (source) => source.fetchCandles(asset, timeframe, limit));
}
