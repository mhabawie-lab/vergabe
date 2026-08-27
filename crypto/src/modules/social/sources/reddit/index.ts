/**
 * Reddit connector.
 *
 * Uses the public JSON endpoints, which need no credentials but do require a
 * descriptive User-Agent — Reddit blocks anonymous default agents. Optional
 * script-app credentials raise the rate limit; without them the source still
 * works, just more slowly.
 */

import { z } from 'zod';

import { SourcePayloadError } from '@/lib/errors';
import { fetchJson } from '@/lib/http/fetch-json';
import { env } from '@/config';
import { extractAssetSymbols } from '@/modules/social/mentions';
import type {
  RawSocialPost,
  SocialFetchOptions,
  SocialPost,
  SocialSource,
} from '@/modules/social/types';

const SOURCE_ID = 'reddit';
const SUBREDDITS = ['CryptoCurrency', 'CryptoMarkets', 'Bitcoin', 'ethereum'] as const;

const postSchema = z.object({
  id: z.string(),
  title: z.string(),
  selftext: z.string().optional(),
  author: z.string().optional(),
  subreddit: z.string().optional(),
  permalink: z.string(),
  score: z.number().optional(),
  num_comments: z.number().optional(),
  created_utc: z.number().optional(),
  over_18: z.boolean().optional(),
});

const listingSchema = z.object({
  data: z.object({
    children: z.array(z.object({ data: postSchema })),
  }),
});

function userAgent(): string {
  return env.REDDIT_USER_AGENT ?? 'cryptoradar/0.1 (self-hosted market research)';
}

export function createRedditSource(): SocialSource {
  return {
    sourceId: SOURCE_ID,
    platform: 'reddit',
    label: 'Reddit',
    setupHint:
      'Funktioniert ohne Zugangsdaten. Optional REDDIT_USER_AGENT setzen; ohne eigenen User-Agent drosselt Reddit die Abfragen.',
    isConfigured: () => true,

    async fetch(options: SocialFetchOptions) {
      const perSub = Math.max(5, Math.ceil(options.limit / SUBREDDITS.length));
      const fetchedAt = new Date().toISOString();
      const raws: RawSocialPost[] = [];

      // Subreddits are polled one after another and independently: one blocked
      // subreddit must not cost the posts of the others.
      for (const subreddit of SUBREDDITS) {
        const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${perSub}`;
        const payload = await fetchJson<unknown>(url, {
          sourceId: SOURCE_ID,
          headers: { 'user-agent': userAgent() },
        });

        const parsed = listingSchema.safeParse(payload);
        if (!parsed.success) {
          throw new SourcePayloadError('Unerwartete Listing-Antwort von Reddit', {
            sourceId: SOURCE_ID,
            subreddit,
          });
        }

        for (const child of parsed.data.data.children) {
          raws.push({
            sourceId: SOURCE_ID,
            externalId: child.data.id,
            fetchedAt,
            payload: child.data,
          });
        }
      }

      return raws;
    },

    normalize(raw: RawSocialPost): SocialPost | null {
      const parsed = postSchema.safeParse(raw.payload);
      if (!parsed.success) return null;
      const post = parsed.data;
      if (post.over_18) return null;

      const text = [post.title, post.selftext ?? ''].join('\n').trim();

      return {
        postId: `${SOURCE_ID}:${post.id}`,
        sourceId: SOURCE_ID,
        platform: 'reddit',
        externalId: post.id,
        url: `https://www.reddit.com${post.permalink}`,
        text,
        author: {
          handle: post.author ?? 'unbekannt',
          displayName: post.subreddit ? `r/${post.subreddit}` : undefined,
        },
        engagement: {
          likes: post.score ?? 0,
          reposts: 0,
          replies: post.num_comments ?? 0,
        },
        publishedAt: post.created_utc
          ? new Date(post.created_utc * 1000).toISOString()
          : raw.fetchedAt,
        fetchedAt: raw.fetchedAt,
        assetSymbols: extractAssetSymbols(text),
        isDemo: false,
        raw: raw.payload,
      };
    },
  };
}
