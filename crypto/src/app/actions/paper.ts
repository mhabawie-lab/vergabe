'use server';

/**
 * Server actions for the paper depot.
 *
 * These orchestrate only: validate the input, fetch an authoritative price,
 * hand both to the domain engine, persist the result. No trading rule lives
 * here — those belong in `modules/paper/engine`.
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { z } from 'zod';

import { DomainRuleError, toErrorMessage } from '@/lib/errors';
import { formatPrice, formatQuantity } from '@/lib/format';
import { logger } from '@/lib/logging';
import { fetchPriceMap } from '@/modules/analysis/service';
import { executeOrder } from '@/modules/paper/engine';
import { loadPortfolio, resetPortfolio, savePortfolio } from '@/modules/paper/store';
import { findAssetBySymbol } from '@/modules/market/universe';

export interface OrderActionState {
  readonly status: 'idle' | 'success' | 'error';
  readonly message: string;
}

const orderSchema = z.object({
  symbol: z.string().min(1, 'Kein Coin ausgewählt.'),
  side: z.union([z.literal('BUY'), z.literal('SELL')]),
  quantity: z.coerce.number().positive('Die Menge muss größer als 0 sein.'),
  rationale: z.string().max(280).optional(),
});

export async function placePaperOrder(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const parsed = orderSchema.safeParse({
    symbol: formData.get('symbol'),
    side: formData.get('side'),
    quantity: formData.get('quantity'),
    rationale: formData.get('rationale'),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { status: 'error', message: first?.message ?? 'Eingabe ungültig.' };
  }

  const { symbol, side, quantity, rationale } = parsed.data;

  if (!findAssetBySymbol(symbol)) {
    return { status: 'error', message: `${symbol} gehört nicht zu den beobachteten Coins.` };
  }

  try {
    // The fill price comes from the market source, never from the form — a
    // client-supplied price would let the depot be filled at any number.
    const { prices, isDemo } = await fetchPriceMap();
    const price = prices.get(symbol);
    if (price === undefined) {
      return { status: 'error', message: `Für ${symbol} liegt gerade kein Kurs vor.` };
    }

    const portfolio = await loadPortfolio();
    const { portfolio: next, trade } = executeOrder({
      portfolio,
      symbol,
      side,
      quantity,
      price,
      rationale: rationale?.trim() || 'Manuell im Depot ausgelöst',
      executedAt: new Date().toISOString(),
      tradeId: randomUUID(),
    });

    await savePortfolio(next);
    logger.info('Papier-Order ausgeführt', {
      stage: 'paper',
      asset: symbol,
      side,
      quantity,
      isDemo,
    });

    revalidatePath('/depot');
    revalidatePath(`/coins/${symbol}`);

    const verb = side === 'BUY' ? 'Gekauft' : 'Verkauft';
    return {
      status: 'success',
      message: `${verb}: ${formatQuantity(trade.quantity)} ${symbol} zu ${formatPrice(trade.price)}${
        isDemo ? ' (DEMO-Kurs)' : ''
      }.`,
    };
  } catch (error) {
    if (error instanceof DomainRuleError) {
      return { status: 'error', message: error.message };
    }
    logger.error('Papier-Order fehlgeschlagen', {
      stage: 'paper',
      asset: symbol,
      reason: toErrorMessage(error),
    });
    return { status: 'error', message: 'Die Order konnte nicht ausgeführt werden.' };
  }
}

export async function resetPaperDepot(): Promise<void> {
  await resetPortfolio();
  logger.info('Papier-Depot zurückgesetzt', { stage: 'paper' });
  revalidatePath('/depot');
}
