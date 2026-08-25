/**
 * Signal format.
 *
 * A signal is never a bare number: it always carries the reasons that produced
 * it and the warnings that argue against it. A score the user cannot inspect is
 * not usable for a money decision.
 */

export type Verdict = 'KAUFEN' | 'BEOBACHTEN' | 'MEIDEN';

export const VERDICT_LABELS: Readonly<Record<Verdict, string>> = {
  KAUFEN: 'Kaufen',
  BEOBACHTEN: 'Beobachten',
  MEIDEN: 'Meiden',
};

export interface SignalReason {
  readonly label: string;
  /** Contribution to the score in points; negative reasons subtract. */
  readonly impact: number;
  readonly detail: string;
}

export interface IndicatorSnapshot {
  readonly price: number;
  readonly ema20: number | null;
  readonly ema50: number | null;
  readonly rsi14: number | null;
  readonly macdHistogram: number | null;
  readonly atr14: number | null;
  /** ATR as a share of price — the volatility used for position sizing. */
  readonly atrPercent: number | null;
  readonly bollingerPosition: number | null;
}

export interface TechnicalAssessment {
  /** 0–100, where 50 is neutral. */
  readonly score: number;
  readonly reasons: readonly SignalReason[];
  readonly indicators: IndicatorSnapshot;
  /** 0–1, lower when the candle history is too short for the indicators. */
  readonly confidence: number;
}

export interface Signal {
  readonly assetId: string;
  readonly symbol: string;
  readonly name: string;
  /** 0–100 combined score. */
  readonly score: number;
  readonly verdict: Verdict;
  /** 0–1 confidence in the score, driven by data quality and agreement. */
  readonly confidence: number;
  readonly reasons: readonly SignalReason[];
  /** Reasons to be sceptical. Always shown next to the score, never hidden. */
  readonly warnings: readonly string[];
  readonly technical: TechnicalAssessment;
  readonly sentimentScore: number | null;
  readonly sentimentConfidence: number;
  readonly mentionCount: number;
  readonly buzzRatio: number | null;
  readonly price: number;
  readonly change24h: number;
  /** Suggested stop distance from ATR, as a fraction of price. */
  readonly suggestedStopPercent: number | null;
  readonly isDemo: boolean;
  readonly evaluatedAt: string;
  /** Identifies the rule set that produced this signal, for reproducibility. */
  readonly engineVersion: string;
}
