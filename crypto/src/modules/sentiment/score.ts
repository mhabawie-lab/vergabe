/**
 * Per-post sentiment scoring.
 *
 * Pure functions over `SocialPost`. Every result carries the terms that
 * produced it, so a score shown in the UI can always be explained. A post the
 * lexicon cannot read is reported as neutral with low confidence — never as a
 * confident zero.
 */

import type { SocialPost } from '@/modules/social/types';

import { MODIFIERS, NEGATIONS, NEGATIVE_TERMS, POSITIVE_TERMS, SPAM_MARKERS } from './lexicon';

export interface MatchedTerm {
  readonly term: string;
  readonly weight: number;
  readonly negated: boolean;
}

export interface PostSentiment {
  readonly postId: string;
  /** -1 (strongly negative) to 1 (strongly positive). */
  readonly score: number;
  /** 0–1. Low when few known terms were found or the post is very short. */
  readonly confidence: number;
  readonly matchedTerms: readonly MatchedTerm[];
  readonly isSpam: boolean;
  readonly spamReasons: readonly string[];
  /**
   * Reach-based weight for aggregation. Followers and engagement are damped
   * logarithmically so one viral post cannot dominate an entire asset's score.
   */
  readonly reachWeight: number;
}

const ALL_TERMS = [...POSITIVE_TERMS, ...NEGATIVE_TERMS];

function detectSpam(text: string): readonly string[] {
  const reasons: string[] = [];
  for (const marker of SPAM_MARKERS) {
    if (marker.pattern.test(text)) reasons.push(marker.reason);
  }

  const emojiCount = (text.match(/[\u{1F300}-\u{1FAFF}]/gu) ?? []).length;
  if (emojiCount >= 4) reasons.push('Übermäßig viele Emojis');

  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 20) {
    const upperShare = (letters.match(/[A-Z]/g) ?? []).length / letters.length;
    if (upperShare > 0.6) reasons.push('Überwiegend Großbuchstaben');
  }

  return [...new Set(reasons)];
}

/** Tokenises for lexicon matching: lower case, punctuation stripped. */
function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zäöüß'\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export function scorePost(post: SocialPost): PostSentiment {
  const text = post.text;
  const spamReasons = detectSpam(text);
  const tokens = tokenize(text);
  const lower = text.toLowerCase();

  const matched: MatchedTerm[] = [];

  for (const entry of ALL_TERMS) {
    if (!lower.includes(entry.term)) continue;

    // Look at the three tokens before the term for negation and intensity.
    const termHead = entry.term.split(' ')[0] ?? entry.term;
    const index = tokens.indexOf(termHead);
    let multiplier = 1;
    let negated = false;

    if (index > 0) {
      for (let back = 1; back <= 3 && index - back >= 0; back += 1) {
        const previous = tokens[index - back];
        if (!previous) continue;
        if (NEGATIONS.includes(previous)) negated = true;
        const modifier = MODIFIERS[previous];
        if (modifier !== undefined) multiplier *= modifier;
      }
    }

    const weight = entry.weight * multiplier * (negated ? -0.8 : 1);
    matched.push({ term: entry.term, weight, negated });
  }

  const rawScore = matched.reduce((sum, entry) => sum + entry.weight, 0);
  // Averaging over matches keeps a long post from outscoring a sharp short one;
  // tanh bounds the result without a hard clip at the edges.
  const score = matched.length === 0 ? 0 : Math.tanh(rawScore / Math.sqrt(matched.length));

  const wordCount = tokens.length;
  const lengthFactor = Math.min(1, wordCount / 20);
  const evidenceFactor = Math.min(1, matched.length / 3);
  const confidence = matched.length === 0 ? 0 : Number((lengthFactor * evidenceFactor).toFixed(3));

  const followers = post.author.followers ?? 0;
  const engagement = post.engagement.likes + post.engagement.reposts + post.engagement.replies;
  const reachWeight = Number(
    (Math.log10(1 + followers) * 0.6 + Math.log10(1 + engagement) * 0.4 + 0.2).toFixed(4),
  );

  return {
    postId: post.postId,
    score: Number(score.toFixed(4)),
    confidence,
    matchedTerms: matched,
    isSpam: spamReasons.length > 0,
    spamReasons,
    reachWeight,
  };
}
