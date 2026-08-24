import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { ServiceBadgeList } from '@/components/references/service-badges';
import { LinkButton } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { getReferenceStore, isUsingDemoStore } from '@/lib/db';
import { formatDate, formatNumber } from '@/lib/utils/format';
import {
  clientQueryToParams,
  countActiveClientFilters,
  parseClientQuery,
  type RawSearchParams,
} from '@/modules/references/query';
import { REFERENCE_SERVICE_CATEGORIES, REFERENCE_SERVICE_CATEGORY_LABELS } from '@/types/reference';

export const metadata: Metadata = { title: 'Kunden' };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await requirePermission('clients:read');

  const query = parseClientQuery(await searchParams);
  const activeFilters = countActiveClientFilters(query);

  const store = await getReferenceStore();
  const [result, facets] = await Promise.all([
    store.listClients(session.organization.id, query),
    store.listFacets(session.organization.id),
  ]);

  const buildHref = (page: number): string => {
    const params = clientQueryToParams({ ...query, page });
    const search = params.toString();
    return search.length > 0 ? `/customers?${search}` : '/customers';
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kunden"
        description="Eigene Geschäftskunden Ihrer Organisation. Getrennt von den öffentlichen Auftraggebern aus Vergabeverfahren."
        actions={
          <LinkButton href="/imports/references" variant="primary" size="sm">
            Daten importieren
          </LinkButton>
        }
      />

      {isUsingDemoStore() && (
        <div className="rounded-xl border border-warning/25 bg-warning-subtle px-4 py-3">
          <p className="text-sm font-semibold text-warning">
            Flüchtiger Entwicklungsspeicher
          </p>
          <p className="mt-1 text-xs text-warning">
            Supabase ist nicht konfiguriert. Kundendaten werden nur im
            Arbeitsspeicher gehalten und gehen beim Neustart verloren. Erfassen
            Sie hier keine echten Kundendaten, die erhalten bleiben sollen.
          </p>
        </div>
      )}

      <Card>
        <form className="flex flex-col gap-3 border-b border-border-subtle p-4 sm:flex-row" action="/customers">
          <Input
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            placeholder="Kunde suchen …"
            aria-label="Kunde suchen"
            className="sm:max-w-xs"
          />
          <Select
            name="status"
            defaultValue={query.status ?? ''}
            aria-label="Status"
            placeholder="Alle Status"
            options={[
              { value: 'active', label: 'Aktiv' },
              { value: 'inactive', label: 'Inaktiv' },
            ]}
            className="sm:max-w-[12rem]"
          />
          <Select
            name="city"
            defaultValue={query.city ?? ''}
            aria-label="Ort"
            placeholder="Alle Orte"
            options={facets.cities.map((city) => ({ value: city, label: city }))}
            className="sm:max-w-[12rem]"
          />
          <Select
            name="services"
            defaultValue={query.services?.[0] ?? ''}
            aria-label="Leistungsart"
            placeholder="Alle Leistungsarten"
            options={REFERENCE_SERVICE_CATEGORIES.filter(
              (category) => category !== 'unknown',
            ).map((category) => ({
              value: category,
              label: REFERENCE_SERVICE_CATEGORY_LABELS[category],
            }))}
            className="sm:max-w-[14rem]"
          />
          <LinkButton href="/customers" size="md" className="sm:ml-auto">
            Zurücksetzen
          </LinkButton>
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
          >
            Filtern
          </button>
        </form>

        <div className="border-b border-border-subtle px-4 py-3">
          <p className="text-xs text-text-secondary">
            <span className="tabular font-semibold text-text-primary">
              {formatNumber(result.total)}
            </span>{' '}
            {result.total === 1 ? 'Kunde' : 'Kunden'}
            {activeFilters > 0 && ` · ${activeFilters} Filter aktiv`}
          </p>
        </div>

        {result.total === 0 && activeFilters === 0 ? (
          <EmptyState
            title="Noch keine Kunden erfasst"
            description="Importieren Sie eine Kundenliste oder legen Sie Kunden über den Datenimport an."
            action={
              <LinkButton href="/imports/references" variant="primary" size="sm">
                Zum Datenimport
              </LinkButton>
            }
          />
        ) : (
          <TableContainer>
            <Table className="min-w-[58rem]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeaderCell className="min-w-[16rem]">Kunde</TableHeaderCell>
                  <TableHeaderCell align="right">Referenzprojekte</TableHeaderCell>
                  <TableHeaderCell align="right">Aktive Projekte</TableHeaderCell>
                  <TableHeaderCell align="right">Standorte</TableHeaderCell>
                  <TableHeaderCell>Bestätigte Leistungsarten</TableHeaderCell>
                  <TableHeaderCell>Letzter Projektzeitraum</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.items.length === 0 ? (
                  <TableEmpty colSpan={7}>
                    Keine Kunden entsprechen den gewählten Filtern.
                  </TableEmpty>
                ) : (
                  result.items.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/customers/${client.id}`}
                            className="text-sm font-medium text-text-primary hover:text-accent hover:underline"
                          >
                            {client.name}
                          </Link>
                          {client.duplicateCandidateNames.length > 0 && (
                            <span
                              title={`Ähnlich geschrieben: ${client.duplicateCandidateNames.join(', ')}`}
                              className="inline-flex items-center gap-1 rounded bg-warning-subtle px-1.5 py-0.5 text-[11px] font-medium text-warning ring-1 ring-inset ring-warning/25"
                            >
                              <AlertTriangle className="size-3" aria-hidden />
                              Mögliche Dublette
                            </span>
                          )}
                        </div>
                        {client.country !== null && (
                          <span className="text-[11px] text-text-muted">
                            {client.country}
                          </span>
                        )}
                      </TableCell>
                      <TableCell align="right" className="tabular">
                        {formatNumber(client.projectCount)}
                      </TableCell>
                      <TableCell align="right" className="tabular">
                        {formatNumber(client.activeProjectCount)}
                      </TableCell>
                      <TableCell align="right" className="tabular">
                        {formatNumber(client.locationCount)}
                      </TableCell>
                      <TableCell>
                        <ServiceBadgeList
                          categories={client.confirmedServiceCategories}
                          hasUnconfirmed={false}
                        />
                      </TableCell>
                      <TableCell className="tabular text-xs whitespace-nowrap">
                        {formatDate(client.lastProjectEnd)}
                      </TableCell>
                      <TableCell>
                        {client.isActive ? (
                          <Badge tone="success">Aktiv</Badge>
                        ) : (
                          <Badge tone="neutral">Inaktiv</Badge>
                        )}
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
