/**
 * Paper trading domain.
 *
 * Orders are filled against real quoted prices but with simulated money. The
 * portfolio is deliberately a separate module from any live-exchange adapter:
 * paper and live must never share an execution path, so that a configuration
 * mistake cannot turn a simulated order into a real one.
 */

export type OrderSide = 'BUY' | 'SELL';

export interface Position {
  readonly symbol: string;
  readonly quantity: number;
  /** Volume-weighted average entry price in quote currency. */
  readonly averagePrice: number;
}

export interface Trade {
  readonly tradeId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly price: number;
  /** Fee charged in quote currency. */
  readonly fee: number;
  readonly executedAt: string;
  /** Why the trade happened — manual, or the signal that triggered it. */
  readonly rationale: string;
  /** Realised profit or loss in quote currency; only set on closing trades. */
  readonly realizedPnl: number | null;
}

export interface Portfolio {
  /** Free quote currency (USD) available for new positions. */
  readonly cash: number;
  readonly positions: readonly Position[];
  readonly trades: readonly Trade[];
  readonly startingCash: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PositionValuation extends Position {
  readonly price: number;
  readonly marketValue: number;
  readonly unrealizedPnl: number;
  readonly unrealizedPnlPercent: number;
}

export interface PortfolioValuation {
  readonly cash: number;
  readonly positions: readonly PositionValuation[];
  readonly positionsValue: number;
  readonly totalValue: number;
  readonly totalPnl: number;
  readonly totalPnlPercent: number;
  readonly realizedPnl: number;
  readonly startingCash: number;
}
