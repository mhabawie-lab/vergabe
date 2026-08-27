import Link from 'next/link';

import { cn } from '@/lib/cn';
import { TIMEFRAMES, type Timeframe } from '@/modules/market/types';

export function TimeframePicker({
  active,
  basePath,
}: {
  active: Timeframe;
  basePath: string;
}) {
  return (
    <div className="flex items-center gap-px" role="group" aria-label="Zeitfenster">
      {TIMEFRAMES.map((timeframe) => (
        <Link
          key={timeframe}
          href={`${basePath}?tf=${timeframe}`}
          aria-current={timeframe === active ? 'true' : undefined}
          className={cn(
            'border px-2 py-1 font-mono text-[0.6875rem] transition-colors',
            timeframe === active
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-rule text-ink-soft hover:border-rule-strong hover:text-ink',
          )}
        >
          {timeframe}
        </Link>
      ))}
    </div>
  );
}

export function parseTimeframe(value: string | undefined): Timeframe {
  return TIMEFRAMES.includes(value as Timeframe) ? (value as Timeframe) : '1h';
}
