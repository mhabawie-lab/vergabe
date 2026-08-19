import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
import { DemoBadge } from '@/components/ui/badge';
import { Input } from '@/components/ui/form';
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
import { getCountryLabel, getRegionLabel } from '@/config/regions';
import { requirePermission } from '@/lib/auth/session';
import { getTenderRepository } from '@/lib/db';
import { formatNumber } from '@/lib/utils/format';
import type { RawSearchParams } from '@/modules/tenders/query';

export const metadata: Metadata = { title: 'Auftraggeber' };

const PAGE_SIZE = 25;

const paramsSchema = z.object({
  q: z.string().trim().min(1).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

export default async function AuthoritiesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermission('tenders:read');

  const { q, page } = paramsSchema.parse(await searchParams);
  const repository = await getTenderRepository();
  const result = await repository.listAuthorities(q ?? null, page, PAGE_SIZE);

  const buildHref = (target: number): string => {
    const params = new URLSearchParams();
    if (q !== undefined) params.set('q', q);
    if (target > 1) params.set('page', String(target));
    const queryString = params.toString();
    return queryString.length > 0 ? `/authorities?${queryString}` : '/authorities';
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Auftraggeber"
        description="Alle vergebenden Stellen aus dem normalisierten Datenbestand, mit Ausschreibungs- und Zuschlagsvolumen."
      />

      <Card>
        <form className="border-b border-border-subtle p-4" action="/authorities">
          <Input
            name="q"
            type="search"
            defaultValue={q ?? ''}
            placeholder="Auftraggeber suchen …"
            aria-label="Auftraggeber suchen"
            className="max-w-md"
          />
        </form>

        <TableContainer>
          <Table className="min-w-[46rem]">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TableHeaderCell>Auftraggeber</TableHeaderCell>
                <TableHeaderCell>Typ</TableHeaderCell>
                <TableHeaderCell>Sitz</TableHeaderCell>
                <TableHeaderCell align="right">Ausschreibungen</TableHeaderCell>
                <TableHeaderCell align="right">Davon offen</TableHeaderCell>
                <TableHeaderCell align="right">Zuschläge</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.length === 0 ? (
                <TableEmpty colSpan={6}>Keine Auftraggeber gefunden.</TableEmpty>
              ) : (
                result.items.map((authority) => (
                  <TableRow key={authority.id}>
                    <TableCell className="max-w-[26rem]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/authorities/${authority.id}`}
                          className="text-sm font-medium text-text-primary hover:text-accent hover:underline"
                        >
                          {authority.name}
                        </Link>
                        {authority.isDemo && <DemoBadge />}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {authority.authorityType ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {authority.city ?? '—'}
                      <span className="block text-[11px] text-text-muted">
                        {getRegionLabel(authority.regionCode)} ·{' '}
                        {getCountryLabel(authority.countryCode)}
                      </span>
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {formatNumber(authority.tenderCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {formatNumber(authority.openTenderCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {formatNumber(authority.awardCount)}
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

      <PhasePlaceholder phase={5} title="Auftraggeber-Radar">
        Ab Phase 5 lassen sich Auftraggeber beobachten, ihr Ausschreibungsrhythmus
        auswerten und wiederkehrende Vergaben frühzeitig erkennen.
      </PhasePlaceholder>
    </div>
  );
}
