/**
 * Sentiment lexicon for crypto discourse.
 *
 * Terms are weighted between -1 and 1. This is a transparent, auditable
 * baseline — every score can be traced back to the words that produced it —
 * not a language model. Its limits are real and are reported as low confidence
 * rather than hidden: irony, mixed statements and unlisted slang are missed.
 */

export interface LexiconEntry {
  readonly term: string;
  readonly weight: number;
}

export const POSITIVE_TERMS: readonly LexiconEntry[] = [
  { term: 'bullish', weight: 0.8 },
  { term: 'accumulating', weight: 0.6 },
  { term: 'accumulation', weight: 0.5 },
  { term: 'breakout', weight: 0.7 },
  { term: 'reclaimed', weight: 0.6 },
  { term: 'support holding', weight: 0.6 },
  { term: 'higher low', weight: 0.5 },
  { term: 'uptrend', weight: 0.7 },
  { term: 'rally', weight: 0.5 },
  { term: 'adoption', weight: 0.5 },
  { term: 'partnership', weight: 0.4 },
  { term: 'upgrade', weight: 0.4 },
  { term: 'shipped', weight: 0.3 },
  { term: 'inflows', weight: 0.5 },
  { term: 'strong', weight: 0.4 },
  { term: 'outperforming', weight: 0.5 },
  { term: 'undervalued', weight: 0.4 },
  { term: 'buying', weight: 0.3 },
  { term: 'long', weight: 0.2 },
  { term: 'green', weight: 0.2 },
] as const;

export const NEGATIVE_TERMS: readonly LexiconEntry[] = [
  { term: 'bearish', weight: -0.8 },
  { term: 'dump', weight: -0.6 },
  { term: 'dumping', weight: -0.7 },
  { term: 'crash', weight: -0.8 },
  { term: 'liquidation', weight: -0.6 },
  { term: 'liquidations', weight: -0.6 },
  { term: 'breakdown', weight: -0.7 },
  { term: 'lower high', weight: -0.5 },
  { term: 'downtrend', weight: -0.7 },
  { term: 'bleeding', weight: -0.6 },
  { term: 'outage', weight: -0.6 },
  { term: 'exploit', weight: -0.9 },
  { term: 'hack', weight: -0.9 },
  { term: 'rug', weight: -0.9 },
  { term: 'scam', weight: -0.8 },
  { term: 'lawsuit', weight: -0.6 },
  { term: 'regulatory pressure', weight: -0.5 },
  { term: 'overheated', weight: -0.5 },
  { term: 'stretched', weight: -0.4 },
  { term: 'careful', weight: -0.3 },
  { term: 'weak', weight: -0.5 },
  { term: 'weakness', weight: -0.5 },
  { term: 'selling', weight: -0.4 },
  { term: 'short', weight: -0.2 },
  { term: 'chop', weight: -0.2 },
  { term: 'uncertainty', weight: -0.4 },
  { term: 'outflows', weight: -0.5 },
] as const;

/** Words that flip the polarity of the term that follows them. */
export const NEGATIONS: readonly string[] = [
  'not',
  "isn't",
  'isnt',
  'no',
  'never',
  'without',
  'nicht',
  'kein',
  'keine',
] as const;

/** Words that amplify or dampen the term that follows them. */
export const MODIFIERS: Readonly<Record<string, number>> = {
  very: 1.4,
  extremely: 1.6,
  super: 1.4,
  really: 1.3,
  slightly: 0.6,
  somewhat: 0.7,
  quietly: 0.8,
  briefly: 0.7,
};

/**
 * Markers of pump-and-dump and engagement-bait posts. These do not make a post
 * negative — they make it untrustworthy, and it is excluded from the score.
 */
export const SPAM_MARKERS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /\b\d{2,4}\s?x\b/i, reason: 'Unrealistisches Kursziel (z. B. „100x")' },
  { pattern: /guarantee|garantiert|risk[- ]?free/i, reason: 'Gewinnversprechen' },
  { pattern: /pump\s?(group|signal|call)/i, reason: 'Verweis auf Pump-Gruppe' },
  { pattern: /join\s+(my|our|the)\s+(group|channel|discord|telegram)/i, reason: 'Gruppen-Werbung' },
  { pattern: /\b(buy|kaufen)\s+now\b/i, reason: 'Dringlichkeitsaufruf' },
  { pattern: /before\s+it\s+is\s+too\s+late|bevor\s+es\s+zu\s+spät/i, reason: 'Dringlichkeitsaufruf' },
  { pattern: /airdrop|giveaway|free\s+tokens/i, reason: 'Airdrop-/Giveaway-Köder' },
] as const;
