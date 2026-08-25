import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Table primitives.
 *
 * Wide tables scroll inside their own container so the page body never
 * scrolls horizontally on tablet and phone.
 */

export function TableContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('scrollbar-slim w-full overflow-x-auto', className)}>
      {children}
    </div>
  );
}

export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <table className={cn('w-full min-w-[52rem] border-collapse text-left', className)}>
      {children}
    </table>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-border-subtle bg-surface-sunken/60">
      {children}
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border-subtle">{children}</tbody>;
}

export function TableRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn('transition-colors hover:bg-surface-sunken/50', className)}>
      {children}
    </tr>
  );
}

export function TableHeaderCell({
  children,
  className,
  align = 'left',
}: {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-2.5 text-[11px] font-semibold tracking-wide text-text-muted uppercase',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className,
  align = 'left',
  title,
}: {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  /** Native tooltip, e.g. to explain an unlabelled raw value. */
  title?: string;
}) {
  return (
    <td
      title={title}
      className={cn(
        'px-4 py-3 align-middle text-text-secondary',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-text-muted">
        {children}
      </td>
    </tr>
  );
}
