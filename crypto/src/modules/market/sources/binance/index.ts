/**
 * Binance connector.
 *
 * Public market data only — no credentials, no order placement. Mapping into
 * the internal format happens in `toCandleSeries` / `toTicker` below and
 * nowhere else; no business logic lives in this module.
 */

import { z } from 'zod';

import { SourcePayloadError } from '@/lib/errors';
import { fetchJson } from '@/lib/http/fetch-json';
import type {
  Asset,
  CandleSeries,
  MarketSource,
  Ticker,
  Timeframe,
} from '@/modules/market/types';

const SOURCE_ID = 'binance';
const BASE_URL = 'https://api.binance.com/api/v3';
const QUOTE = 'USDT';

/** Binance interval codes for our internal timeframes. */
const INTERVALS: Readonly<Record<Timeframe, string>> = {
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
};

/**
 * A kline is a positional array. Only the first six positions are mapped;
 * the rest stay untouched in the raw response.
 */
const klineSchema = z.tuple([
  z.number(), // open time
  z.string(), // open
  z.string(), // high
  z.string(), // low
  z.string(), // close
  z.string(), // volume
]).rest(z.unknown());

const klinesSchema = z.array(klineSchema);

const tickerSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  priceChangePercent: z.string(),
  highPrice: z.string(),
  lowPrice: z.string(),
  quoteVolume: z.string(),
});

const tickersSchema = z.array(tickerSchema);

function marketSymbol(asset: Asset): string {
  return `${asset.symbol}${QUOTE}`;
}

function toNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new SourcePayloadError(`Feld ${field} ist keine Zahl`, { sourceId: SOURCE_ID, field });
  }
  return parsed;
}

export function createBinanceSource(): MarketSource {
  return {
    sourceId: SOURCE_ID,
    label: 'Binance',
    isPublic: true,
    isConfigured: () => true,

    async fetchTickers(assets) {
      if (assets.length === 0) return [];
      const symbols = assets.map(marketSymbol);
      const query = encodeURIComponent(JSON.stringify(symbols));
      const payload = await fetchJson<unknown>(`${BASE_URL}/ticker/24hr?symbols=${query}`, {
        sourceId: SOURCE_ID,
      });

      const parsed = tickersSchema.safeParse(payload);
      if (!parsed.success) {
        throw new SourcePayloadError('Unerwartete Ticker-Antwort von Binance', {
          sourceId: SOURCE_ID,
        });
      }

      const bySymbol = new Map(parsed.data.map((entry) => [entry.symbol, entry]));
      const fetchedAt = new Date().toISOString();

      const tickers: Ticker[] = [];
      for (const asset of assets) {
        const entry = bySymbol.get(marketSymbol(asset));
        if (!entry) continue;
        tickers.push({
          assetId: asset.assetId,
          symbol: asset.symbol,
          price: toNumber(entry.lastPrice, 'lastPrice'),
          // Binance reports percent, the internal format uses a fraction.
          change24h: toNumber(entry.priceChangePercent, 'priceChangePercent') / 100,
          high24h: toNumber(entry.highPrice, 'highPrice'),
          low24h: toNumber(entry.lowPrice, 'lowPrice'),
          quoteVolume24h: toNumber(entry.quoteVolume, 'quoteVolume'),
          sourceId: SOURCE_ID,
          externalId: entry.symbol,
          fetchedAt,
          isDemo: false,
        });
      }
      return tickers;
    },

    async fetchCandles(asset, timeframe, limit) {
      const symbol = marketSymbol(asset);
      const interval = INTERVALS[timeframe];
      const payload = await fetchJson<unknown>(
        `${BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        { sourceId: SOURCE_ID },
      );

      const parsed = klinesSchema.safeParse(payload);
      if (!parsed.success) {
        throw new SourcePayloadError('Unerwartete Kline-Antwort von Binance', {
          sourceId: SOURCE_ID,
          symbol,
        });
      }

      const series: CandleSeries = {
        assetId: asset.assetId,
        symbol: asset.symbol,
        timeframe,
        candles: parsed.data.map((kline) => ({
          openTime: new Date(kline[0]).toISOString(),
          open: toNumber(kline[1], 'open'),
          high: toNumber(kline[2], 'high'),
          low: toNumber(kline[3], 'low'),
          close: toNumber(kline[4], 'close'),
          volume: toNumber(kline[5], 'volume'),
        })),
        sourceId: SOURCE_ID,
        externalId: symbol,
        fetchedAt: new Date().toISOString(),
        isDemo: false,
      };
      return series;
    },
  };
}
