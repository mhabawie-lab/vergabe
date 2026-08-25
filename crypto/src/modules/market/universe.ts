/**
 * The tracked asset universe.
 *
 * Kept as data rather than scattered string literals so that adding a coin is
 * a one-line change and every stage of the pipeline agrees on identifiers.
 */

import type { Asset } from './types';

export const ASSETS: readonly Asset[] = [
  { assetId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { assetId: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { assetId: 'solana', symbol: 'SOL', name: 'Solana' },
  { assetId: 'ripple', symbol: 'XRP', name: 'XRP' },
  { assetId: 'cardano', symbol: 'ADA', name: 'Cardano' },
  { assetId: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  { assetId: 'avalanche', symbol: 'AVAX', name: 'Avalanche' },
  { assetId: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
  { assetId: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
  { assetId: 'litecoin', symbol: 'LTC', name: 'Litecoin' },
] as const;

const BY_ID = new Map(ASSETS.map((asset) => [asset.assetId, asset]));
const BY_SYMBOL = new Map(ASSETS.map((asset) => [asset.symbol, asset]));

export function findAssetById(assetId: string): Asset | undefined {
  return BY_ID.get(assetId);
}

export function findAssetBySymbol(symbol: string): Asset | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}
