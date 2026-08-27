/**
 * Internal market data format.
 *
 * Every source is normalised into these shapes. Source-specific extras belong
 * in `raw`, never in new source-specific fields — the analysis stages read this
 * format only and must not know which exchange a candle came from.
 */

export type Timeframe = '5m' | '15m' | '1h' | '4h' | '1d';

export const TIMEFRAMES: readonly Timeframe[] = ['5m', '15m', '1h', '4h', '1d'] as const;

export const TIMEFRAME_LABELS: Readonly<Record<Timeframe, string>> = {
  '5m': '5 Minuten',
  '15m': '15 Minuten',
  '1h': '1 Stunde',
  '4h': '4 Stunden',
  '1d': '1 Tag',
};

/** Minutes per timeframe — used to derive lookback windows. */
export const TIMEFRAME_MINUTES: Readonly<Record<Timeframe, number>> = {
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
};

export interface Candle {
  /** Open time as an ISO 8601 timestamp. */
  readonly openTime: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface CandleSeries {
  readonly assetId: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  /** Ascending by time — oldest first. */
  readonly candles: readonly Candle[];
  readonly sourceId: string;
  /** The source's own identifier for this market, kept for traceability. */
  readonly externalId: string;
  readonly fetchedAt: string;
  readonly isDemo: boolean;
}

export interface Ticker {
  readonly assetId: string;
  readonly symbol: string;
  readonly price: number;
  /** Price change over the last 24 h as a fraction, e.g. 0.043 for +4,3 %. */
  readonly change24h: number;
  readonly high24h: number;
  readonly low24h: number;
  /** Quote-currency volume over the last 24 h. */
  readonly quoteVolume24h: number;
  readonly sourceId: string;
  readonly externalId: string;
  readonly fetchedAt: string;
  readonly isDemo: boolean;
}

/**
 * A tradeable asset in the internal universe.
 *
 * `assetId` is our own stable identifier; `externalId` per source stays with
 * the data that came from that source.
 */
export interface Asset {
  readonly assetId: string;
  /** Ticker symbol without the quote currency, e.g. `BTC`. */
  readonly symbol: string;
  readonly name: string;
}

export interface MarketSource {
  readonly sourceId: string;
  readonly label: string;
  /** True when the source needs no credentials at all. */
  readonly isPublic: boolean;
  /** Reports whether this source can run right now (credentials present). */
  isConfigured(): boolean;
  fetchTickers(assets: readonly Asset[]): Promise<readonly Ticker[]>;
  fetchCandles(asset: Asset, timeframe: Timeframe, limit: number): Promise<CandleSeries>;
}
