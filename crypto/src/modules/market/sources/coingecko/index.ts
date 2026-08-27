/**
 * CoinGecko connector — fallback source when Binance is unreachable.
 *
 * The free API needs no key but is rate limited, so the pipeline treats it as
 * a secondary source rather than a drop-in replacement. OHLC granularity is
 * coarser than an exchange feed; the mapping picks the nearest supported
 * window and records what it actually asked for.
 */

import { z } from 'zod';

import { SourcePayloadError } from '@/lib/errors';
import { fetchJson } from '@/lib/http/fetch-json';
import type { MarketSource, Ticker, Timeframe } from '@/modules/market/types';

const SOURCE_ID = 'coingecko';
const BASE_URL = 'https://api.coingecko.com/api/v3';

/**
 * CoinGecko's OHLC endpoint takes a number of days and picks the candle width
 * itself: 1 day → 30 min candles, 7/14/30 days → 4 h, beyond that → daily.
 */
const DAYS_FOR_TIMEFRAME: Readonly<Record<Timeframe, number>> = {
  '5m': 1,
  '15m': 1,
  '1h': 7,
  '4h': 30,
  '1d': 180,
};

const marketSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  current_price: z.number(),
  price_change_percentage_24h: z.number().nullable(),
  high_24h: z.number().nullable(),
  low_24h: z.number().nullable(),
  total_volume: z.number().nullable(),
});

const marketsSchema = z.array(marketSchema);
const ohlcSchema = z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]));

export function createCoinGeckoSource(): MarketSource {
  return {
    sourceId: SOURCE_ID,
    label: 'CoinGecko',
    isPublic: true,
    isConfigured: () => true,

    async fetchTickers(assets) {
      if (assets.length === 0) return [];
      const ids = assets.map((asset) => asset.assetId).join(',');
      const payload = await fetchJson<unknown>(
        `${BASE_URL}/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`,
        { sourceId: SOURCE_ID },
      );

      const parsed = marketsSchema.safeParse(payload);
      if (!parsed.success) {
        throw new SourcePayloadError('Unerwartete Markt-Antwort von CoinGecko', {
          sourceId: SOURCE_ID,
        });
      }

      const byId = new Map(parsed.data.map((entry) => [entry.id, entry]));
      const fetchedAt = new Date().toISOString();

      const tickers: Ticker[] = [];
      for (const asset of assets) {
        const entry = byId.get(asset.assetId);
        if (!entry) continue;
        tickers.push({
          assetId: asset.assetId,
          symbol: asset.symbol,
          price: entry.current_price,
          change24h: (entry.price_change_percentage_24h ?? 0) / 100,
          high24h: entry.high_24h ?? entry.current_price,
          low24h: entry.low_24h ?? entry.current_price,
          quoteVolume24h: entry.total_volume ?? 0,
          sourceId: SOURCE_ID,
          externalId: entry.id,
          fetchedAt,
          isDemo: false,
        });
      }
      return tickers;
    },

    async fetchCandles(asset, timeframe, limit) {
      const days = DAYS_FOR_TIMEFRAME[timeframe];
      const payload = await fetchJson<unknown>(
        `${BASE_URL}/coins/${asset.assetId}/ohlc?vs_currency=usd&days=${days}`,
        { sourceId: SOURCE_ID },
      );

      const parsed = ohlcSchema.safeParse(payload);
      if (!parsed.success) {
        throw new SourcePayloadError('Unerwartete OHLC-Antwort von CoinGecko', {
          sourceId: SOURCE_ID,
          assetId: asset.assetId,
        });
      }

      // CoinGecko's OHLC endpoint carries no volume; the internal format keeps
      // the field, so it is reported as 0 rather than invented.
      const candles = parsed.data.slice(-limit).map((entry) => ({
        openTime: new Date(entry[0]).toISOString(),
        open: entry[1],
        high: entry[2],
        low: entry[3],
        close: entry[4],
        volume: 0,
      }));

      return {
        assetId: asset.assetId,
        symbol: asset.symbol,
        timeframe,
        candles,
        sourceId: SOURCE_ID,
        externalId: asset.assetId,
        fetchedAt: new Date().toISOString(),
        isDemo: false,
      };
    },
  };
}
