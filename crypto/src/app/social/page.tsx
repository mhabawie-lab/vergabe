import Link from 'next/link';

import { PostList } from '@/components/social/post-list';
import { Badge } from '@/components/ui/badge';
import { Panel, PanelHeader } from '@/components/ui/card';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format';
import { buildRadar } from '@/modules/analysis/service';

export const dynamic = 'force-dynamic';

export default async function SocialPage() {
  const radar = await buildRadar('1h');
  const ranked = [...radar.sentiments].sort((a, b) => b.mentionCount - a.mentionCount);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">X, Reddit und Nachrichtenfeeds</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Stimmung</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Was gerade über die beobachteten Coins geschrieben wird — mit dem Anteil, den der
          Spam-Filter als Pump-Werbung aussortiert hat.
        </p>
      </header>

      <Panel>
        <PanelHeader
          title="Nach Gesprächsanteil"
          meta={`${radar.posts.length} Beiträge · ${formatDateTime(radar.evaluatedAt)}`}
        />
        <ul className="divide-y divide-rule">
          {ranked.map((entry) => (
            <li key={entry.symbol} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <Link
                href={`/coins/${entry.symbol}`}
                className="w-16 font-display text-base font-semibold hover:underline"
              >
                {entry.symbol}
              </Link>

              <div className="w-28">
                <span className="eyebrow">Stimmung</span>
                <p className={`tnum text-sm ${entry.score >= 0 ? 'text-up' : 'text-down'}`}>
                  {entry.score >= 0 ? '+' : ''}
                  {formatNumber(entry.score, 2)}
                </p>
              </div>

              <div className="w-24">
                <span className="eyebrow">Konfidenz</span>
                <p className="tnum text-sm">{formatPercent(entry.confidence)}</p>
              </div>

              <div className="w-28">
                <span className="eyebrow">Erwähnungen</span>
                <p className="tnum text-sm">{entry.mentionCount}</p>
              </div>

              <div className="w-28">
                <span className="eyebrow">Aufmerksamkeit</span>
                <p className="tnum text-sm">
                  {entry.buzzRatio === null ? 'n. v.' : `${formatNumber(entry.buzzRatio, 1)}×`}
                </p>
              </div>

              {entry.spamCount > 0 ? (
                <Badge tone="down">{entry.spamCount} aussortiert</Badge>
              ) : null}
            </li>
          ))}
          {ranked.length === 0 ? (
            <li className="px-4 py-6 text-sm text-ink-soft">
              Keine Coin-Erwähnungen gefunden. Unter „Quellen“ steht, welche Anbindungen laufen.
            </li>
          ) : null}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader title="Beiträge" meta="neueste zuerst" />
        <PostList posts={radar.posts.slice(0, 40)} />
      </Panel>
    </div>
  );
}
