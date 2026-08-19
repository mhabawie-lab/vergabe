import Link from 'next/link';
import { getSectorLabel } from '@/config/sectors';
import { getRegionLabel } from '@/config/regions';
import { cn } from '@/lib/utils/cn';
import {
  daysUntil,
  formatCurrency,
  formatDate,
  formatDeadlineDistance,
  formatDuration,
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

function scoreToneClass(score: number): string {
  if (score >= 70) return 'text-success';
  if (score >= 40) return 'text-warning';
  return 'text-danger';
}

interface TenderTableProps {
  tenders: readonly TenderListItem[];
  /**
   * Hides the match column. Only for contexts where the score carries no
   * information — the ranking is the point of most tender lists.
   */
  showMatch?: boolean;
  emptyMessage?: string;
}

/**
 * The shared tender table.
 *
 * Column order follows the agreed layout: Match, Titel, Auftraggeber, Ort,
 * Auftragswert, Laufzeit, Frist, Status. Used by the dashboard, the search
 * results, the deadline screen and the authority detail page, so the same
 * record reads identically everywhere.
 */
export function TenderTable({
  tenders,
  showMatch = true,
  emptyMessage = 'Keine Ausschreibungen gefunden.',
}: TenderTableProps) {
  const columnCount = showMatch ? 8 : 7;

  return (
    <TableContainer>
      <Table className={showMatch ? 'min-w-[64rem]' : 'min-w-[54rem]'}>
        <TableHead>
          <TableRow className="hover:bg-transparent">
            {showMatch && (
              <TableHeaderCell className="w-[7.5rem]">Match</TableHeaderCell>
            )}
            <TableHeaderCell className="min-w-[20rem]">Titel</TableHeaderCell>
            <TableHeaderCell>Auftraggeber</TableHeaderCell>
            <TableHeaderCell>Ort</TableHeaderCell>
            <TableHeaderCell align="right">Auftragswert</TableHeaderCell>
            <TableHeaderCell>Laufzeit</TableHeaderCell>
            <TableHeaderCell>Frist</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
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
                  {showMatch && (
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'tabular text-sm font-semibold',
                            scoreToneClass(preview.score),
                          )}
                        >
                          {preview.score}&nbsp;%
                        </span>
                        <RecommendationBadge recommendation={preview.recommendation} />
                      </div>
                    </TableCell>
                  )}

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

                  <TableCell className="tabular text-xs whitespace-nowrap">
                    {formatDuration(tender.durationMonths)}
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
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
