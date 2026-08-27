import { describe, expect, it } from 'vitest';

import { redactSecrets } from '@/lib/logging';
import { createDemoSocialSource } from '@/modules/social/sources/demo';
import { createNewsSource } from '@/modules/social/sources/news';
import { createRedditSource } from '@/modules/social/sources/reddit';
import { createXSource } from '@/modules/social/sources/x';
import type { RawSocialPost } from '@/modules/social/types';

/** Normalisation is pure, so it is tested without touching the network. */
function raw(payload: unknown, externalId = 'abc'): RawSocialPost {
  return {
    sourceId: 'test',
    externalId,
    fetchedAt: '2024-06-01T10:00:00.000Z',
    payload,
  };
}

describe('X normalizer', () => {
  const source = createXSource();

  it('maps a tweet into the internal format and keeps the raw payload', () => {
    const payload = {
      tweet: {
        id: '1234',
        text: 'Very bullish on $BTC right now',
        created_at: '2024-06-01T09:00:00.000Z',
        lang: 'en',
        author_id: 'u1',
        public_metrics: { like_count: 12, retweet_count: 3, reply_count: 1 },
      },
      author: { id: 'u1', username: 'someone', name: 'Some One', public_metrics: { followers_count: 900 } },
    };

    const post = source.normalize(raw(payload, '1234'));
    expect(post).not.toBeNull();
    expect(post?.platform).toBe('x');
    expect(post?.externalId).toBe('1234');
    expect(post?.author.handle).toBe('someone');
    expect(post?.engagement.likes).toBe(12);
    expect(post?.assetSymbols).toContain('BTC');
    // The original payload must survive normalisation untouched.
    expect(post?.raw).toEqual(payload);
  });

  it('returns null instead of throwing on an unexpected payload', () => {
    expect(source.normalize(raw({ nonsense: true }))).toBeNull();
  });

  it('reports itself unconfigured without a bearer token', () => {
    // The test environment sets no X_BEARER_TOKEN.
    expect(source.isConfigured()).toBe(false);
  });
});

describe('Reddit normalizer', () => {
  const source = createRedditSource();

  it('joins title and body and derives the permalink', () => {
    const post = source.normalize(
      raw({
        id: 'r1',
        title: 'Ethereum upgrade shipped',
        selftext: 'Fees are down sharply.',
        author: 'user',
        subreddit: 'ethereum',
        permalink: '/r/ethereum/comments/r1/x/',
        score: 42,
        num_comments: 7,
        created_utc: 1_717_236_000,
      }),
    );

    expect(post?.text).toContain('Ethereum upgrade shipped');
    expect(post?.text).toContain('Fees are down sharply.');
    expect(post?.url).toBe('https://www.reddit.com/r/ethereum/comments/r1/x/');
    expect(post?.assetSymbols).toContain('ETH');
  });

  it('drops posts marked as adult content', () => {
    const post = source.normalize(
      raw({ id: 'r2', title: 'x', permalink: '/r/x/', over_18: true }),
    );
    expect(post).toBeNull();
  });
});

describe('News normalizer', () => {
  const source = createNewsSource();

  it('strips HTML out of the summary', () => {
    const post = source.normalize(
      raw({
        item: {
          title: 'Solana outage resolved',
          description: '<p>The network <b>recovered</b> after two hours.</p>',
          link: 'https://example.com/a',
          pubDate: 'Sat, 01 Jun 2024 09:00:00 GMT',
          guid: 'g1',
        },
        feedUrl: 'https://example.com/rss',
      }),
    );

    expect(post?.text).toContain('The network recovered after two hours.');
    expect(post?.text).not.toContain('<b>');
    expect(post?.assetSymbols).toContain('SOL');
    expect(post?.author.handle).toBe('example.com');
  });

  it('skips an entry with no usable text', () => {
    expect(source.normalize(raw({ item: {}, feedUrl: 'https://example.com/rss' }))).toBeNull();
  });
});

describe('Demo social source', () => {
  it('marks every post as demo data', async () => {
    const source = createDemoSocialSource();
    const raws = await source.fetch({ symbols: ['BTC'], limit: 10 });
    const posts = raws.map((entry) => source.normalize(entry));
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((post) => post?.isDemo === true)).toBe(true);
  });
});

describe('redactSecrets', () => {
  it('removes credential-shaped values before they can be logged', () => {
    const redacted = redactSecrets({
      sourceId: 'x',
      headers: { authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAAA' },
      apiKey: 'abc123',
      note: 'harmless',
    }) as Record<string, unknown>;

    expect(redacted.apiKey).toBe('[redacted]');
    expect((redacted.headers as Record<string, unknown>).authorization).toBe('[redacted]');
    expect(redacted.note).toBe('harmless');
  });

  it('redacts long opaque tokens even under an innocent key', () => {
    const redacted = redactSecrets({ value: 'a'.repeat(40) }) as Record<string, unknown>;
    expect(redacted.value).toBe('[redacted]');
  });
});
