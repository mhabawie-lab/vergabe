/**
 * Technical indicators.
 *
 * Pure functions over closing prices and candles — no I/O, no source knowledge.
 * Each returns an array aligned to the input, with `null` for the leading
 * positions where the indicator is not yet defined. Callers must handle those
 * holes rather than silently treating them as zero.
 */

import type { Candle } from '@/modules/market/types';

export type Series = readonly number[];
export type IndicatorSeries = readonly (number | null)[];

/** Simple moving average. */
export function sma(values: Series, period: number): IndicatorSeries {
  if (period <= 0) throw new RangeError('period muss größer als 0 sein');
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i] ?? 0;
    if (i >= period) sum -= values[i - period] ?? 0;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average.
 *
 * Seeded with the SMA of the first `period` values, which is the convention
 * charting platforms use — a zero seed would bias the early values.
 */
export function ema(values: Series, period: number): IndicatorSeries {
  if (period <= 0) throw new RangeError('period muss größer als 0 sein');
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;

  const multiplier = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += values[i] ?? 0;
  let previous = seed / period;
  out[period - 1] = previous;

  for (let i = period; i < values.length; i += 1) {
    const value = values[i] ?? previous;
    previous = (value - previous) * multiplier + previous;
    out[i] = previous;
  }
  return out;
}

/**
 * Relative Strength Index (Wilder's smoothing), returned on a 0–100 scale.
 */
export function rsi(values: Series, period = 14): IndicatorSeries {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = (values[i] ?? 0) - (values[i - 1] ?? 0);
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = toRsi(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i += 1) {
    const change = (values[i] ?? 0) - (values[i - 1] ?? 0);
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = toRsi(avgGain, avgLoss);
  }
  return out;
}

function toRsi(avgGain: number, avgLoss: number): number {
  // No losses in the window means maximum strength; guard the division.
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MacdResult {
  readonly macd: IndicatorSeries;
  readonly signal: IndicatorSeries;
  readonly histogram: IndicatorSeries;
}

export function macd(values: Series, fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    return f === null || f === undefined || s === null || s === undefined ? null : f - s;
  });

  // The signal EMA is defined only over the stretch where MACD exists.
  const firstDefined = macdLine.findIndex((value) => value !== null);
  const signal: (number | null)[] = new Array(values.length).fill(null);
  const histogram: (number | null)[] = new Array(values.length).fill(null);

  if (firstDefined >= 0) {
    const dense = macdLine.slice(firstDefined).map((value) => value ?? 0);
    const signalDense = ema(dense, signalPeriod);
    for (let i = 0; i < signalDense.length; i += 1) {
      const value = signalDense[i];
      if (value === null || value === undefined) continue;
      const index = firstDefined + i;
      signal[index] = value;
      const macdValue = macdLine[index];
      if (macdValue !== null && macdValue !== undefined) histogram[index] = macdValue - value;
    }
  }

  return { macd: macdLine, signal, histogram };
}

export interface BollingerBands {
  readonly middle: IndicatorSeries;
  readonly upper: IndicatorSeries;
  readonly lower: IndicatorSeries;
}

export function bollinger(values: Series, period = 20, deviations = 2): BollingerBands {
  const middle = sma(values, period);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i += 1) {
    const mean = middle[i];
    if (mean === null || mean === undefined) continue;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      const diff = (values[j] ?? 0) - mean;
      variance += diff * diff;
    }
    const stdDev = Math.sqrt(variance / period);
    upper[i] = mean + deviations * stdDev;
    lower[i] = mean - deviations * stdDev;
  }

  return { middle, upper, lower };
}

/**
 * Average True Range (Wilder). Used for volatility-aware position sizing and
 * stop distances, not as a directional signal.
 */
export function atr(candles: readonly Candle[], period = 14): IndicatorSeries {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;

  const trueRanges: number[] = [0];
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    if (!current || !previous) continue;
    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close),
      ),
    );
  }

  let sum = 0;
  for (let i = 1; i <= period; i += 1) sum += trueRanges[i] ?? 0;
  let previousAtr = sum / period;
  out[period] = previousAtr;

  for (let i = period + 1; i < candles.length; i += 1) {
    previousAtr = (previousAtr * (period - 1) + (trueRanges[i] ?? 0)) / period;
    out[i] = previousAtr;
  }
  return out;
}

/** Last defined value of an indicator series, or `null` if there is none. */
export function latest(series: IndicatorSeries): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = series[i];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

/** Value at `offset` positions before the end, or `null`. */
export function valueAt(series: IndicatorSeries, offsetFromEnd: number): number | null {
  const index = series.length - 1 - offsetFromEnd;
  if (index < 0) return null;
  return series[index] ?? null;
}
