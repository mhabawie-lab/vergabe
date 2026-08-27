/**
 * Demo social source — fixed, obviously invented posts.
 *
 * Lets the sentiment and signal stages run without any API credentials. Every
 * record carries `isDemo: true` and handles are prefixed `demo_`, so nothing
 * here can be mistaken for a real person's statement.
 */

import { z } from 'zod';

import { extractAssetSymbols } from '@/modules/social/mentions';
import type {
  RawSocialPost,
  SocialFetchOptions,
  SocialPost,
  SocialSource,
} from '@/modules/social/types';

const SOURCE_ID = 'demo';

interface DemoSeed {
  readonly id: string;
  readonly text: string;
  readonly handle: string;
  readonly followers: number;
  readonly likes: number;
  readonly replies: number;
  /** Age of the post in minutes, relative to the fetch time. */
  readonly ageMinutes: number;
}

const SEEDS: readonly DemoSeed[] = [
  {
    id: 'd1',
    text: '$BTC just reclaimed the range high after a clean retest. Strong bullish structure, still accumulating here.',
    handle: 'demo_chartlady',
    followers: 48_000,
    likes: 1_240,
    replies: 96,
    ageMinutes: 25,
  },
  {
    id: 'd2',
    text: 'Careful with $BTC — funding is overheated and open interest looks stretched. A flush would be healthy.',
    handle: 'demo_riskdesk',
    followers: 91_000,
    likes: 2_010,
    replies: 310,
    ageMinutes: 60,
  },
  {
    id: 'd3',
    text: 'Ethereum devs shipped the upgrade on schedule. Fees down, throughput up. Quietly bullish for $ETH.',
    handle: 'demo_devwatch',
    followers: 22_500,
    likes: 780,
    replies: 41,
    ageMinutes: 90,
  },
  {
    id: 'd4',
    text: '$SOL 🚀🚀 GUARANTEED 100x THIS WEEK!! BUY NOW BEFORE IT IS TOO LATE 🚀🚀 join the pump group',
    handle: 'demo_moonshill',
    followers: 900,
    likes: 12,
    replies: 3,
    ageMinutes: 15,
  },
  {
    id: 'd5',
    text: 'Solana network had another brief outage today. Recovered quickly but it is a recurring weakness for $SOL.',
    handle: 'demo_infranews',
    followers: 65_000,
    likes: 1_530,
    replies: 220,
    ageMinutes: 200,
  },
  {
    id: 'd6',
    text: 'Rotation out of majors into $DOGE and other memecoins. Classic late-cycle behaviour, be careful.',
    handle: 'demo_flowdesk',
    followers: 33_000,
    likes: 640,
    replies: 88,
    ageMinutes: 45,
  },
  {
    id: 'd7',
    text: 'Chainlink announced a new enterprise partnership. Real adoption for $LINK, not just narrative.',
    handle: 'demo_oracleobserver',
    followers: 18_400,
    likes: 512,
    replies: 37,
    ageMinutes: 300,
  },
  {
    id: 'd8',
    text: 'Regulatory pressure on $XRP is easing according to the latest filing. Uncertainty dropping.',
    handle: 'demo_legalfeed',
    followers: 27_000,
    likes: 990,
    replies: 145,
    ageMinutes: 420,
  },
  {
    id: 'd9',
    text: 'Honest take: $ADA has shipped a lot but price keeps bleeding against BTC. Weak relative strength.',
    handle: 'demo_relativestrength',
    followers: 11_800,
    likes: 305,
    replies: 62,
    ageMinutes: 150,
  },
  {
    id: 'd10',
    text: 'Market-wide liquidations hit hard overnight. $ETH and $SOL took the worst of it. Expect chop.',
    handle: 'demo_liqtracker',
    followers: 54_000,
    likes: 1_870,
    replies: 260,
    ageMinutes: 30,
  },
];

const seedSchema = z.object({
  id: z.string(),
  text: z.string(),
  handle: z.string(),
  followers: z.number(),
  likes: z.number(),
  replies: z.number(),
  ageMinutes: z.number(),
});

export function createDemoSocialSource(): SocialSource {
  return {
    sourceId: SOURCE_ID,
    platform: 'demo',
    label: 'Demo (erfundene Beiträge)',
    setupHint: 'Benötigt keine Zugangsdaten. Liefert erfundene Beiträge zum Testen der Auswertung.',
    isConfigured: () => true,

    async fetch(options: SocialFetchOptions) {
      const fetchedAt = new Date().toISOString();
      const wanted = new Set(options.symbols.map((symbol) => symbol.toUpperCase()));

      return SEEDS.filter((seed) => {
        if (wanted.size === 0) return true;
        return extractAssetSymbols(seed.text).some((symbol) => wanted.has(symbol));
      })
        .slice(0, options.limit)
        .map((seed) => ({
          sourceId: SOURCE_ID,
          externalId: seed.id,
          fetchedAt,
          payload: seed,
        })) satisfies RawSocialPost[];
    },

    normalize(raw: RawSocialPost): SocialPost | null {
      const parsed = seedSchema.safeParse(raw.payload);
      if (!parsed.success) return null;
      const seed = parsed.data;
      const publishedAt = new Date(
        new Date(raw.fetchedAt).getTime() - seed.ageMinutes * 60_000,
      ).toISOString();

      return {
        postId: `${SOURCE_ID}:${seed.id}`,
        sourceId: SOURCE_ID,
        platform: 'demo',
        externalId: seed.id,
        url: '#',
        text: seed.text,
        language: 'en',
        author: { handle: seed.handle, followers: seed.followers },
        engagement: { likes: seed.likes, reposts: 0, replies: seed.replies },
        publishedAt,
        fetchedAt: raw.fetchedAt,
        assetSymbols: extractAssetSymbols(seed.text),
        isDemo: true,
        raw: raw.payload,
      };
    },
  };
}
