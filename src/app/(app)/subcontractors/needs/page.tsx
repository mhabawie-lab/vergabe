import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, PageHeader } from '@/components/ui/page';
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
import { hasPermission, requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { formatDate, formatNumber } from '@/lib/utils/format';
import { needQueryToParams, parseNeedQuery, type RawSearchParams } from '@/modules/partners/query';
import {
  NEED_STATUSES,
  NEED_STATUS_LABELS,
  PARTNER_SERVICE_CATEGORIES,
  PARTNER_SERVICE_CATEGORY_LABELS,
} from '@/types/partner';

export const metadata: Metadata = { title: 'Bedarf & Matches' };

export default async function NeedsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await requirePermission('subcontractors:read');
  const canEdit = hasPermission(session, 'subcontractors:write');

  const query = parseNeedQuery(await searchParams);
  const store = await getPartnerStore();
  const result = await store.listNeeds(session.organization.id, query);

  const buildHref = (page: number): string => {
    const params = needQueryToParams({ ...query, page });
    const search = params.toString();
    return search.length > 0 ? `/subcontractors/needs?${search}` : '/subcontractors/needs';
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bedarf & Matches"
        description="Für welche eigenen Projekte wir einen Partner benötigen — und welche Unternehmen dazu passen."
        actions={
          canEdit ? (
            <LinkButton href="/subcontractors/needs/new" variant="primary" size="sm">
              Bedarf anlegen
            </LinkButton>
          ) : undefined
        }
      />

      <div className="rounded-xl border border-border-subtle bg-surface-sunken px-4 py-3">
        <p className="text-xs leading-snug text-text-secondary">
          <span className="font-semibold text-text-primary">Niemals öffentlich.</span> Diese
          Bedarfe werden nirgends ausgeschrieben und sind für kein anderes Unternehmen
          sichtbar. Sie dienen ausschließlich der internen Suche.
        </p>
      </div>

      <Card>
        <form
          action="/subcontractors/needs"
          className="grid grid-cols-1 gap-3 border-b border-border-subtle p-4 sm:grid-cols-4"
        >
          <Input
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            placeholder="Bedarf suchen …"
            aria-label="Bedarf suchen"
          />
          <Select
            name="statuses"
            defaultValue={query.statuses?.[0] ?? ''}
            aria-label="Status"
            placeholder="Alle Status"
            options={NEED_STATUSES.map((status) => ({
              value: status,
              label: NEED_STATUS_LABELS[status],
            }))}
          />
          <Select
            name="services"
            defaultValue={query.services?.[0] ?? ''}
            aria-label="Leistung"
            placeholder="Alle Leistungen"
            options={PARTNER_SERVICE_CATEGORIES.map((category) => ({
              value: category,
              label: PARTNER_SERVICE_CATEGORY_LABELS[category],
            }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
            >
              Filtern
            </button>
            <LinkButton href="/subcontractors/needs" size="md">
              Zurücksetzen
            </LinkButton>
          </div>
        </form>

        {result.total === 0 ? (
          <EmptyState
            title="Noch kein Bedarf erfasst"
            description="Legen Sie fest, für welches Projekt Sie einen Partner suchen — die Match-Engine bewertet dann die erfassten Unternehmen."
            action={
              canEdit ? (
                <LinkButton href="/subcontractors/needs/new" variant="primary" size="sm">
                  Bedarf anlegen
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <TableContainer>
            <Table className="min-w-[60rem]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeaderCell className="min-w-[16rem]">Titel</TableHeaderCell>
                  <TableHeaderCell>Leistung</TableHeaderCell>
                  <TableHeaderCell>Ort</TableHeaderCell>
                  <TableHeaderCell>Zeitraum</TableHeaderCell>
                  <TableHeaderCell align="right">Mitarbeiter</TableHeaderCell>
                  <TableHeaderCell align="right">Matches</TableHeaderCell>
                  <TableHeaderCell align="right">Shortlist</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.items.length === 0 ? (
                  <TableEmpty colSpan={8}>Keine Bedarfe entsprechen den Filtern.</TableEmpty>
                ) : (
                  result.items.map((need) => (
                    <TableRow key={need.id}>
                      <TableCell>
                        <Link
                          href={`/subcontractors/needs/${need.id}`}
                          className="text-sm font-medium text-text-primary hover:text-accent hover:underline"
                        >
                          {need.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">
                        {PARTNER_SERVICE_CATEGORY_LABELS[need.serviceCategory]}
                      </TableCell>
                      <TableCell className="text-xs">
                        {need.city ?? '—'}
                        {need.region !== null && (
                          <span className="block text-[11px] text-text-muted">
                            {need.region}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular text-xs whitespace-nowrap">
                        {formatDate(need.startDate)} – {formatDate(need.endDate)}
                      </TableCell>
                      <TableCell align="right" className="tabular text-xs">
                        {need.requiredStaff === null ? '—' : formatNumber(need.requiredStaff)}
                      </TableCell>
                      <TableCell align="right" className="tabular text-xs">
                        {formatNumber(need.matchCount)}
                      </TableCell>
                      <TableCell align="right" className="tabular text-xs">
                        {formatNumber(need.shortlistedCount)}
                      </TableCell>
                      <TableCell>
                        <Badge tone={need.status === 'active' ? 'success' : 'neutral'}>
                          {NEED_STATUS_LABELS[need.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

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
