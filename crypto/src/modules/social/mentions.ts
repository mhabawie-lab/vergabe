/**
 * Asset mention extraction.
 *
 * Finds which tracked coins a post talks about. Deliberately conservative:
 * a false mention pollutes the sentiment of an asset that was never discussed,
 * which is worse than missing one post out of thousands.
 */

import { ASSETS } from '@/modules/market/universe';

/** Extra names that reliably refer to a coin in prose. */
const ALIASES: Readonly<Record<string, readonly string[]>> = {
  BTC: ['bitcoin'],
  ETH: ['ethereum', 'ether'],
  SOL: ['solana'],
  XRP: ['ripple'],
  ADA: ['cardano'],
  DOGE: ['dogecoin'],
  AVAX: ['avalanche'],
  LINK: ['chainlink'],
  DOT: ['polkadot'],
  LTC: ['litecoin'],
};

/**
 * Symbols that are also ordinary words. For these, only a cashtag (`$LINK`) or
 * the full name counts — a bare "link" in a sentence is not a coin mention.
 */
const AMBIGUOUS_SYMBOLS = new Set(['LINK', 'DOT']);

export function extractAssetSymbols(text: string): readonly string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  for (const asset of ASSETS) {
    const symbol = asset.symbol;
    const cashtag = new RegExp(`\\$${symbol}\\b`, 'i');
    if (cashtag.test(text)) {
      found.add(symbol);
      continue;
    }

    for (const alias of ALIASES[symbol] ?? []) {
      if (lower.includes(alias)) {
        found.add(symbol);
        break;
      }
    }
    if (found.has(symbol)) continue;

    if (AMBIGUOUS_SYMBOLS.has(symbol)) continue;

    // A bare symbol counts only as a standalone, upper-case word.
    if (new RegExp(`\\b${symbol}\\b`).test(text)) found.add(symbol);
  }

  return [...found];
}
