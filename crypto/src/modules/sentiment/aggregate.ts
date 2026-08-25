/**
 * Per-asset sentiment aggregation.
 *
 * Turns scored posts into one picture per coin: mood, how loud the chatter is,
 * and how much of it is junk. Buzz is reported separately from sentiment on
 * purpose — a coin everyone suddenly loves is a different situation from a coin
 * everyone quietly likes, and conflating them is how hype gets mistaken for a
 * signal.
 */

import type { SocialPost } from '@/modules/social/types';

import { scorePost, type PostSentiment } from './score';

export interface AssetSentiment {
  readonly symbol: string;
  /** Reach-weighted mean sentiment, -1 to 1. Spam posts are excluded. */
  readonly score: number;
  /** 0–1: how much the score can be trusted (volume and per-post confidence). */
  readonly confidence: number;
  /** Posts mentioning the asset, spam included. */
  readonly mentionCount: number;
  /** Posts excluded from the score as spam or pump bait. */
  readonly spamCount: number;
  /** Share of all mentions in the sample that named this asset, 0–1. */
  readonly mentionShare: number;
  /**
   * Mentions in the last 6 hours relative to the older part of the sample.
   * 1 means "as loud as before", 3 means "three times the usual chatter".
   * `null` when there is no older baseline to compare against.
   */
  readonly buzzRatio: number | null;
  /** Most-reaching non-spam posts, newest first — evidence for the score. */
  readonly topPosts: readonly ScoredPost[];
}

export interface ScoredPost {
  readonly post: SocialPost;
  readonly sentiment: PostSentiment;
}

const RECENT_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface AggregateOptions {
  /** Reference time; injectable so the aggregation stays testable. */
  readonly now?: number;
  /** How many evidence posts to keep per asset. */
  readonly topPostCount?: number;
}

export function aggregateSentiment(
  posts: readonly SocialPost[],
  options: AggregateOptions = {},
): readonly AssetSentiment[] {
  const now = options.now ?? Date.now();
  const topPostCount = options.topPostCount ?? 3;

  const scored: ScoredPost[] = posts.map((post) => ({ post, sentiment: scorePost(post) }));

  const bySymbol = new Map<string, ScoredPost[]>();
  let totalMentions = 0;

  for (const entry of scored) {
    for (const symbol of entry.post.assetSymbols) {
      const bucket = bySymbol.get(symbol) ?? [];
      bucket.push(entry);
      bySymbol.set(symbol, bucket);
      totalMentions += 1;
    }
  }

  const result: AssetSentiment[] = [];

  for (const [symbol, entries] of bySymbol) {
    const clean = entries.filter((entry) => !entry.sentiment.isSpam);
    const spamCount = entries.length - clean.length;

    const weightSum = clean.reduce((sum, entry) => sum + entry.sentiment.reachWeight, 0);
    const score =
      weightSum === 0
        ? 0
        : clean.reduce((sum, entry) => sum + entry.sentiment.score * entry.sentiment.reachWeight, 0) /
          weightSum;

    // Confidence rises with the number of usable posts and how readable each
    // was, and is capped well below 1 — this is a lexicon, not an oracle.
    const volumeFactor = Math.min(1, clean.length / 8);
    const meanPostConfidence =
      clean.length === 0
        ? 0
        : clean.reduce((sum, entry) => sum + entry.sentiment.confidence, 0) / clean.length;
    const confidence = Number((volumeFactor * meanPostConfidence * 0.85).toFixed(3));

    const recent = entries.filter(
      (entry) => now - new Date(entry.post.publishedAt).getTime() <= RECENT_WINDOW_MS,
    ).length;
    const older = entries.length - recent;
    const buzzRatio = older === 0 ? null : Number((recent / older).toFixed(2));

    const topPosts = [...clean]
      .sort((a, b) => b.sentiment.reachWeight - a.sentiment.reachWeight)
      .slice(0, topPostCount);

    result.push({
      symbol,
      score: Number(score.toFixed(4)),
      confidence,
      mentionCount: entries.length,
      spamCount,
      mentionShare: totalMentions === 0 ? 0 : Number((entries.length / totalMentions).toFixed(4)),
      buzzRatio,
      topPosts,
    });
  }

  return result.sort((a, b) => b.mentionCount - a.mentionCount);
}

export function findAssetSentiment(
  sentiments: readonly AssetSentiment[],
  symbol: string,
): AssetSentiment | undefined {
  return sentiments.find((entry) => entry.symbol === symbol);
}
