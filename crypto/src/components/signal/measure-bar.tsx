import { cn } from '@/lib/cn';
import type { Verdict } from '@/modules/signals/types';

/**
 * The score as a measurement, not a verdict badge.
 *
 * The mark is the score on a shared 0–100 axis; the band around it is the
 * uncertainty. Confidence 1 draws a tight band, confidence 0 draws a wide,
 * washed-out one — so a high score built on three anonymous posts *looks*
 * unreliable next to a lower score built on a full candle history. Every row on
 * a page shares the same axis, which is what makes them comparable at a glance.
 */

/** Half-width of the uncertainty band at zero confidence, in score points. */
const MAX_BAND_HALF_WIDTH = 22;

const VERDICT_COLOR: Readonly<Record<Verdict, string>> = {
  KAUFEN: 'var(--c-up)',
  BEOBACHTEN: 'var(--c-caution)',
  MEIDEN: 'var(--c-down)',
};

export function MeasureBar({
  score,
  confidence,
  verdict,
  className,
  showAxis = false,
}: {
  score: number;
  confidence: number;
  verdict: Verdict;
  className?: string;
  showAxis?: boolean;
}) {
  const halfWidth = (1 - Math.max(0, Math.min(1, confidence))) * MAX_BAND_HALF_WIDTH;
  const low = Math.max(0, score - halfWidth);
  const high = Math.min(100, score + halfWidth);
  const color = VERDICT_COLOR[verdict];

  const label =
    `Score ${score} von 100, Unsicherheitsspanne ${Math.round(low)} bis ${Math.round(high)}, ` +
    `Konfidenz ${Math.round(confidence * 100)} Prozent`;

  return (
    <div className={cn('w-full', className)}>
      <div className="measure-track" role="img" aria-label={label}>
        <div
          className="measure-band"
          style={{
            left: `${low}%`,
            width: `${Math.max(high - low, 0.8)}%`,
            backgroundColor: color,
            // The band fades as it widens: less certainty, less ink.
            opacity: 0.14 + confidence * 0.2,
          }}
        />
        <div
          className="measure-mark"
          style={{ left: `calc(${score}% - 1px)`, backgroundColor: color }}
        />
      </div>
      {showAxis ? (
        <div className="mt-1 flex justify-between font-mono text-[0.625rem] text-ink-faint">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      ) : null}
    </div>
  );
}
