import type { Candle } from '@/modules/market/types';

/**
 * Inline price trace for table rows. Deliberately unlabelled — it shows shape,
 * not values; the numbers next to it carry the precision.
 */
export function Sparkline({
  candles,
  width = 72,
  height = 24,
}: {
  candles: readonly Candle[];
  width?: number;
  height?: number;
}) {
  if (candles.length < 2) return <svg width={width} height={height} aria-hidden="true" />;

  const closes = candles.map((candle) => candle.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const points = closes
    .map((close, index) => {
      const x = (index / (closes.length - 1)) * width;
      const y = height - ((close - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const first = closes[0] ?? 0;
  const last = closes.at(-1) ?? 0;
  const color = last >= first ? 'var(--c-up)' : 'var(--c-down)';

  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.25} />
    </svg>
  );
}
