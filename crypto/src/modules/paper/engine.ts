/**
 * Paper trading execution.
 *
 * Pure functions: a portfolio plus an order produces a new portfolio. No I/O,
 * no clock of its own — the caller supplies price and time — so every rule here
 * is directly testable.
 */

import { DomainRuleError } from '@/lib/errors';

import type { OrderSide, Portfolio, PortfolioValuation, Position, Trade } from './types';

/** Taker fee applied to every fill, matching a typical exchange rate. */
export const FEE_RATE = 0.001;

export interface ExecuteOrderInput {
  readonly portfolio: Portfolio;
  readonly symbol: string;
  readonly side: OrderSide;
  /** Quantity in base currency (e.g. BTC). */
  readonly quantity: number;
  readonly price: number;
  readonly rationale: string;
  readonly executedAt: string;
  readonly tradeId: string;
}

export interface ExecuteOrderResult {
  readonly portfolio: Portfolio;
  readonly trade: Trade;
}

export function createPortfolio(startingCash: number, now: string): Portfolio {
  return {
    cash: startingCash,
    positions: [],
    trades: [],
    startingCash,
    createdAt: now,
    updatedAt: now,
  };
}

export function executeOrder(input: ExecuteOrderInput): ExecuteOrderResult {
  const { portfolio, symbol, side, quantity, price, rationale, executedAt, tradeId } = input;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new DomainRuleError('Die Menge muss größer als 0 sein.', { symbol, quantity });
  }
  if (!Number.isFinite(price) || price <= 0) {
    throw new DomainRuleError('Es liegt kein gültiger Kurs vor.', { symbol, price });
  }

  const gross = quantity * price;
  const fee = gross * FEE_RATE;
  const existing = portfolio.positions.find((position) => position.symbol === symbol);

  if (side === 'BUY') {
    const cost = gross + fee;
    if (cost > portfolio.cash) {
      throw new DomainRuleError(
        `Nicht genug Guthaben: ${cost.toFixed(2)} USD benötigt, ${portfolio.cash.toFixed(2)} USD verfügbar.`,
        { symbol, required: cost, available: portfolio.cash },
      );
    }

    const newQuantity = (existing?.quantity ?? 0) + quantity;
    // The average entry includes the fee, so the break-even price the UI shows
    // is the real one rather than a fee-free fiction.
    const newCostBasis = (existing?.quantity ?? 0) * (existing?.averagePrice ?? 0) + cost;
    const position: Position = {
      symbol,
      quantity: newQuantity,
      averagePrice: newCostBasis / newQuantity,
    };

    const trade: Trade = {
      tradeId,
      symbol,
      side,
      quantity,
      price,
      fee,
      executedAt,
      rationale,
      realizedPnl: null,
    };

    return {
      portfolio: {
        ...portfolio,
        cash: portfolio.cash - cost,
        positions: upsertPosition(portfolio.positions, position),
        trades: [trade, ...portfolio.trades],
        updatedAt: executedAt,
      },
      trade,
    };
  }

  if (!existing || existing.quantity < quantity) {
    throw new DomainRuleError(
      `Nicht genug ${symbol} im Bestand: ${quantity} sollen verkauft werden, ${existing?.quantity ?? 0} vorhanden.`,
      { symbol, requested: quantity, held: existing?.quantity ?? 0 },
    );
  }

  const proceeds = gross - fee;
  const realizedPnl = proceeds - quantity * existing.averagePrice;
  const remaining = existing.quantity - quantity;

  const trade: Trade = {
    tradeId,
    symbol,
    side,
    quantity,
    price,
    fee,
    executedAt,
    rationale,
    realizedPnl,
  };

  const positions =
    // A fully closed position is removed rather than kept at quantity 0, so the
    // portfolio view shows what is actually held.
    remaining <= 1e-12
      ? portfolio.positions.filter((position) => position.symbol !== symbol)
      : upsertPosition(portfolio.positions, { ...existing, quantity: remaining });

  return {
    portfolio: {
      ...portfolio,
      cash: portfolio.cash + proceeds,
      positions,
      trades: [trade, ...portfolio.trades],
      updatedAt: executedAt,
    },
    trade,
  };
}

function upsertPosition(
  positions: readonly Position[],
  position: Position,
): readonly Position[] {
  const index = positions.findIndex((entry) => entry.symbol === position.symbol);
  if (index === -1) return [...positions, position];
  const next = [...positions];
  next[index] = position;
  return next;
}

export function valuePortfolio(
  portfolio: Portfolio,
  prices: ReadonlyMap<string, number>,
): PortfolioValuation {
  const positions = portfolio.positions.map((position) => {
    // A missing quote must not silently value a position at zero; the entry
    // price is the honest fallback and keeps total value interpretable.
    const price = prices.get(position.symbol) ?? position.averagePrice;
    const marketValue = position.quantity * price;
    const costBasis = position.quantity * position.averagePrice;
    return {
      ...position,
      price,
      marketValue,
      unrealizedPnl: marketValue - costBasis,
      unrealizedPnlPercent: costBasis === 0 ? 0 : (marketValue - costBasis) / costBasis,
    };
  });

  const positionsValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const totalValue = portfolio.cash + positionsValue;
  const realizedPnl = portfolio.trades.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);

  return {
    cash: portfolio.cash,
    positions,
    positionsValue,
    totalValue,
    totalPnl: totalValue - portfolio.startingCash,
    totalPnlPercent:
      portfolio.startingCash === 0 ? 0 : (totalValue - portfolio.startingCash) / portfolio.startingCash,
    realizedPnl,
    startingCash: portfolio.startingCash,
  };
}
