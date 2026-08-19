import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { DemoBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { PageHeader, PhasePlaceholder } from '@/components/ui/page';
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
import { requirePermission } from '@/lib/auth/session';
import { getTenderRepository } from '@/lib/db';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/format';
import type { RawSearchParams } from '@/modules/tenders/query';

export const metadata: Metadata = { title: 'Zuschläge' };

const PAGE_SIZE = 25;

const paramsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});

export default async function AwardsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermission('tenders:read');

  const { page } = paramsSchema.parse(await searchParams);
  const repository = await getTenderRepository();
  const result = await repository.listAwards(page, PAGE_SIZE);

  const buildHref = (target: number): string =>
    target > 1 ? `/awards?page=${target}` : '/awards';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Zuschläge"
        description="Erteilte Zuschläge mit Auftragnehmer, Zuschlagswert und Bieteranzahl — die Grundlage für die spätere Wettbewerbsanalyse."
      />

      <Card>
        <div className="border-b border-border-subtle px-4 py-3">
          <p className="text-xs text-text-secondary">
            <span className="tabular font-semibold text-text-primary">
              {formatNumber(result.total)}
            </span>{' '}
            {result.total === 1 ? 'Zuschlag' : 'Zuschläge'} erfasst
          </p>
        </div>

        <TableContainer>
          <Table className="min-w-[48rem]">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TableHeaderCell>Auftragnehmer</TableHeaderCell>
                <TableHeaderCell>Ausschreibung</TableHeaderCell>
                <TableHeaderCell>Zuschlag am</TableHeaderCell>
                <TableHeaderCell align="right">Zuschlagswert</TableHeaderCell>
                <TableHeaderCell align="right">Bieter</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.length === 0 ? (
                <TableEmpty colSpan={5}>
                  Es sind noch keine Zuschläge erfasst.
                </TableEmpty>
              ) : (
                result.items.map((award) => (
                  <TableRow key={award.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-text-primary">
                          {award.winnerName}
                        </span>
                        {award.isDemo && <DemoBadge />}
                      </div>
                      {award.winnerCity !== null && (
                        <span className="text-[11px] text-text-muted">
                          {award.winnerCity}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[22rem]">
                      {award.tenderId.length > 0 ? (
                        <Link
                          href={`/tenders/${award.tenderId}`}
                          className="line-clamp-2 text-xs hover:text-accent hover:underline"
                        >
                          {award.tenderTitle || 'Ausschreibung öffnen'}
                        </Link>
                      ) : (
                        <span className="text-xs">{award.tenderTitle || '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-xs whitespace-nowrap">
                      {formatDate(award.awardDate)}
                    </TableCell>
                    <TableCell align="right" className="tabular whitespace-nowrap">
                      {formatCurrency(award.awardValueNet, award.currency)}
                    </TableCell>
                    <TableCell align="right" className="tabular text-xs">
                      {award.bidderCount ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {result.total > 0 && (
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            pageSize={result.pageSize}
            buildHref={buildHref}
          />
        )}
      </Card>

      <PhasePlaceholder phase={5} title="Wettbewerbsanalyse">
        Ab Phase 5 werden Gewinner über Ausschreibungen hinweg verdichtet:
        Marktanteile je Region und Branche, typische Zuschlagswerte und
        wiederkehrende Wettbewerber.
      </PhasePlaceholder>
    </div>
  );
}
