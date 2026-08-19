import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Badges rendered next to the title, e.g. DEMO or a phase marker. */
  badges?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  badges,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border-subtle pb-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            {title}
          </h1>
          {badges}
        </div>
        {description !== undefined && (
          <p className="mt-1.5 max-w-3xl text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {actions !== undefined && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

export function PageSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn('space-y-4', className)}>{children}</section>;
}

/** Empty state for lists and tables. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {description !== undefined && (
        <p className="max-w-md text-sm text-text-muted">{description}</p>
      )}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Marks a screen as prepared but not yet functional.
 *
 * Says plainly what is missing and when it arrives, rather than showing a
 * plausible-looking mock (CLAUDE.md § Daten-Integrität).
 */
export function PhasePlaceholder({
  phase,
  title,
  children,
}: {
  phase: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface-sunken/40 px-5 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <span className="rounded-md bg-info-subtle px-1.5 py-0.5 text-[11px] font-medium text-info ring-1 ring-inset ring-info/20">
          Ab Phase {phase}
        </span>
      </div>
      <div className="mt-2 max-w-2xl text-sm text-text-secondary">{children}</div>
    </div>
  );
}

/** Key/value row used across the detail screens. */
export function DataRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[minmax(9rem,14rem)_1fr] sm:gap-4',
        className,
      )}
    >
      <dt className="text-xs font-medium text-text-muted sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 text-sm text-text-primary">{children}</dd>
    </div>
  );
}

export function DataList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl className={cn('divide-y divide-border-subtle', className)}>{children}</dl>
  );
}
