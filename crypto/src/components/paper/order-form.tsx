'use client';

import { useActionState } from 'react';

import { placePaperOrder, type OrderActionState } from '@/app/actions/paper';
import { cn } from '@/lib/cn';

const INITIAL: OrderActionState = { status: 'idle', message: '' };

/**
 * Paper order entry. The form never sends a price — the server fills at the
 * current quote — so what the user submits is only intent and size.
 */
export function OrderForm({
  symbol,
  symbols,
  className,
}: {
  symbol?: string;
  symbols?: readonly string[];
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(placePaperOrder, INITIAL);

  return (
    <form action={formAction} className={cn('space-y-3 p-4', className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow">Coin</span>
          {symbols ? (
            <select
              name="symbol"
              defaultValue={symbol ?? symbols[0]}
              className="mt-1 w-full border border-rule bg-surface px-2 py-1.5 font-mono text-sm"
            >
              {symbols.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="symbol" value={symbol} />
              <output className="mt-1 block border border-rule bg-surface-sunk px-2 py-1.5 font-mono text-sm">
                {symbol}
              </output>
            </>
          )}
        </label>

        <label className="block">
          <span className="eyebrow">Menge</span>
          <input
            name="quantity"
            type="number"
            step="any"
            min="0"
            required
            placeholder="0,05"
            className="mt-1 w-full border border-rule bg-surface px-2 py-1.5 font-mono text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="eyebrow">Begründung</span>
        <input
          name="rationale"
          type="text"
          maxLength={280}
          placeholder="Warum diese Position?"
          className="mt-1 w-full border border-rule bg-surface px-2 py-1.5 text-sm"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          name="side"
          value="BUY"
          disabled={pending}
          className="flex-1 border border-up/50 bg-up/10 px-3 py-2 font-display text-sm font-medium text-up transition-colors hover:bg-up/20 disabled:opacity-50"
        >
          Kaufen
        </button>
        <button
          type="submit"
          name="side"
          value="SELL"
          disabled={pending}
          className="flex-1 border border-down/50 bg-down/10 px-3 py-2 font-display text-sm font-medium text-down transition-colors hover:bg-down/20 disabled:opacity-50"
        >
          Verkaufen
        </button>
      </div>

      {state.status !== 'idle' ? (
        <p
          role="status"
          className={cn(
            'border px-3 py-2 text-sm',
            state.status === 'success'
              ? 'border-up/40 bg-up/5 text-up'
              : 'border-down/40 bg-down/5 text-down',
          )}
        >
          {state.message}
        </p>
      ) : null}

      <p className="text-xs text-ink-faint">
        Simulierte Ausführung zum aktuellen Kurs, inklusive 0,1 % Gebühr. Es wird kein echtes Geld
        bewegt.
      </p>
    </form>
  );
}
