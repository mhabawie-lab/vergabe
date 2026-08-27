import { describe, expect, it } from 'vitest';

import { atr, bollinger, ema, latest, macd, rsi, sma } from '@/modules/indicators';
import type { Candle } from '@/modules/market/types';

function candlesFrom(closes: readonly number[]): Candle[] {
  return closes.map((close, index) => ({
    openTime: new Date(2024, 0, 1, index).toISOString(),
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 100,
  }));
}

describe('sma', () => {
  it('leaves the leading positions undefined until the window is full', () => {
    const result = sma([1, 2, 3, 4], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(2);
    expect(result[3]).toBe(3);
  });
});

describe('ema', () => {
  it('seeds with the simple average of the first window', () => {
    const result = ema([1, 2, 3, 4, 5], 3);
    expect(result[2]).toBe(2);
  });

  it('reacts faster than the simple average at the moment of a jump', () => {
    const closes = [10, 10, 10, 10, 10, 20, 20, 20];
    const jump = 5;
    // Measured at the jump itself: once the whole window sits at the new level
    // the SMA has caught up completely, while the EMA is still converging.
    const fast = ema(closes, 3)[jump];
    const slow = sma(closes, 3)[jump];
    expect(fast).not.toBeNull();
    expect(slow).not.toBeNull();
    expect(fast as number).toBeGreaterThan(slow as number);
  });

  it('returns all nulls when there is less data than the period', () => {
    expect(ema([1, 2], 5).every((value) => value === null)).toBe(true);
  });
});

describe('rsi', () => {
  it('reports maximum strength when every candle rises', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(latest(rsi(closes, 14))).toBe(100);
  });

  it('stays below 50 in a falling market', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 - i);
    const value = latest(rsi(closes, 14));
    expect(value).not.toBeNull();
    expect(value as number).toBeLessThan(50);
  });

  it('is neutral rather than undefined for a flat series', () => {
    const closes = new Array(30).fill(100);
    expect(latest(rsi(closes, 14))).toBe(50);
  });
});

describe('macd', () => {
  it('produces a positive histogram in a sustained uptrend', () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 * 1.01 ** i);
    const value = latest(macd(closes).histogram);
    expect(value).not.toBeNull();
    expect(value as number).toBeGreaterThan(0);
  });

  it('aligns the signal line to the positions where MACD exists', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const result = macd(closes);
    const firstMacd = result.macd.findIndex((value) => value !== null);
    const firstSignal = result.signal.findIndex((value) => value !== null);
    expect(firstSignal).toBeGreaterThanOrEqual(firstMacd);
  });
});

describe('bollinger', () => {
  it('collapses the bands to the mean when price does not move', () => {
    const closes = new Array(30).fill(50);
    const bands = bollinger(closes, 20, 2);
    expect(latest(bands.upper)).toBe(50);
    expect(latest(bands.lower)).toBe(50);
  });
});

describe('atr', () => {
  it('grows with the size of the candle ranges', () => {
    const calm = atr(candlesFrom(new Array(30).fill(100)), 14);
    const wild = candlesFrom(new Array(30).fill(100)).map((candle, index) => ({
      ...candle,
      high: index % 2 === 0 ? 110 : 100,
      low: index % 2 === 0 ? 90 : 100,
    }));
    const calmValue = latest(calm) ?? 0;
    const wildValue = latest(atr(wild, 14)) ?? 0;
    expect(wildValue).toBeGreaterThan(calmValue);
  });
});
