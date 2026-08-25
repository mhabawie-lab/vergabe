/**
 * X (Twitter) connector — API v2 recent search.
 *
 * Reading posts requires a paid API plan; without `X_BEARER_TOKEN` the source
 * reports itself as unconfigured and the pipeline skips it. Scraping the site
 * instead is not an option — it breaks X's terms of service and the ban lands
 * on the user's account, not on ours.
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

const SOURCE_ID = 'x';
const BASE_URL = 'https://api.x.com/2/tweets/search/recent';

const tweetSchema = z.object({
  id: z.string(),
  text: z.string(),
  created_at: z.string().optional(),
  lang: z.string().optional(),
  author_id: z.string().optional(),
  public_metrics: z
    .object({
      like_count: z.number().optional(),
      retweet_count: z.number().optional(),
      reply_count: z.number().optional(),
    })
    .optional(),
});

const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().optional(),
  public_metrics: z.object({ followers_count: z.number().optional() }).optional(),
});

const responseSchema = z.object({
  data: z.array(tweetSchema).optional(),
  includes: z.object({ users: z.array(userSchema).optional() }).optional(),
});

/**
 * Builds the search query. Cashtags plus the coin names, with retweets and
 * replies filtered out — retweets would count the same opinion many times.
 */
function buildQuery(symbols: readonly string[]): string {
  const terms = symbols.flatMap((symbol) => [`$${symbol}`, `#${symbol}`]);
  return `(${terms.join(' OR ')}) -is:retweet -is:reply lang:en`;
}

export function createXSource(): SocialSource {
  return {
    sourceId: SOURCE_ID,
    platform: 'x',
    label: 'X (Twitter)',
    setupHint:
      'Setze X_BEARER_TOKEN. Das Lesen von Posts erfordert einen kostenpflichtigen X-API-Plan (Basic oder höher).',
    isConfigured: () => Boolean(env.X_BEARER_TOKEN),

    async fetch(options: SocialFetchOptions) {
      const token = env.X_BEARER_TOKEN;
      if (!token) return [];

      const params = new URLSearchParams({
        query: buildQuery(options.symbols),
        // The API caps recent search at 100 results per request.
        max_results: String(Math.min(Math.max(options.limit, 10), 100)),
        'tweet.fields': 'created_at,lang,public_metrics,author_id',
        expansions: 'author_id',
        'user.fields': 'username,name,public_metrics',
      });
      if (options.since) params.set('start_time', options.since);

      const payload = await fetchJson<unknown>(`${BASE_URL}?${params.toString()}`, {
        sourceId: SOURCE_ID,
        headers: { authorization: `Bearer ${token}` },
        // X rate-limits aggressively; a failed window should not be hammered.
        retries: 1,
        backoffMs: 2_000,
      });

      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new SourcePayloadError('Unerwartete Antwort von der X-API', { sourceId: SOURCE_ID });
      }

      const users = new Map((parsed.data.includes?.users ?? []).map((user) => [user.id, user]));
      const fetchedAt = new Date().toISOString();

      return (parsed.data.data ?? []).map((tweet) => ({
        sourceId: SOURCE_ID,
        externalId: tweet.id,
        fetchedAt,
        // The author is attached so normalisation stays a pure function of the
        // raw record; the original tweet object is kept unchanged inside it.
        payload: { tweet, author: tweet.author_id ? users.get(tweet.author_id) : undefined },
      })) satisfies RawSocialPost[];
    },

    normalize(raw: RawSocialPost): SocialPost | null {
      const shape = z
        .object({ tweet: tweetSchema, author: userSchema.optional() })
        .safeParse(raw.payload);
      if (!shape.success) return null;

      const { tweet, author } = shape.data;
      const handle = author?.username ?? 'unbekannt';

      return {
        postId: `${SOURCE_ID}:${tweet.id}`,
        sourceId: SOURCE_ID,
        platform: 'x',
        externalId: tweet.id,
        url: `https://x.com/${handle}/status/${tweet.id}`,
        text: tweet.text,
        language: tweet.lang,
        author: {
          handle,
          displayName: author?.name,
          followers: author?.public_metrics?.followers_count,
        },
        engagement: {
          likes: tweet.public_metrics?.like_count ?? 0,
          reposts: tweet.public_metrics?.retweet_count ?? 0,
          replies: tweet.public_metrics?.reply_count ?? 0,
        },
        publishedAt: tweet.created_at ?? raw.fetchedAt,
        fetchedAt: raw.fetchedAt,
        assetSymbols: extractAssetSymbols(tweet.text),
        isDemo: false,
        raw: raw.payload,
      };
    },
  };
}
