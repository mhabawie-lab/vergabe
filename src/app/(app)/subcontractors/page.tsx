import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import {
  BlockedBadge,
  CredentialBadge,
  DatacenterBadge,
  DirectionBadge,
  PartnerStatusBadge,
  ServiceBadges,
} from '@/components/partners/badges';
import { PartnerFilters } from '@/components/partners/partner-filters';
import { hasPermission, requirePermission } from '@/lib/auth/session';
import { getPartnerStore, isUsingDemoStore } from '@/lib/db';
import { formatDate, formatNumber } from '@/lib/utils/format';
import {
  countActivePartnerFilters,
  parsePartnerQuery,
  partnerQueryToParams,
  type RawSearchParams,
} from '@/modules/partners/query';
import { PARTNER_LEVEL_LABELS } from '@/types/partner';

export const metadata: Metadata = { title: 'Subunternehmer-Radar' };

export default async function SubcontractorsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await requirePermission('subcontractors:read');
  const canEdit = hasPermission(session, 'subcontractors:write');

  const query = parsePartnerQuery(await searchParams);
  const activeFilters = countActivePartnerFilters(query);

  const store = await getPartnerStore();
  const [result, facets, metrics] = await Promise.all([
    store.listCompanies(session.organization.id, query),
    store.listFacets(session.organization.id),
    store.getMetrics(session.organization.id),
  ]);

  const buildHref = (page: number): string => {
    const params = partnerQueryToParams({ ...query, page });
    const search = params.toString();
    return search.length > 0 ? `/subcontractors?${search}` : '/subcontractors';
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subunternehmer-Radar"
        description="Interner Bestand möglicher Sub- und Nachunternehmer sowie von Unternehmen, die selbst Subunternehmer suchen. Ausschließlich für Ihre Organisation sichtbar."
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <LinkButton href="/subcontractors/new" variant="primary" size="sm">
                Partner anlegen
              </LinkButton>
            )}
            {canEdit && (
              <LinkButton href="/subcontractors/import" size="sm">
                Partnerimport
              </LinkButton>
            )}
          </div>
        }
      />

      <div className="rounded-xl border border-border-subtle bg-surface-sunken px-4 py-3">
        <p className="text-xs leading-snug text-text-secondary">
          <span className="font-semibold text-text-primary">Rein intern.</span> Dieser
          Bereich ist keine Partnerbörse: Fremde Unternehmen haben hier kein Konto, kein
          Profil und keinen Einblick. Alle Angaben sind Notizen Ihrer Organisation.
        </p>
      </div>

      {isUsingDemoStore() && (
        <div className="rounded-xl border border-warning/25 bg-warning-subtle px-4 py-3">
          <p className="text-sm font-semibold text-warning">
            Flüchtiger Entwicklungsspeicher
          </p>
          <p className="mt-1 text-xs text-warning">
            Supabase ist nicht konfiguriert. Partnerdaten werden nur im Arbeitsspeicher
            gehalten und gehen beim Neustart verloren. Erfassen Sie hier keine echten
            Firmendaten, die erhalten bleiben sollen.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          { label: 'Qualifizierte Partner', value: metrics.qualifiedPartners },
          { label: 'Aktuell verfügbar', value: metrics.availableNow },
          { label: 'Suchen Subunternehmer', value: metrics.companiesSeekingSubcontractors },
          { label: 'Fällige Wiedervorlagen', value: metrics.dueFollowUps },
          { label: 'Ablaufende Nachweise', value: metrics.expiringCredentials },
          { label: 'Offene eigene Bedarfe', value: metrics.openNeeds },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl border border-border-subtle bg-surface-raised p-4 shadow-card"
          >
            <p className="text-xs font-medium text-text-secondary">{tile.label}</p>
            <p className="tabular mt-2 text-2xl font-semibold text-text-primary">
              {formatNumber(tile.value)}
            </p>
          </div>
        ))}
      </div>

      <Card>
        <PartnerFilters query={query} facets={facets} />

        <div className="border-b border-border-subtle px-4 py-3">
          <p className="text-xs text-text-secondary">
            <span className="tabular font-semibold text-text-primary">
              {formatNumber(result.total)}
            </span>{' '}
            {result.total === 1 ? 'Unternehmen' : 'Unternehmen'}
            {activeFilters > 0 && ` · ${activeFilters} Filter aktiv`}
          </p>
        </div>

        {result.total === 0 && activeFilters === 0 ? (
          <EmptyState
            title="Noch keine Partner erfasst"
            description="Legen Sie ein Unternehmen von Hand an oder importieren Sie eine Liste."
            action={
              canEdit ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <LinkButton href="/subcontractors/new" variant="primary" size="sm">
                    Partner anlegen
                  </LinkButton>
                  <LinkButton href="/subcontractors/import" size="sm">
                    Partnerimport
                  </LinkButton>
                </div>
              ) : undefined
            }
          />
        ) : (
          <TableContainer>
            <Table className="min-w-[76rem]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeaderCell className="min-w-[16rem]">Firmenname</TableHeaderCell>
                  <TableHeaderCell>Beziehungsrichtung</TableHeaderCell>
                  <TableHeaderCell>Ebene</TableHeaderCell>
                  <TableHeaderCell className="min-w-[14rem]">Leistungen</TableHeaderCell>
                  <TableHeaderCell>Regionen</TableHeaderCell>
                  <TableHeaderCell align="right">Verfügbare MA</TableHeaderCell>
                  <TableHeaderCell>Datacenter</TableHeaderCell>
                  <TableHeaderCell>Nachweise</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Letzter Kontakt</TableHeaderCell>
                  <TableHeaderCell>Wiedervorlage</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.items.length === 0 ? (
                  <TableEmpty colSpan={11}>
                    Keine Unternehmen entsprechen den gewählten Filtern.
                  </TableEmpty>
                ) : (
                  result.items.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/subcontractors/${company.id}`}
                            className="text-sm font-medium text-text-primary hover:text-accent hover:underline"
                          >
                            {company.legalName}
                          </Link>
                          {company.isBlocked && <BlockedBadge reason={null} />}
                          {company.hasOpenDemandSignal && (
                            <span
                              title="Offenes Signal: sucht Subunternehmer"
                              className="inline-flex items-center gap-1 rounded bg-brand-subtle px-1.5 py-0.5 text-[11px] font-medium text-brand ring-1 ring-inset ring-brand/25"
                            >
                              <AlertTriangle className="size-3" aria-hidden />
                              Sucht
                            </span>
                          )}
                        </div>
                        {company.city !== null && (
                          <span className="text-[11px] text-text-muted">
                            {company.city}
                            {company.region !== null && ` · ${company.region}`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DirectionBadge direction={company.relationshipDirection} />
                      </TableCell>
                      <TableCell className="text-xs">
                        {PARTNER_LEVEL_LABELS[company.partnerLevel]}
                      </TableCell>
                      <TableCell>
                        <ServiceBadges
                          confirmed={company.confirmedServices}
                          declared={company.declaredServices}
                        />
                      </TableCell>
                      <TableCell className="text-xs">
                        {company.regions.length === 0
                          ? '—'
                          : company.regions.slice(0, 3).join(', ')}
                      </TableCell>
                      <TableCell align="right" className="tabular text-xs">
                        {company.availableStaff === null
                          ? '—'
                          : formatNumber(company.availableStaff)}
                      </TableCell>
                      <TableCell>
                        <DatacenterBadge status={company.datacenterExperienceStatus} />
                      </TableCell>
                      <TableCell>
                        <CredentialBadge summary={company.credentialSummary} />
                      </TableCell>
                      <TableCell>
                        <PartnerStatusBadge status={company.status} />
                      </TableCell>
                      <TableCell className="tabular text-xs whitespace-nowrap">
                        {formatDate(company.lastContactAt)}
                      </TableCell>
                      <TableCell className="tabular text-xs whitespace-nowrap">
                        {formatDate(company.nextFollowUpAt)}
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
