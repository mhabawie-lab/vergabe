import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Panel, PanelHeader } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { buildRadar } from '@/modules/analysis/service';
import type { SourceState } from '@/modules/social/service';

export const dynamic = 'force-dynamic';

const STATE_LABELS: Readonly<Record<SourceState, string>> = {
  ok: 'Läuft',
  unconfigured: 'Nicht eingerichtet',
  failed: 'Fehlgeschlagen',
};

const STATE_TONES: Readonly<Record<SourceState, BadgeTone>> = {
  ok: 'up',
  unconfigured: 'caution',
  failed: 'down',
};

export default async function SourcesPage() {
  const radar = await buildRadar('1h');

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Anbindungen</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Quellen</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Welche Datenquelle gerade liefert und welche nicht. Eine ausgefallene Quelle blockiert die
          anderen nicht — sie fehlt nur in der Auswertung.
        </p>
      </header>

      <Panel>
        <PanelHeader title="Marktdaten" meta={formatDateTime(radar.evaluatedAt)} />
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <Badge tone={radar.marketIsDemo ? 'caution' : 'up'}>
            {radar.marketIsDemo ? 'Demo' : 'Live'}
          </Badge>
          <span className="font-display text-sm font-medium">{radar.marketSourceLabel}</span>
          <span className="text-sm text-ink-soft">
            {radar.marketIsDemo
              ? 'Es werden synthetische Kurse verwendet. Setze MARKET_SOURCES=binance und stelle sicher, dass die API erreichbar ist.'
              : 'Kurse und Kerzen kommen von dieser Börse.'}
          </span>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Social & Nachrichten" meta={`${radar.posts.length} Beiträge geladen`} />
        <ul className="divide-y divide-rule">
          {radar.socialStatus.map((status) => (
            <li key={status.sourceId} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={STATE_TONES[status.state]}>{STATE_LABELS[status.state]}</Badge>
                <span className="font-display text-sm font-medium">{status.label}</span>
                <span className="font-mono text-xs text-ink-faint">
                  {status.postCount} Beiträge
                </span>
              </div>
              {status.message ? (
                <p className="mt-1 text-sm text-ink-soft">{status.message}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader title="Einrichtung" />
        <div className="space-y-3 px-4 py-4 text-sm text-ink-soft">
          <p>
            Alle Zugangsdaten gehören in <code className="font-mono text-ink">.env.local</code>, nie
            in den Quellcode. Ohne Konfiguration läuft die App vollständig im Demo-Modus.
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <code className="font-mono text-ink">MARKET_SOURCES</code> — Reihenfolge der
              Kursquellen, z. B. <code className="font-mono">binance,coingecko,demo</code>
            </li>
            <li>
              <code className="font-mono text-ink">SOCIAL_SOURCES</code> — welche sozialen Quellen
              abgefragt werden
            </li>
            <li>
              <code className="font-mono text-ink">X_BEARER_TOKEN</code> — Lesezugriff auf X;
              erfordert einen kostenpflichtigen API-Plan
            </li>
            <li>
              <code className="font-mono text-ink">NEWS_FEED_URLS</code> — eigene RSS-Feeds,
              kommagetrennt
            </li>
          </ul>
        </div>
      </Panel>
    </div>
  );
}
