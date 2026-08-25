import { Badge, DemoBadge } from '@/components/ui/badge';
import { formatCompact, formatRelativeTime } from '@/lib/format';
import { scorePost } from '@/modules/sentiment/score';
import type { SocialPost } from '@/modules/social/types';

const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  x: 'X',
  reddit: 'Reddit',
  news: 'News',
  demo: 'Demo',
};

/**
 * The evidence behind a sentiment score. Posts the spam filter removed are
 * still shown, marked and struck through — hiding them would hide the fact that
 * a coin's chatter is being manufactured.
 */
export function PostList({ posts }: { posts: readonly SocialPost[] }) {
  if (posts.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-ink-soft">
        Keine Beiträge im aktuellen Abruf. Prüfe unter „Quellen“, welche Anbindung aktiv ist.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-rule">
      {posts.map((post) => {
        const sentiment = scorePost(post);
        return (
          <li key={post.postId} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{PLATFORM_LABELS[post.platform] ?? post.platform}</Badge>
              <span className="font-mono text-xs text-ink-soft">@{post.author.handle}</span>
              {post.author.followers ? (
                <span className="font-mono text-[0.625rem] text-ink-faint">
                  {formatCompact(post.author.followers)} Follower
                </span>
              ) : null}
              {post.isDemo ? <DemoBadge /> : null}
              {sentiment.isSpam ? <Badge tone="down">Aussortiert</Badge> : null}
              <span className="ml-auto font-mono text-[0.625rem] text-ink-faint">
                {formatRelativeTime(post.publishedAt)}
              </span>
            </div>

            <p
              className={`mt-1.5 text-sm ${
                sentiment.isSpam ? 'text-ink-faint line-through decoration-1' : 'text-ink'
              }`}
            >
              {post.url && post.url !== '#' ? (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="hover:underline"
                >
                  {post.text}
                </a>
              ) : (
                post.text
              )}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-3 font-mono text-[0.625rem] text-ink-faint">
              <span className={sentiment.score >= 0 ? 'text-up' : 'text-down'}>
                Stimmung {sentiment.score >= 0 ? '+' : ''}
                {sentiment.score.toFixed(2)}
              </span>
              <span>Konfidenz {Math.round(sentiment.confidence * 100)} %</span>
              {post.assetSymbols.length > 0 ? <span>{post.assetSymbols.join(' · ')}</span> : null}
              {sentiment.spamReasons.length > 0 ? (
                <span className="text-down">{sentiment.spamReasons.join(', ')}</span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
