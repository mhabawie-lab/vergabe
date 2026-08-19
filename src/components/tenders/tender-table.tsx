import Link from 'next/link';
import { getSectorLabel } from '@/config/sectors';
import { getRegionLabel } from '@/config/regions';
import { cn } from '@/lib/utils/cn';
import {
  daysUntil,
  formatCurrency,
  formatDate,
  formatDeadlineDistance,
} from '@/lib/utils/format';
import { scoreTender } from '@/modules/matching/preview';
import type { TenderListItem } from '@/types/tender';
import { DemoBadge, RecommendationBadge, TenderStatusBadge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmpty,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table';

/** Colours the remaining days: red once inside a week, amber inside a month. */
function deadlineToneClass(deadline: string | null): string {
  const days = daysUntil(deadline);
  if (days === null) return 'text-text-muted';
  if (days < 0) return 'text-text-muted';
  if (days <= 7) return 'text-danger font-medium';
  if (days <= 30) return 'text-warning';
  return 'text-text-secondary';
}

interface TenderTableProps {
  tenders: readonly TenderListItem[];
  /** Hides the match column where it adds no information. */
  showMatch?: boolean;
  emptyMessage?: string;
}

export function TenderTable({
  tenders,
  showMatch = true,
  emptyMessage = 'Keine Ausschreibungen gefunden.',
}: TenderTableProps) {
  const columnCount = showMatch ? 7 : 6;

  return (
    <TableContainer>
      {/* Without the match column the table fits a narrower shell, so the
          dashboard's two-column layout does not force a scrollbar. */}
      <Table className={showMatch ? undefined : 'min-w-[44rem]'}>
        <TableHead>
          <TableRow className="hover:bg-transparent">
            <TableHeaderCell className="min-w-[22rem]">Ausschreibung</TableHeaderCell>
            <TableHeaderCell>Auftraggeber</TableHeaderCell>
            <TableHeaderCell>Ort</TableHeaderCell>
            <TableHeaderCell align="right">Auftragswert</TableHeaderCell>
            <TableHeaderCell>Angebotsfrist</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            {showMatch && <TableHeaderCell align="right">Match</TableHeaderCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {tenders.length === 0 ? (
            <TableEmpty colSpan={columnCount}>{emptyMessage}</TableEmpty>
          ) : (
            tenders.map((tender) => {
              const preview = scoreTender(tender);

              return (
                <TableRow key={tender.id}>
                  <TableCell className="max-w-[30rem]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/tenders/${tender.id}`}
                        className="text-sm font-medium text-text-primary hover:text-accent hover:underline"
                      >
                        {tender.title}
                      </Link>
                      {tender.isDemo && <DemoBadge />}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted">
                      <span className="tabular">{tender.externalId}</span>
                      <span aria-hidden>·</span>
                      <span>{tender.sourceName}</span>
                      {tender.sectors.slice(0, 2).map((sector) => (
                        <span
                          key={sector}
                          className="rounded bg-surface-sunken px-1.5 py-0.5 text-text-secondary"
                        >
                          {getSectorLabel(sector)}
                        </span>
                      ))}
                      {tender.sectors.length > 2 && (
                        <span>+{tender.sectors.length - 2}</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="max-w-[16rem]">
                    <span className="line-clamp-2 text-xs">
                      {tender.authorityName ?? '—'}
                    </span>
                  </TableCell>

                  <TableCell className="whitespace-nowrap">
                    <span className="text-xs">
                      {tender.city ?? '—'}
                      {tender.regionCode !== null && (
                        <span className="block text-[11px] text-text-muted">
                          {getRegionLabel(tender.regionCode)}
                        </span>
                      )}
                    </span>
                  </TableCell>

                  <TableCell align="right" className="tabular whitespace-nowrap">
                    {formatCurrency(tender.estimatedValueNet, tender.currency)}
                  </TableCell>

                  <TableCell className="whitespace-nowrap">
                    <span className="tabular block text-xs text-text-primary">
                      {formatDate(tender.submissionDeadline)}
                    </span>
                    <span
                      className={cn(
                        'block text-[11px]',
                        deadlineToneClass(tender.submissionDeadline),
                      )}
                    >
                      {formatDeadlineDistance(tender.submissionDeadline)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <TenderStatusBadge status={tender.status} />
                  </TableCell>

                  {showMatch && (
                    <TableCell align="right" className="whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <span className="tabular text-xs font-semibold text-text-primary">
                          {preview.score}&nbsp;%
                        </span>
                        <RecommendationBadge recommendation={preview.recommendation} />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
