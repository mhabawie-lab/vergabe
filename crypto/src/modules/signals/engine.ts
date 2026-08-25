/**
 * Signal engine.
 *
 * Combines the technical assessment with social sentiment into one ranked
 * verdict per asset.
 *
 * Two rules shape the weighting, and both exist because the naive version is
 * dangerous:
 *
 *  1. Sentiment can only ever *tilt* a technical picture, never create one.
 *     Social mood is a lagging, manipulable signal; letting it drive the score
 *     is how a pump gets rated as an opportunity.
 *  2. Its weight scales with measured confidence. Three posts from nobody are
 *     worth close to nothing, and the engine says so instead of pretending.
 */

import type { Asset, Ticker } from '@/modules/market/types';
import type { CandleSeries } from '@/modules/market/types';
import type { AssetSentiment } from '@/modules/sentiment/aggregate';

import { assessTechnical } from './technical';
import type { Signal, SignalReason, Verdict } from './types';

export const ENGINE_VERSION = 'signal-engine/1.0.0';

/** Maximum points sentiment may move the technical score, in either direction. */
const MAX_SENTIMENT_POINTS = 12;
/** Maximum points the buzz component may add. Deliberately small. */
const MAX_BUZZ_POINTS = 6;

const BUY_THRESHOLD = 65;
const AVOID_THRESHOLD = 40;

export interface BuildSignalInput {
  readonly asset: Asset;
  readonly series: CandleSeries;
  readonly ticker: Ticker | undefined;
  readonly sentiment: AssetSentiment | undefined;
}

export function buildSignal(input: BuildSignalInput): Signal {
  const { asset, series, ticker, sentiment } = input;
  const technical = assessTechnical(series);

  const reasons: SignalReason[] = [...technical.reasons];
  const warnings: string[] = [];

  let score = technical.score;

  // --- Sentiment contribution -------------------------------------------
  const sentimentScore = sentiment?.score ?? null;
  const sentimentConfidence = sentiment?.confidence ?? 0;

  if (sentiment && sentimentScore !== null && sentimentConfidence > 0) {
    const impact = Math.round(sentimentScore * sentimentConfidence * MAX_SENTIMENT_POINTS);
    if (impact !== 0) {
      score += impact;
      reasons.push({
        label: impact > 0 ? 'Positive Social-Stimmung' : 'Negative Social-Stimmung',
        impact,
        detail:
          `Stimmung ${formatSigned(sentimentScore)} aus ${sentiment.mentionCount} Beiträgen ` +
          `(Konfidenz ${(sentimentConfidence * 100).toFixed(0)} %).`,
      });
    }
  }

  // --- Buzz contribution -------------------------------------------------
  const buzzRatio = sentiment?.buzzRatio ?? null;
  if (buzzRatio !== null && buzzRatio > 1.5 && sentiment) {
    // Rising chatter counts only when the chart already agrees. Without that
    // confirmation it is a warning, not a point contribution.
    if (technical.score >= 55) {
      const impact = Math.min(MAX_BUZZ_POINTS, Math.round((buzzRatio - 1) * 3));
      score += impact;
      reasons.push({
        label: 'Steigende Aufmerksamkeit',
        impact,
        detail: `${buzzRatio.toFixed(1)}× so viele Erwähnungen wie im Vergleichszeitraum, bei intaktem Chartbild.`,
      });
    } else {
      warnings.push(
        `Auffällig viel Social-Aufmerksamkeit (${buzzRatio.toFixed(1)}×), ohne dass das Chartbild ` +
          'das stützt — typisches Muster für Hype ohne Substanz.',
      );
    }
  }

  // --- Warnings ----------------------------------------------------------
  if (sentiment && sentiment.spamCount > 0) {
    const spamShare = sentiment.spamCount / Math.max(1, sentiment.mentionCount);
    if (spamShare >= 0.3) {
      warnings.push(
        `${sentiment.spamCount} von ${sentiment.mentionCount} Beiträgen wurden als Pump-/Spam-Beiträge ` +
          'aussortiert. Die Stimmung zu dieser Coin wird aktiv manipuliert.',
      );
    }
  }

  if (sentiment && sentiment.mentionCount < 3) {
    const plural = sentiment.mentionCount === 1 ? 'Beitrag' : 'Beiträge';
    warnings.push(
      `Nur ${sentiment.mentionCount} ${plural} gefunden — die Stimmungsauswertung ist statistisch wertlos.`,
    );
  }

  if (!sentiment) {
    warnings.push('Keine Social-Daten für diese Coin im aktuellen Abruf.');
  }

  if (technical.confidence < 0.8) {
    warnings.push(
      'Zu wenig Kurshistorie für die langsamen Indikatoren — die technische Bewertung ist vorläufig.',
    );
  }

  const atrPercent = technical.indicators.atrPercent;
  if (atrPercent !== null && atrPercent > 0.05) {
    warnings.push(
      `Sehr hohe Volatilität (ATR ${(atrPercent * 100).toFixed(1)} % vom Kurs). Positionsgröße entsprechend klein halten.`,
    );
  }

  if (series.isDemo) {
    warnings.push('Basiert auf DEMO-Kursdaten. Kein Bezug zum echten Markt.');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Confidence combines data quality with how much of the score rests on the
  // weaker of the two inputs.
  const confidence = Number(
    (technical.confidence * 0.7 + Math.min(1, sentimentConfidence * 2) * 0.3).toFixed(3),
  );

  return {
    assetId: asset.assetId,
    symbol: asset.symbol,
    name: asset.name,
    score,
    verdict: toVerdict(score, confidence),
    confidence,
    reasons: [...reasons].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
    warnings,
    technical,
    sentimentScore,
    sentimentConfidence,
    mentionCount: sentiment?.mentionCount ?? 0,
    buzzRatio,
    price: ticker?.price ?? technical.indicators.price,
    change24h: ticker?.change24h ?? 0,
    // A stop at two ATR is the conventional distance that survives normal noise.
    suggestedStopPercent: atrPercent === null ? null : Number((atrPercent * 2).toFixed(4)),
    isDemo: series.isDemo || (ticker?.isDemo ?? false),
    evaluatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
  };
}

/**
 * A high score on thin data does not earn a buy verdict — it earns a watch.
 * The threshold is a floor on evidence, not only on the number.
 */
function toVerdict(score: number, confidence: number): Verdict {
  if (score >= BUY_THRESHOLD && confidence >= 0.5) return 'KAUFEN';
  if (score <= AVOID_THRESHOLD) return 'MEIDEN';
  return 'BEOBACHTEN';
}

function formatSigned(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

/** Ranks signals for the radar: best score first, ties broken by confidence. */
export function rankSignals(signals: readonly Signal[]): readonly Signal[] {
  return [...signals].sort((a, b) => b.score - a.score || b.confidence - a.confidence);
}
