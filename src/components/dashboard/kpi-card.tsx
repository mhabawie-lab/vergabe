import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type KpiTone = 'neutral' | 'brand' | 'success' | 'warning' | 'info';

const ICON_TONE_CLASSES: Record<KpiTone, string> = {
  neutral: 'bg-surface-sunken text-text-secondary',
  brand: 'bg-brand-subtle text-brand',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  info: 'bg-info-subtle text-info',
};

interface KpiCardProps {
  label: string;
  value: string;
  hint: string;
  Icon: LucideIcon;
  tone?: KpiTone;
  /** Makes the whole tile a link to the matching screen. */
  href?: string;
}

export function KpiCard({
  label,
  value,
  hint,
  Icon,
  tone = 'neutral',
  href,
}: KpiCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-text-secondary">{label}</p>
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg',
            ICON_TONE_CLASSES[tone],
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="tabular mt-3 text-2xl font-semibold tracking-tight text-text-primary">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-text-muted">{hint}</p>
    </>
  );

  const className =
    'block rounded-xl border border-border-subtle bg-surface-raised p-4 shadow-card transition-colors';

  if (href !== undefined) {
    return (
      <Link href={href} className={cn(className, 'hover:border-border-strong')}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
