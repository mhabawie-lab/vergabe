import 'server-only';

/**
 * Analysis orchestration.
 *
 * Runs the pipeline stages in order and hands the UI one finished picture:
 *
 *   market data + social posts → sentiment → signals → ranking
 *
 * The UI never calls a connector itself. It reads what this module produces,
 * so a source change is invisible above this line.
 */

import { toErrorMessage } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { fetchCandles, fetchTickers } from '@/modules/market/service';
import type { Asset, Candle, CandleSeries, Ticker, Timeframe } from '@/modules/market/types';
import { ASSETS } from '@/modules/market/universe';
import { aggregateSentiment, findAssetSentiment } from '@/modules/sentiment/aggregate';
import type { AssetSentiment } from '@/modules/sentiment/aggregate';
import { fetchSocialFeed } from '@/modules/social/service';
import type { SocialSourceStatus } from '@/modules/social/service';
import type { SocialPost } from '@/modules/social/types';
import { buildSignal, rankSignals } from '@/modules/signals/engine';
import type { Signal } from '@/modules/signals/types';

export interface RadarResult {
  readonly signals: readonly Signal[];
  /** Recent candles per symbol, for the inline price traces in the radar table. */
  readonly sparklines: Readonly<Record<string, readonly Candle[]>>;
  readonly sentiments: readonly AssetSentiment[];
  readonly posts: readonly SocialPost[];
  readonly socialStatus: readonly SocialSourceStatus[];
  readonly marketSourceId: string;
  readonly marketSourceLabel: string;
  readonly marketIsDemo: boolean;
  readonly timeframe: Timeframe;
  readonly evaluatedAt: string;
  /** Assets whose candles could not be loaded at all, with the reason. */
  readonly skippedAssets: readonly { symbol: string; reason: string }[];
}

const SOCIAL_POST_LIMIT = 100;

export async function buildRadar(timeframe: Timeframe = '1h'): Promise<RadarResult> {
  const runLogger = logger.child({ stage: 'radar', timeframe });

  // Market and social ingestion are independent; running them together keeps
  // the page fast and one failing side does not delay the other.
  const [tickerResult, socialResult] = await Promise.all([
    fetchTickers(ASSETS),
    fetchSocialFeed({
      symbols: ASSETS.map((asset) => asset.symbol),
      limit: SOCIAL_POST_LIMIT,
    }),
  ]);

  const tickers = new Map<string, Ticker>(
    tickerResult.data.map((ticker) => [ticker.symbol, ticker]),
  );
  const sentiments = aggregateSentiment(socialResult.posts);

  const candleResults = await Promise.allSettled(
    ASSETS.map(async (asset) => ({ asset, result: await fetchCandles(asset, timeframe, 200) })),
  );

  const signals: Signal[] = [];
  const sparklines: Record<string, readonly Candle[]> = {};
  const skippedAssets: { symbol: string; reason: string }[] = [];

  for (const [index, entry] of candleResults.entries()) {
    const asset = ASSETS[index];
    if (!asset) continue;

    if (entry.status === 'rejected') {
      const reason = toErrorMessage(entry.reason);
      runLogger.error('Kursdaten für Asset nicht verfügbar', { asset: asset.symbol, reason });
      skippedAssets.push({ symbol: asset.symbol, reason });
      continue;
    }

    const series: CandleSeries = entry.value.result.data;
    if (series.candles.length === 0) {
      skippedAssets.push({ symbol: asset.symbol, reason: 'Quelle lieferte keine Kerzen.' });
      continue;
    }

    sparklines[asset.symbol] = series.candles.slice(-48);
    signals.push(
      buildSignal({
        asset,
        series,
        ticker: tickers.get(asset.symbol),
        sentiment: findAssetSentiment(sentiments, asset.symbol),
      }),
    );
  }

  return {
    signals: rankSignals(signals),
    sparklines,
    sentiments,
    posts: socialResult.posts,
    socialStatus: socialResult.sourceStatus,
    marketSourceId: tickerResult.sourceId,
    marketSourceLabel: tickerResult.sourceLabel,
    marketIsDemo: tickerResult.isDemo,
    timeframe,
    evaluatedAt: new Date().toISOString(),
    skippedAssets,
  };
}

export interface AssetDetail {
  readonly asset: Asset;
  readonly series: CandleSeries;
  readonly ticker: Ticker | undefined;
  readonly signal: Signal;
  readonly sentiment: AssetSentiment | undefined;
  readonly posts: readonly SocialPost[];
  readonly marketSourceLabel: string;
}

export async function buildAssetDetail(
  asset: Asset,
  timeframe: Timeframe = '1h',
): Promise<AssetDetail> {
  const [candleResult, tickerResult, socialResult] = await Promise.all([
    fetchCandles(asset, timeframe, 200),
    fetchTickers([asset]),
    fetchSocialFeed({ symbols: [asset.symbol], limit: SOCIAL_POST_LIMIT }),
  ]);

  const posts = socialResult.posts.filter((post) => post.assetSymbols.includes(asset.symbol));
  const sentiments = aggregateSentiment(posts);
  const sentiment = findAssetSentiment(sentiments, asset.symbol);
  const ticker = tickerResult.data[0];

  return {
    asset,
    series: candleResult.data,
    ticker,
    signal: buildSignal({ asset, series: candleResult.data, ticker, sentiment }),
    sentiment,
    posts,
    marketSourceLabel: candleResult.sourceLabel,
  };
}

/** Latest quoted prices by symbol — used to value the paper portfolio. */
export async function fetchPriceMap(): Promise<{
  prices: ReadonlyMap<string, number>;
  isDemo: boolean;
}> {
  const result = await fetchTickers(ASSETS);
  return {
    prices: new Map(result.data.map((ticker) => [ticker.symbol, ticker.price])),
    isDemo: result.isDemo,
  };
}
