import type { Candle } from '@/modules/market/types';
import { formatDateTime, formatPrice } from '@/lib/format';

/**
 * Candlestick chart drawn as plain SVG.
 *
 * No charting library: the requirements here are a price axis, wicks and bodies,
 * and it keeps the bundle free of a dependency that would arrive with its own
 * theming. Rendered server-side, so it needs no client JavaScript at all.
 */
export function CandleChart({
  candles,
  height = 300,
}: {
  candles: readonly Candle[];
  height?: number;
}) {
  const visible = candles.slice(-120);
  if (visible.length === 0) {
    return <p className="px-4 py-8 text-sm text-ink-soft">Keine Kursdaten verfügbar.</p>;
  }

  const width = 960;
  const paddingRight = 104;
  const paddingBottom = 22;
  const plotWidth = width - paddingRight;
  const plotHeight = height - paddingBottom;

  const highs = visible.map((candle) => candle.high);
  const lows = visible.map((candle) => candle.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min || 1;
  // A little headroom keeps wicks off the frame edge.
  const padded = { min: min - range * 0.04, max: max + range * 0.04 };
  const paddedRange = padded.max - padded.min;

  const slot = plotWidth / visible.length;
  const bodyWidth = Math.max(1.5, slot * 0.6);

  const toY = (value: number) => plotHeight - ((value - padded.min) / paddedRange) * plotHeight;

  // Five evenly spaced price gridlines.
  const gridValues = Array.from({ length: 5 }, (_, i) => padded.min + (paddedRange / 4) * i);

  const first = visible[0];
  const last = visible.at(-1);

  return (
    <figure className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[640px]"
        role="img"
        aria-label={`Kursverlauf mit ${visible.length} Kerzen von ${formatPrice(min)} bis ${formatPrice(max)}`}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={0}
              x2={plotWidth}
              y1={toY(value)}
              y2={toY(value)}
              stroke="var(--c-rule)"
              strokeWidth={1}
            />
            <text
              x={plotWidth + 8}
              y={toY(value) + 4}
              className="tnum"
              fontSize={11}
              fill="var(--c-ink-faint)"
            >
              {formatPrice(value)}
            </text>
          </g>
        ))}

        {visible.map((candle, index) => {
          const x = index * slot + slot / 2;
          const rising = candle.close >= candle.open;
          const color = rising ? 'var(--c-up)' : 'var(--c-down)';
          const bodyTop = toY(Math.max(candle.open, candle.close));
          const bodyBottom = toY(Math.min(candle.open, candle.close));
          return (
            <g key={candle.openTime}>
              <line
                x1={x}
                x2={x}
                y1={toY(candle.high)}
                y2={toY(candle.low)}
                stroke={color}
                strokeWidth={1}
              />
              <rect
                x={x - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={Math.max(1, bodyBottom - bodyTop)}
                fill={color}
              />
            </g>
          );
        })}

        {first ? (
          <text x={0} y={height - 6} fontSize={11} fill="var(--c-ink-faint)">
            {formatDateTime(first.openTime)}
          </text>
        ) : null}
        {last ? (
          <text
            x={plotWidth}
            y={height - 6}
            fontSize={11}
            textAnchor="end"
            fill="var(--c-ink-faint)"
          >
            {formatDateTime(last.openTime)}
          </text>
        ) : null}
      </svg>
    </figure>
  );
}
