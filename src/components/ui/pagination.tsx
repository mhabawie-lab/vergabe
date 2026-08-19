import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/format';

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  /** Builds the href for a page; the caller keeps the current filters. */
  buildHref: (page: number) => string;
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  buildHref,
}: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const linkClasses =
    'inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium ring-1 ring-inset ring-border-strong transition-colors';

  return (
    <nav
      aria-label="Seitennavigation"
      className="flex flex-col gap-3 border-t border-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="tabular text-xs text-text-muted">
        {formatNumber(from)}–{formatNumber(to)} von {formatNumber(total)} Ergebnissen
      </p>

      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={buildHref(page - 1)}
            className={cn(linkClasses, 'text-text-secondary hover:bg-surface-sunken')}
            rel="prev"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            Zurück
          </Link>
        ) : (
          <span className={cn(linkClasses, 'cursor-not-allowed text-text-muted opacity-50')}>
            <ChevronLeft className="size-3.5" aria-hidden />
            Zurück
          </span>
        )}

        <span className="tabular text-xs text-text-secondary">
          Seite {formatNumber(page)} von {formatNumber(pageCount)}
        </span>

        {page < pageCount ? (
          <Link
            href={buildHref(page + 1)}
            className={cn(linkClasses, 'text-text-secondary hover:bg-surface-sunken')}
            rel="next"
          >
            Weiter
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <span className={cn(linkClasses, 'cursor-not-allowed text-text-muted opacity-50')}>
            Weiter
            <ChevronRight className="size-3.5" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
