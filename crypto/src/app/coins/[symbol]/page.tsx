import { notFound } from 'next/navigation';

import { CandleChart } from '@/components/chart/candle-chart';
import { OrderForm } from '@/components/paper/order-form';
import { MeasureBar } from '@/components/signal/measure-bar';
import { ReasonList } from '@/components/signal/reason-list';
import { VerdictLabel } from '@/components/signal/verdict-label';
import { WarningList } from '@/components/signal/warning-list';
import { PostList } from '@/components/social/post-list';
import { DemoBadge } from '@/components/ui/badge';
import { Panel, PanelHeader } from '@/components/ui/card';
import { parseTimeframe, TimeframePicker } from '@/components/timeframe-picker';
import { formatNumber, formatPercent, formatPrice } from '@/lib/format';
import { buildAssetDetail } from '@/modules/analysis/service';
import { TIMEFRAME_LABELS } from '@/modules/market/types';
import { findAssetBySymbol } from '@/modules/market/universe';

export const dynamic = 'force-dynamic';

export default async function CoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ tf?: string }>;
}) {
  const { symbol } = await params;
  const asset = findAssetBySymbol(symbol);
  if (!asset) notFound();

  const timeframe = parseTimeframe((await searchParams).tf);
  const detail = await buildAssetDetail(asset, timeframe);
  const { signal, sentiment } = detail;
  const indicators = signal.technical.indicators;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{asset.name}</p>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{asset.symbol}</h1>
            {signal.isDemo ? <DemoBadge /> : null}
            <VerdictLabel verdict={signal.verdict} />
          </div>
          <p className="mt-1 tnum text-2xl">
            {formatPrice(signal.price)}{' '}
            <span className={signal.change24h >= 0 ? 'text-up' : 'text-down'}>
              {formatPercent(signal.change24h)}
            </span>
          </p>
        </div>
        <TimeframePicker active={timeframe} basePath={`/coins/${asset.symbol}`} />
      </header>

      <Panel>
        <PanelHeader
          title={`Score ${signal.score} von 100`}
          meta={`Konfidenz ${Math.round(signal.confidence * 100)} % · ${signal.engineVersion}`}
        />
        <div className="p-4">
          <MeasureBar
            score={signal.score}
            confidence={signal.confidence}
            verdict={signal.verdict}
            showAxis
          />
          <p className="mt-3 text-sm text-ink-soft">
            Der Strich ist der Score, das Band die Unsicherheit. Ein breites Band heißt: die
            Datenlage trägt diese Zahl nicht.
          </p>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title={`Kursverlauf · ${TIMEFRAME_LABELS[timeframe]}`}
          meta={`Quelle ${detail.marketSourceLabel}`}
        />
        <div className="p-4">
          <CandleChart candles={detail.series.candles} />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Wie der Score zustande kommt" />
          <ReasonList reasons={signal.reasons} />
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Einschränkungen" />
            <WarningList warnings={signal.warnings} />
          </Panel>

          <Panel>
            <PanelHeader title="Indikatoren" />
            <dl className="grid grid-cols-2 gap-px bg-rule">
              <Metric label="EMA 20" value={indicators.ema20 === null ? null : formatPrice(indicators.ema20)} />
              <Metric label="EMA 50" value={indicators.ema50 === null ? null : formatPrice(indicators.ema50)} />
              <Metric label="RSI 14" value={indicators.rsi14 === null ? null : formatNumber(indicators.rsi14, 1)} />
              <Metric
                label="MACD-Histogramm"
                value={indicators.macdHistogram === null ? null : formatNumber(indicators.macdHistogram, 4)}
              />
              <Metric
                label="Volatilität (ATR)"
                value={indicators.atrPercent === null ? null : formatPercent(indicators.atrPercent)}
              />
              <Metric
                label="Stopp-Vorschlag"
                value={
                  signal.suggestedStopPercent === null
                    ? null
                    : `${formatPercent(-signal.suggestedStopPercent)} unter Einstieg`
                }
              />
            </dl>
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Social-Stimmung"
            meta={
              sentiment
                ? `${sentiment.mentionCount} Beiträge · ${sentiment.spamCount} aussortiert`
                : 'keine Daten'
            }
          />
          {sentiment ? (
            <dl className="grid grid-cols-2 gap-px bg-rule">
              <Metric label="Stimmung" value={formatNumber(sentiment.score, 2)} />
              <Metric label="Konfidenz" value={formatPercent(sentiment.confidence)} />
              <Metric
                label="Aufmerksamkeit"
                value={sentiment.buzzRatio === null ? null : `${formatNumber(sentiment.buzzRatio, 1)}×`}
              />
              <Metric label="Anteil am Gespräch" value={formatPercent(sentiment.mentionShare)} />
            </dl>
          ) : (
            <p className="px-4 py-3 text-sm text-ink-soft">
              Im aktuellen Abruf hat keine Quelle {asset.symbol} erwähnt.
            </p>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Papierhandel" meta="simuliert" />
          <OrderForm symbol={asset.symbol} />
        </Panel>
      </div>

      <Panel>
        <PanelHeader title={`Beiträge zu ${asset.symbol}`} meta={`${detail.posts.length} gefunden`} />
        <PostList posts={detail.posts.slice(0, 20)} />
      </Panel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="tnum mt-0.5 text-sm">{value ?? <span className="text-ink-faint">n. v.</span>}</dd>
    </div>
  );
}
