import { describe, expect, it } from 'vitest';

import type { Asset, Candle, CandleSeries } from '@/modules/market/types';
import type { AssetSentiment } from '@/modules/sentiment/aggregate';
import { buildSignal, rankSignals } from '@/modules/signals/engine';

const ASSET: Asset = { assetId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' };

function series(closes: readonly number[], isDemo = false): CandleSeries {
  const candles: Candle[] = closes.map((close, index) => ({
    openTime: new Date(2024, 0, 1, index).toISOString(),
    open: close,
    high: close * 1.005,
    low: close * 0.995,
    close,
    volume: 100,
  }));
  return {
    assetId: ASSET.assetId,
    symbol: ASSET.symbol,
    timeframe: '1h',
    candles,
    sourceId: 'test',
    externalId: 'BTCUSDT',
    fetchedAt: new Date().toISOString(),
    isDemo,
  };
}

function uptrend(length = 120): readonly number[] {
  return Array.from({ length }, (_, i) => 100 * 1.004 ** i);
}

function downtrend(length = 120): readonly number[] {
  return Array.from({ length }, (_, i) => 100 * 0.996 ** i);
}

function sentiment(overrides: Partial<AssetSentiment> = {}): AssetSentiment {
  return {
    symbol: 'BTC',
    score: 0,
    confidence: 0.5,
    mentionCount: 20,
    spamCount: 0,
    mentionShare: 0.5,
    buzzRatio: 1,
    topPosts: [],
    ...overrides,
  };
}

describe('buildSignal', () => {
  it('scores an uptrend above a downtrend', () => {
    const up = buildSignal({
      asset: ASSET,
      series: series(uptrend()),
      ticker: undefined,
      sentiment: sentiment(),
    });
    const down = buildSignal({
      asset: ASSET,
      series: series(downtrend()),
      ticker: undefined,
      sentiment: sentiment(),
    });
    expect(up.score).toBeGreaterThan(down.score);
  });

  it('always states the reasons behind the score', () => {
    const signal = buildSignal({
      asset: ASSET,
      series: series(uptrend()),
      ticker: undefined,
      sentiment: sentiment(),
    });
    expect(signal.reasons.length).toBeGreaterThan(0);
    expect(signal.reasons.every((reason) => reason.detail.length > 0)).toBe(true);
  });

  it('lets sentiment tilt the score but never dominate it', () => {
    const base = buildSignal({
      asset: ASSET,
      series: series(downtrend()),
      ticker: undefined,
      sentiment: sentiment({ score: 0 }),
    });
    const hyped = buildSignal({
      asset: ASSET,
      series: series(downtrend()),
      ticker: undefined,
      sentiment: sentiment({ score: 1, confidence: 1 }),
    });
    expect(hyped.score).toBeGreaterThan(base.score);
    // A perfect mood reading must not turn a broken chart into a buy.
    expect(hyped.verdict).not.toBe('KAUFEN');
  });

  it('warns instead of rewarding when buzz spikes without chart support', () => {
    const signal = buildSignal({
      asset: ASSET,
      series: series(downtrend()),
      ticker: undefined,
      sentiment: sentiment({ buzzRatio: 4, score: 0.8, confidence: 0.6 }),
    });
    expect(signal.warnings.some((warning) => warning.includes('Hype'))).toBe(true);
  });

  it('refuses a buy verdict when confidence is too low', () => {
    // A strong chart but a history far too short for the slow indicators.
    const signal = buildSignal({
      asset: ASSET,
      series: series(uptrend(30)),
      ticker: undefined,
      sentiment: undefined,
    });
    expect(signal.confidence).toBeLessThan(0.5);
    expect(signal.verdict).not.toBe('KAUFEN');
  });

  it('warns when the sample is too small to mean anything', () => {
    const signal = buildSignal({
      asset: ASSET,
      series: series(uptrend()),
      ticker: undefined,
      sentiment: sentiment({ mentionCount: 2 }),
    });
    expect(signal.warnings.some((warning) => warning.includes('statistisch wertlos'))).toBe(true);
  });

  it('warns when the chatter is heavily manipulated', () => {
    const signal = buildSignal({
      asset: ASSET,
      series: series(uptrend()),
      ticker: undefined,
      sentiment: sentiment({ mentionCount: 10, spamCount: 6 }),
    });
    expect(signal.warnings.some((warning) => warning.includes('manipuliert'))).toBe(true);
  });

  it('marks demo-based signals so they cannot pass as live', () => {
    const signal = buildSignal({
      asset: ASSET,
      series: series(uptrend(), true),
      ticker: undefined,
      sentiment: sentiment(),
    });
    expect(signal.isDemo).toBe(true);
    expect(signal.warnings.some((warning) => warning.includes('DEMO'))).toBe(true);
  });

  it('keeps the score inside the 0–100 range', () => {
    for (const closes of [uptrend(), downtrend()]) {
      const signal = buildSignal({
        asset: ASSET,
        series: series(closes),
        ticker: undefined,
        sentiment: sentiment({ score: 1, confidence: 1, buzzRatio: 6 }),
      });
      expect(signal.score).toBeGreaterThanOrEqual(0);
      expect(signal.score).toBeLessThanOrEqual(100);
    }
  });
});

describe('rankSignals', () => {
  it('puts the higher score first and breaks ties on confidence', () => {
    const base = buildSignal({
      asset: ASSET,
      series: series(uptrend()),
      ticker: undefined,
      sentiment: sentiment(),
    });
    const ranked = rankSignals([
      { ...base, score: 40, confidence: 0.9 },
      { ...base, score: 70, confidence: 0.2 },
      { ...base, score: 70, confidence: 0.8 },
    ]);
    expect(ranked[0]?.score).toBe(70);
    expect(ranked[0]?.confidence).toBe(0.8);
    expect(ranked[2]?.score).toBe(40);
  });
});
