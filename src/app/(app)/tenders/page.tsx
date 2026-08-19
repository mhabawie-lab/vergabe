import type { Metadata } from 'next';
import { TenderFilters } from '@/components/tenders/tender-filters';
import { TenderTable } from '@/components/tenders/tender-table';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { DemoBadge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page';
import { getTenderRepository } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { formatNumber } from '@/lib/utils/format';
import {
  countActiveFilters,
  parseTenderSearchQuery,
  toSearchParams,
  type RawSearchParams,
} from '@/modules/tenders/query';

export const metadata: Metadata = { title: 'Ausschreibungen' };

export default async function TendersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermission('tenders:read');

  const params = await searchParams;
  const query = parseTenderSearchQuery(params);
  const activeFilters = countActiveFilters(query);

  const repository = await getTenderRepository();
  const [result, facets] = await Promise.all([
    repository.search(query),
    repository.listFilterFacets(),
  ]);

  const anyDemo = result.items.some((tender) => tender.isDemo);

  const buildHref = (page: number): string => {
    const next = toSearchParams({ ...query, page });
    const queryString = next.toString();
    return queryString.length > 0 ? `/tenders?${queryString}` : '/tenders';
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ausschreibungen"
        description="Volltextsuche und Filter über den gesamten normalisierten Datenbestand. Alle Quellen liegen im einheitlichen internen Format vor."
        badges={anyDemo ? <DemoBadge /> : undefined}
      />

      <TenderFilters query={query} facets={facets} activeCount={activeFilters} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <p className="text-xs text-text-secondary">
            <span className="tabular font-semibold text-text-primary">
              {formatNumber(result.total)}
            </span>{' '}
            {result.total === 1 ? 'Ausschreibung' : 'Ausschreibungen'}
            {activeFilters > 0 && ` · ${activeFilters} Filter aktiv`}
          </p>
          <p className="text-[11px] text-text-muted">
            Match-Werte sind vorläufig und regelbasiert. Die KI-Analyse folgt in
            Phase 3.
          </p>
        </div>

        <TenderTable
          tenders={result.items}
          emptyMessage={
            activeFilters > 0
              ? 'Keine Ausschreibungen entsprechen den gewählten Filtern.'
              : 'Es sind noch keine Ausschreibungen importiert.'
          }
        />

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
    </div>
  );
}
