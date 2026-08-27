import { describe, expect, it } from 'vitest';

import { extractAssetSymbols } from '@/modules/social/mentions';
import { aggregateSentiment } from '@/modules/sentiment/aggregate';
import { scorePost } from '@/modules/sentiment/score';
import type { SocialPost } from '@/modules/social/types';

function post(overrides: Partial<SocialPost> & { text: string }): SocialPost {
  return {
    postId: overrides.postId ?? `test:${overrides.text.slice(0, 8)}`,
    sourceId: 'test',
    platform: 'demo',
    externalId: 'x',
    url: '#',
    author: { handle: 'tester', followers: 1_000 },
    engagement: { likes: 10, reposts: 0, replies: 1 },
    publishedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    assetSymbols: extractAssetSymbols(overrides.text),
    isDemo: true,
    raw: {},
    ...overrides,
  };
}

describe('extractAssetSymbols', () => {
  it('finds cashtags', () => {
    expect(extractAssetSymbols('loading up on $BTC here')).toContain('BTC');
  });

  it('finds full coin names', () => {
    expect(extractAssetSymbols('ethereum fees are down again')).toContain('ETH');
  });

  it('does not treat ordinary words as coins', () => {
    // "link" and "dot" are everyday words; only a cashtag or the full name counts.
    expect(extractAssetSymbols('please click the link in my dot com')).toEqual([]);
    expect(extractAssetSymbols('$LINK is up')).toContain('LINK');
  });

  it('ignores a lower-case symbol that is part of another word', () => {
    expect(extractAssetSymbols('the adaptation was slow')).not.toContain('ADA');
  });
});

describe('scorePost', () => {
  it('scores bullish language positively', () => {
    expect(scorePost(post({ text: 'Strong bullish breakout, clean uptrend on $BTC' })).score)
      .toBeGreaterThan(0.3);
  });

  it('scores bearish language negatively', () => {
    expect(scorePost(post({ text: 'Bearish breakdown, heavy liquidations on $ETH' })).score)
      .toBeLessThan(-0.3);
  });

  it('reports zero confidence when no known term appears', () => {
    const result = scorePost(post({ text: 'gm everyone, nice weather today' }));
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('flags pump bait as spam with a stated reason', () => {
    const result = scorePost(
      post({ text: '$SOL GUARANTEED 100x THIS WEEK BUY NOW join our pump group' }),
    );
    expect(result.isSpam).toBe(true);
    expect(result.spamReasons.length).toBeGreaterThan(0);
  });

  it('gives a wider-reaching account more weight', () => {
    const small = scorePost(post({ text: 'bullish on $BTC', author: { handle: 'a', followers: 10 } }));
    const large = scorePost(
      post({ text: 'bullish on $BTC', author: { handle: 'b', followers: 500_000 } }),
    );
    expect(large.reachWeight).toBeGreaterThan(small.reachWeight);
  });

  it('flips polarity after a negation', () => {
    const plain = scorePost(post({ text: 'this is bullish' }));
    const negated = scorePost(post({ text: 'this is not bullish' }));
    expect(negated.score).toBeLessThan(plain.score);
  });
});

describe('aggregateSentiment', () => {
  it('excludes spam from the score but still counts the mention', () => {
    const result = aggregateSentiment([
      post({ postId: 'p1', text: 'bearish breakdown on $SOL, weak structure' }),
      post({ postId: 'p2', text: '$SOL GUARANTEED 1000x BUY NOW join the pump group 🚀🚀🚀🚀' }),
    ]);
    const sol = result.find((entry) => entry.symbol === 'SOL');
    expect(sol).toBeDefined();
    expect(sol?.mentionCount).toBe(2);
    expect(sol?.spamCount).toBe(1);
    // The surviving post is bearish, so the score must stay negative.
    expect(sol?.score ?? 0).toBeLessThan(0);
  });

  it('keeps confidence low when only a couple of posts exist', () => {
    const result = aggregateSentiment([post({ text: 'bullish uptrend on $BTC, strong adoption' })]);
    expect(result[0]?.confidence ?? 1).toBeLessThan(0.3);
  });

  it('reports a buzz ratio only when there is an older baseline', () => {
    const now = Date.now();
    const recent = post({
      postId: 'r',
      text: 'bullish $BTC',
      publishedAt: new Date(now - 60_000).toISOString(),
    });
    const old = post({
      postId: 'o',
      text: 'bullish $BTC',
      publishedAt: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
    });

    expect(aggregateSentiment([recent], { now })[0]?.buzzRatio).toBeNull();
    expect(aggregateSentiment([recent, old], { now })[0]?.buzzRatio).toBe(1);
  });
});
