import type { SignalReason } from '@/modules/signals/types';

/**
 * The score's derivation, line by line. Bar length encodes the size of each
 * contribution so the reader can see which single factor is carrying a verdict
 * — a score that rests entirely on one rule is a different thing from one that
 * four rules agree on.
 */
export function ReasonList({ reasons }: { reasons: readonly SignalReason[] }) {
  if (reasons.length === 0) {
    return <p className="px-4 py-3 text-sm text-ink-soft">Keine Regel hat angeschlagen.</p>;
  }

  const maxImpact = Math.max(...reasons.map((reason) => Math.abs(reason.impact)), 1);

  return (
    <ul className="divide-y divide-rule">
      {reasons.map((reason) => {
        const positive = reason.impact >= 0;
        return (
          <li key={reason.label} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-sm font-medium">{reason.label}</span>
              <span className={`tnum text-sm ${positive ? 'text-up' : 'text-down'}`}>
                {positive ? '+' : ''}
                {reason.impact}
              </span>
            </div>
            <div className="mt-1.5 h-1 bg-surface-sunk">
              <div
                className="h-full"
                style={{
                  width: `${(Math.abs(reason.impact) / maxImpact) * 100}%`,
                  backgroundColor: positive ? 'var(--c-up)' : 'var(--c-down)',
                }}
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">{reason.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}
