import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TenderTable } from '@/components/tenders/tender-table';
import { DemoBadge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DataList, DataRow, PageHeader, PhasePlaceholder } from '@/components/ui/page';
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
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/format';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const repository = await getTenderRepository();
  const detail = await repository.findAuthorityById(id);

  return { title: detail?.authority.name ?? 'Auftraggeber' };
}

export default async function AuthorityDetailPage({ params }: PageProps) {
  await requirePermission('tenders:read');

  const { id } = await params;
  const repository = await getTenderRepository();
  const detail = await repository.findAuthorityById(id);

  if (detail === null) {
    notFound();
  }

  const { authority, tenders, awards } = detail;
  const totalValue = tenders.reduce(
    (sum, tender) => sum + (tender.estimatedValueNet ?? 0),
    0,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={authority.name}
        description={authority.authorityType ?? undefined}
        badges={authority.isDemo ? <DemoBadge /> : undefined}
        actions={
          <LinkButton href="/authorities" size="sm">
            Zurück zur Übersicht
          </LinkButton>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border-subtle bg-surface-raised p-4 shadow-card">
          <p className="text-xs font-medium text-text-secondary">Ausschreibungen</p>
          <p className="tabular mt-2 text-2xl font-semibold text-text-primary">
            {formatNumber(tenders.length)}
          </p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-raised p-4 shadow-card">
          <p className="text-xs font-medium text-text-secondary">Zuschläge</p>
          <p className="tabular mt-2 text-2xl font-semibold text-text-primary">
            {formatNumber(awards.length)}
          </p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-raised p-4 shadow-card">
          <p className="text-xs font-medium text-text-secondary">
            Ausschreibungsvolumen
          </p>
          <p className="tabular mt-2 text-2xl font-semibold text-text-primary">
            {formatCurrency(totalValue)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Ausschreibungen"
              description="Alle erfassten Vergaben dieser Stelle"
            />
            <TenderTable
              tenders={tenders}
              emptyMessage="Für diesen Auftraggeber sind keine Ausschreibungen erfasst."
            />
          </Card>

          <Card>
            <CardHeader
              title="Vergabehistorie"
              description="Erteilte Zuschläge und Auftragnehmer"
            />
            <TableContainer>
              <Table className="min-w-[34rem]">
                <TableHead>
                  <TableRow className="hover:bg-transparent">
                    <TableHeaderCell>Auftragnehmer</TableHeaderCell>
                    <TableHeaderCell>Ausschreibung</TableHeaderCell>
                    <TableHeaderCell>Zuschlag am</TableHeaderCell>
                    <TableHeaderCell align="right">Wert</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {awards.length === 0 ? (
                    <TableEmpty colSpan={4}>
                      Für diesen Auftraggeber ist noch kein Zuschlag erfasst.
                    </TableEmpty>
                  ) : (
                    awards.map((award) => (
                      <TableRow key={award.id}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm text-text-primary">
                              {award.winnerName}
                            </span>
                            {award.isDemo && <DemoBadge />}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[18rem] text-xs">
                          <span className="line-clamp-2">{award.tenderTitle || '—'}</span>
                        </TableCell>
                        <TableCell className="tabular text-xs whitespace-nowrap">
                          {formatDate(award.awardDate)}
                        </TableCell>
                        <TableCell align="right" className="tabular whitespace-nowrap">
                          {formatCurrency(award.awardValueNet, award.currency)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Stammdaten" />
            <CardBody>
              <DataList>
                <DataRow label="Typ">{authority.authorityType ?? '—'}</DataRow>
                <DataRow label="Anschrift">
                  {authority.street ?? '—'}
                  <span className="block text-xs text-text-muted">
                    {authority.postalCode ?? ''} {authority.city ?? ''}
                  </span>
                </DataRow>
                <DataRow label="Region">{getRegionLabel(authority.regionCode)}</DataRow>
                <DataRow label="Land">{getCountryLabel(authority.countryCode)}</DataRow>
                <DataRow label="E-Mail">{authority.email ?? '—'}</DataRow>
                <DataRow label="Telefon">{authority.phone ?? '—'}</DataRow>
                <DataRow label="Original-ID">
                  <span className="tabular text-xs">{authority.externalId ?? '—'}</span>
                </DataRow>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Auftraggeber-Radar" />
            <CardBody>
              <PhasePlaceholder phase={5} title="Beobachtung vorbereitet">
                Ab Phase 5 kann diese Stelle beobachtet werden: wiederkehrende
                Vergabezyklen, typische Auftragswerte und die Gewinner früherer
                Ausschreibungen werden ausgewertet.
              </PhasePlaceholder>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
