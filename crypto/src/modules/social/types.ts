/**
 * Internal social/news format.
 *
 * Posts from X, Reddit, news feeds and any future platform are normalised into
 * `SocialPost`. The untouched source payload stays in `raw` — it is never
 * overwritten or edited, so a normalisation bug can be fixed and replayed
 * without re-fetching. Source and source-side id are always kept.
 */

export type SocialPlatform = 'x' | 'reddit' | 'news' | 'demo';

export interface RawSocialPost {
  readonly sourceId: string;
  readonly externalId: string;
  readonly fetchedAt: string;
  /** The source's payload exactly as received. */
  readonly payload: unknown;
}

export interface SocialAuthor {
  readonly handle: string;
  readonly displayName?: string;
  /** Follower count where the platform reports it — drives reach weighting. */
  readonly followers?: number;
}

export interface SocialEngagement {
  readonly likes: number;
  readonly reposts: number;
  readonly replies: number;
}

export interface SocialPost {
  /** Stable internal id: `${sourceId}:${externalId}`. */
  readonly postId: string;
  readonly sourceId: string;
  readonly platform: SocialPlatform;
  /** The source's own identifier — kept for every record, always. */
  readonly externalId: string;
  readonly url: string;
  readonly text: string;
  readonly language?: string;
  readonly author: SocialAuthor;
  readonly engagement: SocialEngagement;
  readonly publishedAt: string;
  readonly fetchedAt: string;
  /** Asset symbols mentioned in the text, resolved against the universe. */
  readonly assetSymbols: readonly string[];
  readonly isDemo: boolean;
  /** The untouched source payload. Never modified after import. */
  readonly raw: unknown;
}

export interface SocialFetchOptions {
  /** Restrict the query to these asset symbols, e.g. ['BTC', 'ETH']. */
  readonly symbols: readonly string[];
  /** Maximum posts to return per source. */
  readonly limit: number;
  /** Only posts newer than this ISO timestamp. */
  readonly since?: string;
}

export interface SocialSource {
  readonly sourceId: string;
  readonly platform: SocialPlatform;
  readonly label: string;
  /** Whether credentials for this source are present. */
  isConfigured(): boolean;
  /** Human-readable hint shown in the UI when the source is not configured. */
  readonly setupHint: string;
  fetch(options: SocialFetchOptions): Promise<readonly RawSocialPost[]>;
  /** Maps one raw payload into the internal format. Pure — no I/O. */
  normalize(raw: RawSocialPost): SocialPost | null;
}
