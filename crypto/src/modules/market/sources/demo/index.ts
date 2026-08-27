/**
 * Demo market source — deterministic synthetic prices.
 *
 * Exists so the app is usable without network access or credentials. Every
 * record it produces carries `isDemo: true` and the UI must show a DEMO badge
 * for it. Synthetic prices must never be presented as live market data.
 */

import type {
  Asset,
  Candle,
  CandleSeries,
  MarketSource,
  Ticker,
  Timeframe,
} from '@/modules/market/types';
import { TIMEFRAME_MINUTES } from '@/modules/market/types';

const SOURCE_ID = 'demo';

/** Rough starting prices so the demo data sits in a familiar range. */
const BASE_PRICES: Readonly<Record<string, number>> = {
  BTC: 64_000,
  ETH: 3_100,
  SOL: 145,
  XRP: 0.52,
  ADA: 0.45,
  DOGE: 0.12,
  AVAX: 28,
  LINK: 14.5,
  DOT: 6.4,
  LTC: 72,
};

/**
 * Deterministic pseudo-random generator (mulberry32). A fixed seed per asset
 * and timeframe keeps demo charts stable across reloads, which makes the demo
 * mode usable for judging the UI rather than a new random walk every render.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function seedFor(input: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * Length of the generated history. Always the same regardless of how many
 * candles the caller wants, so a 24-candle ticker and a 200-candle chart are
 * the tail of one identical price path instead of two diverging walks.
 */
const HISTORY_LENGTH = 400;

function buildCandles(asset: Asset, timeframe: Timeframe, limit: number): Candle[] {
  const random = mulberry32(seedFor(`${asset.symbol}:${timeframe}`));
  const basePrice = BASE_PRICES[asset.symbol] ?? 10;
  const stepMs = TIMEFRAME_MINUTES[timeframe] * 60_000;

  // Anchor the last candle to the current bucket so the chart ends "now".
  const end = Math.floor(Date.now() / stepMs) * stepMs;
  const candles: Candle[] = [];
  let price = basePrice;

  for (let i = HISTORY_LENGTH - 1; i >= 0; i -= 1) {
    // Mild drift plus noise, scaled to the candle width.
    const volatility = 0.004 * Math.sqrt(TIMEFRAME_MINUTES[timeframe] / 60);
    const drift = (random() - 0.48) * volatility;
    const open = price;
    const close = Math.max(open * (1 + drift), open * 0.5);
    const high = Math.max(open, close) * (1 + random() * volatility * 0.6);
    const low = Math.min(open, close) * (1 - random() * volatility * 0.6);
    const volume = (0.5 + random()) * basePrice * 120;

    candles.push({
      openTime: new Date(end - i * stepMs).toISOString(),
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }

  return candles.slice(-limit);
}

export function createDemoSource(): MarketSource {
  return {
    sourceId: SOURCE_ID,
    label: 'Demo (synthetische Daten)',
    isPublic: true,
    isConfigured: () => true,

    async fetchTickers(assets) {
      const fetchedAt = new Date().toISOString();
      return assets.map((asset) => {
        const candles = buildCandles(asset, '1h', 24);
        const last = candles.at(-1);
        const first = candles[0];
        const price = last?.close ?? BASE_PRICES[asset.symbol] ?? 10;
        const open = first?.open ?? price;
        return {
          assetId: asset.assetId,
          symbol: asset.symbol,
          price,
          change24h: open === 0 ? 0 : (price - open) / open,
          high24h: Math.max(...candles.map((candle) => candle.high)),
          low24h: Math.min(...candles.map((candle) => candle.low)),
          quoteVolume24h: candles.reduce((sum, candle) => sum + candle.volume, 0),
          sourceId: SOURCE_ID,
          externalId: `demo:${asset.symbol}`,
          fetchedAt,
          isDemo: true,
        } satisfies Ticker;
      });
    },

    async fetchCandles(asset, timeframe, limit) {
      return {
        assetId: asset.assetId,
        symbol: asset.symbol,
        timeframe,
        candles: buildCandles(asset, timeframe, limit),
        sourceId: SOURCE_ID,
        externalId: `demo:${asset.symbol}`,
        fetchedAt: new Date().toISOString(),
        isDemo: true,
      } satisfies CandleSeries;
    },
  };
}
