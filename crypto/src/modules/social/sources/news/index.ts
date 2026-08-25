/**
 * News connector — RSS/Atom feeds.
 *
 * Feed URLs are configuration (`NEWS_FEED_URLS`), not code, so adding an outlet
 * needs no deployment. Defaults cover a few well-known crypto outlets; the
 * connector treats every feed as untrusted input and skips malformed entries
 * rather than failing the whole run.
 */

import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';

import { fetchText } from '@/lib/http/fetch-json';
import { logger } from '@/lib/logging';
import { env } from '@/config';
import { extractAssetSymbols } from '@/modules/social/mentions';
import type {
  RawSocialPost,
  SocialFetchOptions,
  SocialPost,
  SocialSource,
} from '@/modules/social/types';

const SOURCE_ID = 'news';

const DEFAULT_FEEDS = [
  'https://cointelegraph.com/rss',
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://decrypt.co/feed',
] as const;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Feed titles routinely contain entities and CDATA; keep them as plain text.
  processEntities: true,
  trimValues: true,
});

const itemSchema = z.object({
  title: z.union([z.string(), z.number()]).optional(),
  link: z.union([z.string(), z.object({ '@_href': z.string() })]).optional(),
  description: z.union([z.string(), z.number()]).optional(),
  summary: z.union([z.string(), z.number()]).optional(),
  pubDate: z.string().optional(),
  published: z.string().optional(),
  updated: z.string().optional(),
  guid: z.union([z.string(), z.number(), z.object({ '#text': z.union([z.string(), z.number()]) })])
    .optional(),
  id: z.string().optional(),
});

type FeedItem = z.infer<typeof itemSchema>;

const storedSchema = z.object({ item: itemSchema, feedUrl: z.string() });

function feedUrls(): readonly string[] {
  return env.NEWS_FEED_URLS.length > 0 ? env.NEWS_FEED_URLS : DEFAULT_FEEDS;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return stripHtml(value);
  if (typeof value === 'number') return String(value);
  return '';
}

/** Feed summaries are HTML fragments; sentiment scoring wants prose. */
function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function itemLink(item: FeedItem): string {
  if (typeof item.link === 'string') return item.link;
  if (item.link && typeof item.link === 'object') return item.link['@_href'];
  return '';
}

function itemId(item: FeedItem, feedUrl: string): string {
  if (typeof item.guid === 'string') return item.guid;
  if (typeof item.guid === 'number') return String(item.guid);
  if (item.guid && typeof item.guid === 'object') return String(item.guid['#text']);
  if (item.id) return item.id;
  const link = itemLink(item);
  return link.length > 0 ? link : `${feedUrl}#${asText(item.title)}`;
}

function itemDate(item: FeedItem, fallback: string): string {
  const candidate = item.pubDate ?? item.published ?? item.updated;
  if (!candidate) return fallback;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

export function createNewsSource(): SocialSource {
  return {
    sourceId: SOURCE_ID,
    platform: 'news',
    label: 'Krypto-News (RSS)',
    setupHint:
      'Funktioniert ohne Zugangsdaten. Eigene Feeds über NEWS_FEED_URLS (kommagetrennt) konfigurierbar.',
    isConfigured: () => true,

    async fetch(options: SocialFetchOptions) {
      const fetchedAt = new Date().toISOString();
      const raws: RawSocialPost[] = [];
      const perFeed = Math.max(5, Math.ceil(options.limit / feedUrls().length));

      for (const feedUrl of feedUrls()) {
        // One dead outlet must not cost the articles of the others.
        try {
          const xml = await fetchText(feedUrl, { sourceId: SOURCE_ID });
          const document = parser.parse(xml) as Record<string, unknown>;
          const items = extractItems(document).slice(0, perFeed);

          for (const item of items) {
            const parsedItem = itemSchema.safeParse(item);
            if (!parsedItem.success) continue;
            raws.push({
              sourceId: SOURCE_ID,
              externalId: itemId(parsedItem.data, feedUrl),
              fetchedAt,
              payload: { item: parsedItem.data, feedUrl },
            });
          }
        } catch (error) {
          logger.warn('News-Feed übersprungen', {
            sourceId: SOURCE_ID,
            feedUrl,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return raws;
    },

    normalize(raw: RawSocialPost): SocialPost | null {
      const parsed = storedSchema.safeParse(raw.payload);
      if (!parsed.success) return null;
      const { item, feedUrl } = parsed.data;

      const title = asText(item.title);
      const body = asText(item.description ?? item.summary);
      const text = [title, body].filter((part) => part.length > 0).join(' — ');
      if (text.length === 0) return null;

      const externalId = itemId(item, feedUrl);

      return {
        postId: `${SOURCE_ID}:${externalId}`,
        sourceId: SOURCE_ID,
        platform: 'news',
        externalId,
        url: itemLink(item),
        text,
        author: { handle: hostOf(feedUrl) },
        // Feeds carry no engagement metrics; reporting zero is honest, a
        // guessed number would silently distort the weighting.
        engagement: { likes: 0, reposts: 0, replies: 0 },
        publishedAt: itemDate(item, raw.fetchedAt),
        fetchedAt: raw.fetchedAt,
        assetSymbols: extractAssetSymbols(text),
        isDemo: false,
        raw: raw.payload,
      };
    },
  };
}

/** RSS puts items under `rss.channel.item`, Atom under `feed.entry`. */
function extractItems(document: Record<string, unknown>): readonly unknown[] {
  const rss = document.rss as { channel?: { item?: unknown } } | undefined;
  const channelItems = rss?.channel?.item;
  if (channelItems) return Array.isArray(channelItems) ? channelItems : [channelItems];

  const feed = document.feed as { entry?: unknown } | undefined;
  const entries = feed?.entry;
  if (entries) return Array.isArray(entries) ? entries : [entries];

  return [];
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return 'feed';
  }
}
