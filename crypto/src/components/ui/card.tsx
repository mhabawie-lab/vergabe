import { cn } from '@/lib/cn';

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border border-rule bg-surface', className)}>{children}</section>
  );
}

export function PanelHeader({
  title,
  meta,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-3',
        className,
      )}
    >
      <h2 className="font-display text-sm font-medium tracking-tight">{title}</h2>
      {meta ? <div className="eyebrow">{meta}</div> : null}
    </header>
  );
}
