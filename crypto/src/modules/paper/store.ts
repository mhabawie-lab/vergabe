import 'server-only';

/**
 * Persistence for the paper portfolio.
 *
 * A JSON file under `.data/` — enough for a single-user local setup and easy to
 * inspect or delete. Swapping this for a database later means replacing this
 * module only; nothing outside it knows how the portfolio is stored.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { logger } from '@/lib/logging';

import { createPortfolio } from './engine';
import type { Portfolio } from './types';

const DATA_DIR = path.join(process.cwd(), '.data');
const FILE = path.join(DATA_DIR, 'paper-portfolio.json');
const STARTING_CASH = 10_000;

const positionSchema = z.object({
  symbol: z.string(),
  quantity: z.number(),
  averagePrice: z.number(),
});

const tradeSchema = z.object({
  tradeId: z.string(),
  symbol: z.string(),
  side: z.union([z.literal('BUY'), z.literal('SELL')]),
  quantity: z.number(),
  price: z.number(),
  fee: z.number(),
  executedAt: z.string(),
  rationale: z.string(),
  realizedPnl: z.number().nullable(),
});

const portfolioSchema = z.object({
  cash: z.number(),
  positions: z.array(positionSchema),
  trades: z.array(tradeSchema),
  startingCash: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export async function loadPortfolio(): Promise<Portfolio> {
  try {
    const contents = await readFile(FILE, 'utf8');
    const parsed = portfolioSchema.safeParse(JSON.parse(contents));
    if (parsed.success) return parsed.data;

    // A corrupt file must not silently reset someone's trade history.
    logger.error('Portfolio-Datei ist beschädigt, es wird ein leeres Depot verwendet', {
      stage: 'paper-store',
      file: FILE,
    });
  } catch (error) {
    const isMissing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    if (!isMissing) {
      logger.error('Portfolio konnte nicht gelesen werden', {
        stage: 'paper-store',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return createPortfolio(STARTING_CASH, new Date().toISOString());
}

export async function savePortfolio(portfolio: Portfolio): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(portfolio, null, 2), 'utf8');
}

export async function resetPortfolio(): Promise<Portfolio> {
  const portfolio = createPortfolio(STARTING_CASH, new Date().toISOString());
  await savePortfolio(portfolio);
  return portfolio;
}
