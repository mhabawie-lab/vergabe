import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'up' | 'down' | 'caution' | 'accent';

const TONES: Readonly<Record<BadgeTone, string>> = {
  neutral: 'border-rule text-ink-soft',
  up: 'border-up/40 text-up',
  down: 'border-down/40 text-down',
  caution: 'border-caution/50 text-caution',
  accent: 'border-accent/40 text-accent',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.12em]',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Marks synthetic data. Required wherever demo records are shown — invented
 * prices or posts must never be mistakable for the live market.
 */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="caution" className={cn('font-semibold', className)}>
      Demo
    </Badge>
  );
}
