import { describe, expect, it } from 'vitest';

import { DomainRuleError } from '@/lib/errors';
import { createPortfolio, executeOrder, FEE_RATE, valuePortfolio } from '@/modules/paper/engine';
import type { Portfolio } from '@/modules/paper/types';

const NOW = '2024-06-01T10:00:00.000Z';

function buy(portfolio: Portfolio, quantity: number, price: number, id = 't1') {
  return executeOrder({
    portfolio,
    symbol: 'BTC',
    side: 'BUY',
    quantity,
    price,
    rationale: 'Test',
    executedAt: NOW,
    tradeId: id,
  });
}

describe('executeOrder', () => {
  it('charges the fee on top of the notional when buying', () => {
    const start = createPortfolio(10_000, NOW);
    const { portfolio } = buy(start, 0.1, 20_000);
    const expectedCost = 2_000 + 2_000 * FEE_RATE;
    expect(portfolio.cash).toBeCloseTo(10_000 - expectedCost, 8);
  });

  it('includes the fee in the average entry price', () => {
    const { portfolio } = buy(createPortfolio(10_000, NOW), 0.1, 20_000);
    const position = portfolio.positions[0];
    expect(position).toBeDefined();
    // 2002 paid for 0.1 BTC — the break-even is above the fill price.
    expect(position?.averagePrice).toBeCloseTo(20_020, 6);
  });

  it('refuses a buy that exceeds the available cash', () => {
    expect(() => buy(createPortfolio(100, NOW), 1, 20_000)).toThrow(DomainRuleError);
  });

  it('refuses to sell more than is held', () => {
    const { portfolio } = buy(createPortfolio(10_000, NOW), 0.1, 20_000);
    expect(() =>
      executeOrder({
        portfolio,
        symbol: 'BTC',
        side: 'SELL',
        quantity: 0.5,
        price: 21_000,
        rationale: 'Test',
        executedAt: NOW,
        tradeId: 't2',
      }),
    ).toThrow(DomainRuleError);
  });

  it('rejects a non-positive quantity', () => {
    expect(() => buy(createPortfolio(10_000, NOW), 0, 20_000)).toThrow(DomainRuleError);
  });

  it('averages the entry across two buys', () => {
    const first = buy(createPortfolio(10_000, NOW), 0.1, 20_000, 'a');
    const second = buy(first.portfolio, 0.1, 22_000, 'b');
    const position = second.portfolio.positions[0];
    expect(position?.quantity).toBeCloseTo(0.2, 10);
    expect(position?.averagePrice).toBeGreaterThan(20_020);
    expect(position?.averagePrice).toBeLessThan(22_022);
  });

  it('records realised profit and removes a fully closed position', () => {
    const { portfolio } = buy(createPortfolio(10_000, NOW), 0.1, 20_000);
    const sold = executeOrder({
      portfolio,
      symbol: 'BTC',
      side: 'SELL',
      quantity: 0.1,
      price: 25_000,
      rationale: 'Ziel erreicht',
      executedAt: NOW,
      tradeId: 't2',
    });

    expect(sold.portfolio.positions).toHaveLength(0);
    expect(sold.trade.realizedPnl).not.toBeNull();
    expect(sold.trade.realizedPnl as number).toBeGreaterThan(0);
    // Profit is net of both fees, so it stays under the gross 500.
    expect(sold.trade.realizedPnl as number).toBeLessThan(500);
  });
});

describe('valuePortfolio', () => {
  it('values open positions at the current price', () => {
    const { portfolio } = buy(createPortfolio(10_000, NOW), 0.1, 20_000);
    const valuation = valuePortfolio(portfolio, new Map([['BTC', 25_000]]));
    expect(valuation.positionsValue).toBeCloseTo(2_500, 6);
    expect(valuation.totalPnl).toBeGreaterThan(0);
  });

  it('falls back to the entry price when no quote is available', () => {
    const { portfolio } = buy(createPortfolio(10_000, NOW), 0.1, 20_000);
    const valuation = valuePortfolio(portfolio, new Map());
    // Without a quote the position is worth what it cost — not zero.
    expect(valuation.positions[0]?.unrealizedPnl).toBeCloseTo(0, 6);
  });
});
