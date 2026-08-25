import Link from 'next/link';

import { CandleChart } from '@/components/chart/candle-chart';
import { Sparkline } from '@/components/chart/sparkline';
import { MeasureBar } from '@/components/signal/measure-bar';
import { VerdictLabel } from '@/components/signal/verdict-label';
import { DemoBadge } from '@/components/ui/badge';
import { Panel, PanelHeader } from '@/components/ui/card';
import { parseTimeframe, TimeframePicker } from '@/components/timeframe-picker';
import { formatDateTime, formatPercent, formatPrice } from '@/lib/format';
import { buildRadar } from '@/modules/analysis/service';

// Market data goes stale within a minute; the page is rendered per request.
export const dynamic = 'force-dynamic';

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ tf?: string }>;
}) {
  const params = await searchParams;
  const timeframe = parseTimeframe(params.tf);
  const radar = await buildRadar(timeframe);

  const buyCount = radar.signals.filter((signal) => signal.verdict === 'KAUFEN').length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Rangliste nach Gesamtscore</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Radar</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Jede Zeile zeigt den Score als Messwert auf einer gemeinsamen Skala. Das blasse Band um
            den Strich ist die Unsicherheit: je breiter, desto dünner die Datenlage.
          </p>
        </div>
        <TimeframePicker active={timeframe} basePath="/" />
      </header>

      <Panel>
        <PanelHeader
          title={`${radar.signals.length} Coins bewertet · ${buyCount}× Kaufen`}
          meta={
            <span className="flex items-center gap-2">
              {radar.marketIsDemo ? <DemoBadge /> : null}
              <span>
                Quelle {radar.marketSourceLabel} · {formatDateTime(radar.evaluatedAt)}
              </span>
            </span>
          }
        />

        {/* Shared axis: the whole point of the table is that rows are comparable. */}
        <div className="hidden items-center gap-4 border-b border-rule px-4 py-2 md:flex">
          <div className="w-40 shrink-0 eyebrow">Coin</div>
          <div className="w-24 shrink-0 text-right eyebrow">Kurs</div>
          <div className="w-20 shrink-0 text-right eyebrow">24 h</div>
          <div className="w-[72px] shrink-0 eyebrow">Verlauf</div>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between font-mono text-[0.625rem] text-ink-faint">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
          </div>
          <div className="w-12 shrink-0 text-right eyebrow">Score</div>
          <div className="w-24 shrink-0 text-right eyebrow">Urteil</div>
        </div>

        <ul>
          {radar.signals.map((signal) => (
            <li key={signal.assetId} className="border-b border-rule last:border-b-0">
              <Link
                href={`/coins/${signal.symbol}?tf=${timeframe}`}
                className="flex flex-wrap items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-sunk md:flex-nowrap"
              >
                <div className="w-40 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base font-semibold tracking-tight">
                      {signal.symbol}
                    </span>
                    {signal.isDemo ? <DemoBadge /> : null}
                  </div>
                  <span className="text-xs text-ink-faint">{signal.name}</span>
                </div>

                <div className="w-24 shrink-0 text-right tnum text-sm">
                  {formatPrice(signal.price)}
                </div>

                <div
                  className={`w-20 shrink-0 text-right tnum text-sm ${
                    signal.change24h >= 0 ? 'text-up' : 'text-down'
                  }`}
                >
                  {formatPercent(signal.change24h)}
                </div>

                <div className="w-[72px] shrink-0">
                  <Sparkline candles={radar.sparklines[signal.symbol] ?? []} />
                </div>

                <div className="min-w-0 flex-1 basis-full md:basis-auto">
                  <MeasureBar
                    score={signal.score}
                    confidence={signal.confidence}
                    verdict={signal.verdict}
                  />
                </div>

                <div className="w-12 shrink-0 text-right tnum text-lg font-medium">
                  {signal.score}
                </div>

                <div className="w-24 shrink-0 text-right">
                  <VerdictLabel verdict={signal.verdict} />
                </div>
              </Link>

              {signal.warnings.length > 0 ? (
                <p className="border-t border-rule/60 bg-caution/5 px-4 py-1.5 text-xs text-caution">
                  {signal.warnings[0]}
                  {signal.warnings.length > 1 ? ` (+${signal.warnings.length - 1} weitere)` : ''}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>

      {radar.skippedAssets.length > 0 ? (
        <Panel>
          <PanelHeader title="Nicht bewertet" />
          <ul className="divide-y divide-rule">
            {radar.skippedAssets.map((entry) => (
              <li key={entry.symbol} className="flex gap-3 px-4 py-2 text-sm">
                <span className="w-16 shrink-0 font-mono">{entry.symbol}</span>
                <span className="text-ink-soft">{entry.reason}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {radar.signals[0] ? (
        <Panel>
          <PanelHeader
            title={`Bestbewertet: ${radar.signals[0].name}`}
            meta={`${radar.timeframe}-Kerzen`}
          />
          <div className="p-4">
            <CandleChart candles={radar.sparklines[radar.signals[0].symbol] ?? []} height={220} />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
