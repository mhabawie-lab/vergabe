import 'server-only';

/**
 * Social ingestion facade.
 *
 * Polls every configured social source, normalises the raw payloads and hands
 * the internal format on. Sources run isolated: a source that is down, rate
 * limited or misconfigured is reported in `sourceStatus` and skipped — it never
 * blocks the others or the UI.
 */

import { toErrorMessage } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { socialSourceOrder } from '@/config';

import { createDemoSocialSource } from './sources/demo';
import { createNewsSource } from './sources/news';
import { createRedditSource } from './sources/reddit';
import { createXSource } from './sources/x';
import type { SocialFetchOptions, SocialPost, SocialSource } from './types';

const FACTORIES: Readonly<Record<string, () => SocialSource>> = {
  x: createXSource,
  reddit: createRedditSource,
  news: createNewsSource,
  demo: createDemoSocialSource,
};

export type SourceState = 'ok' | 'unconfigured' | 'failed';

export interface SocialSourceStatus {
  readonly sourceId: string;
  readonly label: string;
  readonly state: SourceState;
  readonly postCount: number;
  /** Present when `state` is `failed` or `unconfigured`. */
  readonly message?: string;
}

export interface SocialFeedResult {
  readonly posts: readonly SocialPost[];
  readonly sourceStatus: readonly SocialSourceStatus[];
  readonly fetchedAt: string;
}

function resolveSources(): readonly SocialSource[] {
  const sources: SocialSource[] = [];
  for (const id of socialSourceOrder()) {
    const factory = FACTORIES[id];
    if (!factory) {
      logger.warn('Unbekannte Social-Quelle in der Konfiguration übersprungen', { sourceId: id });
      continue;
    }
    sources.push(factory());
  }
  return sources;
}

export async function fetchSocialFeed(options: SocialFetchOptions): Promise<SocialFeedResult> {
  const sources = resolveSources();
  const statuses: SocialSourceStatus[] = [];
  const posts: SocialPost[] = [];

  // Sources are polled in parallel but settled individually — one rejection
  // must not discard the results that already arrived.
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      if (!source.isConfigured()) {
        return { source, posts: [] as SocialPost[], unconfigured: true };
      }
      const raws = await source.fetch(options);
      const normalized: SocialPost[] = [];
      for (const raw of raws) {
        const post = source.normalize(raw);
        // A payload the normaliser cannot map is dropped loudly, not silently.
        if (!post) {
          logger.warn('Beitrag konnte nicht normalisiert werden', {
            sourceId: source.sourceId,
            externalId: raw.externalId,
          });
          continue;
        }
        normalized.push(post);
      }
      return { source, posts: normalized, unconfigured: false };
    }),
  );

  for (const [index, result] of results.entries()) {
    const source = sources[index];
    if (!source) continue;

    if (result.status === 'rejected') {
      const message = toErrorMessage(result.reason);
      logger.error('Social-Quelle fehlgeschlagen', { sourceId: source.sourceId, reason: message });
      statuses.push({
        sourceId: source.sourceId,
        label: source.label,
        state: 'failed',
        postCount: 0,
        message,
      });
      continue;
    }

    if (result.value.unconfigured) {
      statuses.push({
        sourceId: source.sourceId,
        label: source.label,
        state: 'unconfigured',
        postCount: 0,
        message: source.setupHint,
      });
      continue;
    }

    posts.push(...result.value.posts);
    statuses.push({
      sourceId: source.sourceId,
      label: source.label,
      state: 'ok',
      postCount: result.value.posts.length,
    });
  }

  posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return { posts, sourceStatus: statuses, fetchedAt: new Date().toISOString() };
}
