/**
 * Technical assessment.
 *
 * Turns a candle series into a 0–100 score with an explicit reason per
 * contribution. Deliberately boring rules — trend, momentum, overextension —
 * because a rule the user can check beats one they have to trust.
 */

import { atr, bollinger, ema, latest, macd, rsi, valueAt } from '@/modules/indicators';
import type { CandleSeries } from '@/modules/market/types';

import type { IndicatorSnapshot, SignalReason, TechnicalAssessment } from './types';

/** Candles needed before the slowest indicator (EMA 50, MACD) is meaningful. */
const MIN_CANDLES = 60;

export function assessTechnical(series: CandleSeries): TechnicalAssessment {
  const candles = series.candles;
  const closes = candles.map((candle) => candle.close);
  const price = closes.at(-1) ?? 0;

  const ema20 = latest(ema(closes, 20));
  const ema50 = latest(ema(closes, 50));
  const rsiSeries = rsi(closes, 14);
  const rsi14 = latest(rsiSeries);
  const macdResult = macd(closes);
  const macdHistogram = latest(macdResult.histogram);
  const macdHistogramPrevious = valueAt(macdResult.histogram, 1);
  const atr14 = latest(atr(candles, 14));
  const bands = bollinger(closes, 20, 2);
  const upper = latest(bands.upper);
  const lower = latest(bands.lower);

  // Where price sits inside the Bollinger channel: 0 = lower band, 1 = upper.
  const bollingerPosition =
    upper !== null && lower !== null && upper > lower ? (price - lower) / (upper - lower) : null;

  const indicators: IndicatorSnapshot = {
    price,
    ema20,
    ema50,
    rsi14,
    macdHistogram,
    atr14,
    atrPercent: atr14 !== null && price > 0 ? atr14 / price : null,
    bollingerPosition,
  };

  const reasons: SignalReason[] = [];
  let score = 50;

  // Trend: price against the medium-term average, and the averages against
  // each other. This is the largest single contribution by design.
  if (ema20 !== null && ema50 !== null) {
    if (ema20 > ema50) {
      const impact = price > ema20 ? 14 : 8;
      score += impact;
      reasons.push({
        label: 'Aufwärtstrend',
        impact,
        detail:
          price > ema20
            ? 'EMA 20 liegt über EMA 50 und der Kurs notiert über dem EMA 20.'
            : 'EMA 20 liegt über EMA 50, der Kurs ist aber unter den EMA 20 zurückgefallen.',
      });
    } else {
      const impact = price < ema20 ? -14 : -8;
      score += impact;
      reasons.push({
        label: 'Abwärtstrend',
        impact,
        detail:
          price < ema20
            ? 'EMA 20 liegt unter EMA 50 und der Kurs notiert unter dem EMA 20.'
            : 'EMA 20 liegt unter EMA 50, der Kurs hat den EMA 20 aber zurückerobert.',
      });
    }
  }

  // Momentum: the MACD histogram's sign and whether it is expanding.
  if (macdHistogram !== null) {
    const expanding =
      macdHistogramPrevious !== null && Math.abs(macdHistogram) > Math.abs(macdHistogramPrevious);
    if (macdHistogram > 0) {
      const impact = expanding ? 10 : 5;
      score += impact;
      reasons.push({
        label: 'Positives Momentum',
        impact,
        detail: expanding
          ? 'MACD-Histogramm ist positiv und wächst.'
          : 'MACD-Histogramm ist positiv, verliert aber an Schwung.',
      });
    } else {
      const impact = expanding ? -10 : -5;
      score += impact;
      reasons.push({
        label: 'Negatives Momentum',
        impact,
        detail: expanding
          ? 'MACD-Histogramm ist negativ und fällt weiter.'
          : 'MACD-Histogramm ist negativ, der Abwärtsdruck lässt aber nach.',
      });
    }
  }

  // RSI: rewarded in the healthy zone, penalised at the extremes. An
  // overbought reading is a reason for caution, not a sell signal on its own.
  if (rsi14 !== null) {
    if (rsi14 >= 70) {
      score -= 10;
      reasons.push({
        label: 'Überkauft',
        impact: -10,
        detail: `RSI 14 bei ${rsi14.toFixed(0)} — der Kurs ist kurzfristig heiß gelaufen.`,
      });
    } else if (rsi14 <= 30) {
      score += 6;
      reasons.push({
        label: 'Überverkauft',
        impact: 6,
        detail: `RSI 14 bei ${rsi14.toFixed(0)} — mögliche Gegenbewegung, aber kein Trendwechsel.`,
      });
    } else if (rsi14 >= 50) {
      score += 6;
      reasons.push({
        label: 'Gesunde Stärke',
        impact: 6,
        detail: `RSI 14 bei ${rsi14.toFixed(0)} — Käuferseite hat die Oberhand, ohne Übertreibung.`,
      });
    } else {
      score -= 4;
      reasons.push({
        label: 'Schwäche',
        impact: -4,
        detail: `RSI 14 bei ${rsi14.toFixed(0)} — Verkäuferseite dominiert.`,
      });
    }
  }

  // Overextension: riding the upper band is where entries get expensive.
  if (bollingerPosition !== null) {
    if (bollingerPosition > 0.95) {
      score -= 6;
      reasons.push({
        label: 'Am oberen Band',
        impact: -6,
        detail: 'Der Kurs klebt am oberen Bollinger-Band — später Einstieg, schlechtes Verhältnis.',
      });
    } else if (bollingerPosition < 0.1) {
      score += 4;
      reasons.push({
        label: 'Am unteren Band',
        impact: 4,
        detail: 'Der Kurs liegt am unteren Bollinger-Band — günstiger, aber nur im intakten Trend.',
      });
    }
  }

  const confidence = Math.min(1, candles.length / MIN_CANDLES);

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    indicators,
    confidence: Number(confidence.toFixed(3)),
  };
}
