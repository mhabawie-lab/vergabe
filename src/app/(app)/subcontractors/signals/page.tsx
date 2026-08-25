import type { Metadata } from 'next';
import Link from 'next/link';
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
import { ConfidenceBadge, SignalStatusBadge, SignalTypeBadge } from '@/components/partners/badges';
import { SignalActions } from '@/components/partners/signal-actions';
import { SignalForm } from '@/components/partners/signal-form';
import { Input, Select } from '@/components/ui/form';
import { hasPermission, requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { formatDate } from '@/lib/utils/format';
import { SIGNAL_DISCLAIMER } from '@/modules/partners/signals';
import {
  parseSignalQuery,
  signalQueryToParams,
  type RawSearchParams,
} from '@/modules/partners/query';
import {
  PARTNER_SERVICE_CATEGORY_LABELS,
  SIGNAL_STATUSES,
  SIGNAL_STATUS_LABELS,
  SIGNAL_TYPES,
  SIGNAL_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
} from '@/types/partner';

export const metadata: Metadata = { title: 'Firmen suchen Subunternehmer' };

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await requirePermission('subcontractors:read');
  const canEdit = hasPermission(session, 'subcontractors:write');

  const query = parseSignalQuery(await searchParams);
  const store = await getPartnerStore();

  const [result, companies] = await Promise.all([
    store.listSignals(session.organization.id, query),
    store.listDuplicateCandidates(session.organization.id),
  ]);

  const buildHref = (page: number): string => {
    const params = signalQueryToParams({ ...query, page });
    const search = params.toString();
    return search.length > 0
      ? `/subcontractors/signals?${search}`
      : '/subcontractors/signals';
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Firmen suchen Subunternehmer"
        description="Interne Beobachtungen darüber, welche Unternehmen gerade Leistungen vergeben — als Hinweis, nicht als Tatsache."
      />

      <div className="rounded-xl border border-border-subtle bg-surface-sunken px-4 py-3">
        <p className="text-xs leading-snug text-text-secondary">{SIGNAL_DISCLAIMER}</p>
      </div>

      {canEdit && (
        <SignalForm
          companies={companies.map((company) => ({
            id: company.id,
            legalName: company.legalName,
          }))}
        />
      )}

      <Card>
        <form
          action="/subcontractors/signals"
          className="grid grid-cols-1 gap-3 border-b border-border-subtle p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Input
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            placeholder="Firma, Projekt, Beschreibung …"
            aria-label="Signale durchsuchen"
          />
          <Select
            name="types"
            defaultValue={query.types?.[0] ?? ''}
            aria-label="Signaltyp"
            placeholder="Alle Signaltypen"
            options={SIGNAL_TYPES.map((type) => ({
              value: type,
              label: SIGNAL_TYPE_LABELS[type],
            }))}
          />
          <Select
            name="statuses"
            defaultValue={query.statuses?.[0] ?? ''}
            aria-label="Status"
            placeholder="Alle Status"
            options={SIGNAL_STATUSES.map((status) => ({
              value: status,
              label: SIGNAL_STATUS_LABELS[status],
            }))}
          />
          <Select
            name="demandOnly"
            defaultValue={query.demandOnly === true ? 'true' : ''}
            aria-label="Nur Bedarfssignale"
            placeholder="Alle Beobachtungen"
            options={[{ value: 'true', label: 'Nur „sucht Subunternehmer"' }]}
          />
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
            >
              Filtern
            </button>
            <LinkButton href="/subcontractors/signals" size="md">
              Zurücksetzen
            </LinkButton>
          </div>
        </form>

        {result.total === 0 ? (
          <EmptyState
            title="Keine Signale erfasst"
            description="Halten Sie hier fest, wenn ein Unternehmen Subunternehmer sucht — mit Quelle und Konfidenz."
          />
        ) : (
          <TableContainer>
            <Table className="min-w-[72rem]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeaderCell className="min-w-[14rem]">Firma</TableHeaderCell>
                  <TableHeaderCell>Signal</TableHeaderCell>
                  <TableHeaderCell>Leistung</TableHeaderCell>
                  <TableHeaderCell>Projekt</TableHeaderCell>
                  <TableHeaderCell>Ort</TableHeaderCell>
                  <TableHeaderCell>Quelle</TableHeaderCell>
                  <TableHeaderCell>Beobachtet am</TableHeaderCell>
                  <TableHeaderCell>Konfidenz</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Nächste Aktion</TableHeaderCell>
                  <TableHeaderCell>Wiedervorlage</TableHeaderCell>
                  {canEdit && <TableHeaderCell>Entscheidung</TableHeaderCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {result.items.length === 0 ? (
                  <TableEmpty colSpan={canEdit ? 12 : 11}>
                    Keine Signale entsprechen den gewählten Filtern.
                  </TableEmpty>
                ) : (
                  result.items.map((signal) => (
                    <TableRow key={signal.id}>
                      <TableCell>
                        {signal.partnerCompanyId === null ? (
                          <span className="text-sm text-text-primary">
                            {signal.companyName ?? '—'}
                          </span>
                        ) : (
                          <Link
                            href={`/subcontractors/${signal.partnerCompanyId}`}
                            className="text-sm font-medium text-text-primary hover:text-accent hover:underline"
                          >
                            {signal.companyName ?? '—'}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>
                        <SignalTypeBadge type={signal.signalType} />
                      </TableCell>
                      <TableCell className="text-xs">
                        {signal.serviceCategory === null
                          ? '—'
                          : PARTNER_SERVICE_CATEGORY_LABELS[signal.serviceCategory]}
                      </TableCell>
                      <TableCell className="text-xs">{signal.projectName ?? '—'}</TableCell>
                      <TableCell className="text-xs">{signal.city ?? '—'}</TableCell>
                      <TableCell className="text-xs">
                        {SOURCE_TYPE_LABELS[signal.sourceType]}
                        {signal.sourceUrl !== null && (
                          <a
                            href={signal.sourceUrl}
                            rel="noreferrer noopener"
                            target="_blank"
                            className="mt-0.5 block text-[11px] text-text-muted hover:text-accent hover:underline"
                          >
                            Fundstelle
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="tabular text-xs whitespace-nowrap">
                        {formatDate(signal.observedAt)}
                      </TableCell>
                      <TableCell>
                        <ConfidenceBadge confidence={signal.confidence} />
                      </TableCell>
                      <TableCell>
                        <SignalStatusBadge status={signal.status} />
                      </TableCell>
                      <TableCell className="max-w-[14rem] text-xs">
                        {signal.nextAction ?? '—'}
                      </TableCell>
                      <TableCell className="tabular text-xs whitespace-nowrap">
                        {formatDate(signal.followUpAt)}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <SignalActions signalId={signal.id} status={signal.status} />
                        </TableCell>
                      )}
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
