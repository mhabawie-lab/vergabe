import { OrderForm } from '@/components/paper/order-form';
import { Badge, DemoBadge } from '@/components/ui/badge';
import { Panel, PanelHeader } from '@/components/ui/card';
import { resetPaperDepot } from '@/app/actions/paper';
import { formatDateTime, formatPercent, formatPrice, formatQuantity } from '@/lib/format';
import { fetchPriceMap } from '@/modules/analysis/service';
import { ASSETS } from '@/modules/market/universe';
import { valuePortfolio } from '@/modules/paper/engine';
import { loadPortfolio } from '@/modules/paper/store';

export const dynamic = 'force-dynamic';

export default async function DepotPage() {
  const [portfolio, { prices, isDemo }] = await Promise.all([loadPortfolio(), fetchPriceMap()]);
  const valuation = valuePortfolio(portfolio, prices);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Simuliert · kein echtes Geld</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Depot</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Orders werden zum aktuellen Kurs ausgeführt, mit 0,1 % Gebühr. So lässt sich eine
            Strategie testen, bevor sie etwas kosten kann.
          </p>
        </div>
        {isDemo ? <DemoBadge /> : null}
      </header>

      <div className="grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Gesamtwert" value={formatPrice(valuation.totalValue)} />
        <Figure
          label="Gewinn/Verlust"
          value={formatPrice(valuation.totalPnl)}
          tone={valuation.totalPnl >= 0 ? 'up' : 'down'}
          note={formatPercent(valuation.totalPnlPercent)}
        />
        <Figure label="Freies Guthaben" value={formatPrice(valuation.cash)} />
        <Figure
          label="Realisiert"
          value={formatPrice(valuation.realizedPnl)}
          tone={valuation.realizedPnl >= 0 ? 'up' : 'down'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Panel>
          <PanelHeader title="Positionen" meta={`${valuation.positions.length} offen`} />
          {valuation.positions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-soft">
              Noch keine Position. Rechts eine Order aufgeben — oder im Radar eine Coin auswählen.
            </p>
          ) : (
            <ul className="divide-y divide-rule">
              {valuation.positions.map((position) => (
                <li key={position.symbol} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <span className="w-16 font-display text-base font-semibold">
                    {position.symbol}
                  </span>
                  <span className="tnum w-32 text-sm">{formatQuantity(position.quantity)}</span>
                  <div className="w-28">
                    <span className="eyebrow">Einstieg</span>
                    <p className="tnum text-sm">{formatPrice(position.averagePrice)}</p>
                  </div>
                  <div className="w-28">
                    <span className="eyebrow">Aktuell</span>
                    <p className="tnum text-sm">{formatPrice(position.price)}</p>
                  </div>
                  <div className="w-32">
                    <span className="eyebrow">Wert</span>
                    <p className="tnum text-sm">{formatPrice(position.marketValue)}</p>
                  </div>
                  <div className="w-32">
                    <span className="eyebrow">G/V</span>
                    <p
                      className={`tnum text-sm ${
                        position.unrealizedPnl >= 0 ? 'text-up' : 'text-down'
                      }`}
                    >
                      {formatPrice(position.unrealizedPnl)} ·{' '}
                      {formatPercent(position.unrealizedPnlPercent)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Order aufgeben" />
          <OrderForm symbols={ASSETS.map((asset) => asset.symbol)} />
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Handelsbuch" meta={`${portfolio.trades.length} Ausführungen`} />
        {portfolio.trades.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">Noch keine Ausführung.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {portfolio.trades.slice(0, 50).map((trade) => (
              <li key={trade.tradeId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Badge tone={trade.side === 'BUY' ? 'up' : 'down'}>
                  {trade.side === 'BUY' ? 'Kauf' : 'Verkauf'}
                </Badge>
                <span className="w-16 font-display font-semibold">{trade.symbol}</span>
                <span className="tnum w-28 text-sm">{formatQuantity(trade.quantity)}</span>
                <span className="tnum w-28 text-sm">{formatPrice(trade.price)}</span>
                <span className="tnum w-24 text-xs text-ink-faint">
                  Gebühr {formatPrice(trade.fee)}
                </span>
                {trade.realizedPnl !== null ? (
                  <span
                    className={`tnum w-28 text-sm ${
                      trade.realizedPnl >= 0 ? 'text-up' : 'text-down'
                    }`}
                  >
                    {formatPrice(trade.realizedPnl)}
                  </span>
                ) : null}
                <span className="text-xs text-ink-soft">{trade.rationale}</span>
                <span className="ml-auto font-mono text-[0.625rem] text-ink-faint">
                  {formatDateTime(trade.executedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <form action={resetPaperDepot}>
        <button
          type="submit"
          className="border border-rule px-3 py-2 font-display text-sm text-ink-soft transition-colors hover:border-down/50 hover:text-down"
        >
          Depot zurücksetzen
        </button>
      </form>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'up' | 'down';
}) {
  return (
    <div className="bg-surface px-4 py-4">
      <p className="eyebrow">{label}</p>
      <p
        className={`tnum mt-1 text-xl ${
          tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {note ? <p className="tnum text-xs text-ink-faint">{note}</p> : null}
    </div>
  );
}
