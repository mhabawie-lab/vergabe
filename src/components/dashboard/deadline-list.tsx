import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { daysUntil, formatCurrency, formatDate } from '@/lib/utils/format';
import type { TenderListItem } from '@/types/tender';
import { DemoBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/page';

/** Urgency ramp: red inside a week, amber inside a month, otherwise neutral. */
function urgencyClasses(days: number | null): { dot: string; text: string } {
  if (days === null) return { dot: 'bg-border-strong', text: 'text-text-muted' };
  if (days <= 7) return { dot: 'bg-danger', text: 'text-danger' };
  if (days <= 30) return { dot: 'bg-warning', text: 'text-warning' };
  return { dot: 'bg-success', text: 'text-text-secondary' };
}

function formatRemaining(days: number | null): string {
  if (days === null) return 'Keine Frist hinterlegt';
  if (days === 0) return 'Heute fällig';
  if (days === 1) return 'Noch 1 Tag';
  return `Noch ${days} Tage`;
}

export function DeadlineList({ tenders }: { tenders: readonly TenderListItem[] }) {
  if (tenders.length === 0) {
    return (
      <EmptyState
        title="Keine offenen Fristen"
        description="Sobald Ausschreibungen mit laufender Angebotsfrist importiert sind, erscheinen sie hier."
      />
    );
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {tenders.map((tender) => {
        const days = daysUntil(tender.submissionDeadline);
        const tone = urgencyClasses(days);

        return (
          <li key={tender.id} className="px-5 py-3 transition-colors hover:bg-surface-sunken/50">
            <Link href={`/tenders/${tender.id}`} className="block">
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', tone.dot)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="line-clamp-2 text-sm font-medium text-text-primary">
                      {tender.title}
                    </p>
                    {tender.isDemo && <DemoBadge />}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-text-muted">
                    {tender.authorityName ?? 'Auftraggeber unbekannt'}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className={cn('text-xs font-medium', tone.text)}>
                      {formatRemaining(days)}
                    </span>
                    <span className="tabular text-[11px] text-text-muted">
                      {formatDate(tender.submissionDeadline)} ·{' '}
                      {formatCurrency(tender.estimatedValueNet, tender.currency)}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
