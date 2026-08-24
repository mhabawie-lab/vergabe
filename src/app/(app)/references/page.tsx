import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { BulkConfirmTable } from '@/components/references/bulk-confirm-table';
import { hasPermission, requirePermission } from '@/lib/auth/session';
import { getReferenceStore } from '@/lib/db';
import { formatNumber } from '@/lib/utils/format';
import {
  CONFIRMATION_FILTER_LABELS,
  countActiveReferenceFilters,
  parseReferenceQuery,
  referenceQueryToParams,
  type RawSearchParams,
} from '@/modules/references/query';
import { CLASSIFICATION_PROPOSAL_NOTE } from '@/modules/references/classification';
import {
  SUGGESTION_NOTE,
  buildSearchProfileSuggestions,
} from '@/modules/references/search-profile-suggestions';
import { Badge } from '@/components/ui/badge';
import { CardBody, CardHeader } from '@/components/ui/card';
import {
  REFERENCE_PROJECT_STATUS_LABELS,
  REFERENCE_PROJECT_STATUSES,
  REFERENCE_SERVICE_CATEGORIES,
  REFERENCE_SERVICE_CATEGORY_LABELS,
} from '@/types/reference';

export const metadata: Metadata = { title: 'Referenzen' };

export default async function ReferencesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await requirePermission('references:read');
  const canEdit = hasPermission(session, 'references:write');

  const query = parseReferenceQuery(await searchParams);
  const activeFilters = countActiveReferenceFilters(query);

  const store = await getReferenceStore();
  const [result, facets] = await Promise.all([
    store.listProjects(session.organization.id, query),
    store.listFacets(session.organization.id),
  ]);

  // Surfacing this up front matters: a list that looks full of references can
  // still contain nothing that counts as evidence.
  const onlyProposalCount = result.items.filter((item) => item.hasOnlyProposals).length;

  // Suggestions are built exclusively from confirmed services — an unconfirmed
  // proposal must never turn into a search profile.
  const suggestions = buildSearchProfileSuggestions({
    projects: result.items,
    confirmedServices: result.items.flatMap((item) =>
      item.confirmedServiceCategories.map((serviceCategory) => ({
        projectId: item.id,
        serviceCategory,
      })),
    ),
  });

  const buildHref = (page: number): string => {
    const params = referenceQueryToParams({ ...query, page });
    const search = params.toString();
    return search.length > 0 ? `/references?${search}` : '/references';
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Referenzen"
        description="Bereits ausgeführte und laufende Kundenprojekte. Grundlage für spätere Suchprofil-Vorschläge und die Match-Engine."
        actions={
          <LinkButton href="/imports/references" variant="primary" size="sm">
            Daten importieren
          </LinkButton>
        }
      />

      {onlyProposalCount > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning-subtle px-4 py-3">
          <p className="text-sm font-semibold text-warning">
            {onlyProposalCount === 1
              ? '1 Referenz auf dieser Seite hat ausschließlich unbestätigte Vorschläge'
              : `${onlyProposalCount} Referenzen auf dieser Seite haben ausschließlich unbestätigte Vorschläge`}
          </p>
          <p className="mt-1 text-xs text-warning">
            Solange keine Leistungsart bestätigt ist, zählen diese Projekte nicht
            als Nachweis und fließen nicht in Suchprofil-Vorschläge ein.
          </p>
        </div>
      )}

      <Card>
        <form
          className="grid grid-cols-1 gap-3 border-b border-border-subtle p-4 sm:grid-cols-2 lg:grid-cols-4"
          action="/references"
        >
          <Input
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            placeholder="Volltextsuche …"
            aria-label="Volltextsuche"
          />
          <Select
            name="clientId"
            defaultValue={query.clientId ?? ''}
            aria-label="Kunde"
            placeholder="Alle Kunden"
            options={facets.clients.map((client) => ({
              value: client.id,
              label: client.name,
            }))}
          />
          <Select
            name="city"
            defaultValue={query.city ?? ''}
            aria-label="Standort"
            placeholder="Alle Standorte"
            options={facets.cities.map((city) => ({ value: city, label: city }))}
          />
          <Select
            name="objectType"
            defaultValue={query.objectType ?? ''}
            aria-label="Objektart"
            placeholder="Alle Objektarten"
            options={facets.objectTypes.map((type) => ({ value: type, label: type }))}
          />
          <Select
            name="services"
            defaultValue={query.services?.[0] ?? ''}
            aria-label="Leistungsart"
            placeholder="Alle Leistungsarten"
            options={REFERENCE_SERVICE_CATEGORIES.map((category) => ({
              value: category,
              label: REFERENCE_SERVICE_CATEGORY_LABELS[category],
            }))}
          />
          <Select
            name="statuses"
            defaultValue={query.statuses?.[0] ?? ''}
            aria-label="Projektstatus"
            placeholder="Alle Projektstatus"
            options={REFERENCE_PROJECT_STATUSES.map((status) => ({
              value: status,
              label: REFERENCE_PROJECT_STATUS_LABELS[status],
            }))}
          />
          <Select
            name="referenceStatus"
            defaultValue={query.referenceStatus ?? ''}
            aria-label="Referenzstatus"
            placeholder="Alle Referenzstatus"
            options={[
              { value: 'confirmed', label: 'Bestätigt' },
              { value: 'open', label: 'Prüfung offen' },
            ]}
          />
          <Select
            name="confirmationStatus"
            defaultValue={query.confirmationStatus ?? ''}
            aria-label="Bestätigungsstatus"
            placeholder="Alle Bestätigungsstatus"
            options={(
              ['evidence', 'proposed', 'undecided'] as const
            ).map((value) => ({
              value,
              label: CONFIRMATION_FILTER_LABELS[value],
            }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              name="periodFrom"
              type="date"
              defaultValue={query.periodFrom ?? ''}
              aria-label="Zeitraum von"
            />
            <Input
              name="periodTo"
              type="date"
              defaultValue={query.periodTo ?? ''}
              aria-label="Zeitraum bis"
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
            >
              Filtern
            </button>
            <LinkButton href="/references" size="md">
              Zurücksetzen
            </LinkButton>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <p className="text-xs text-text-secondary">
            <span className="tabular font-semibold text-text-primary">
              {formatNumber(result.total)}
            </span>{' '}
            {result.total === 1 ? 'Referenz' : 'Referenzen'}
            {activeFilters > 0 && ` · ${activeFilters} Filter aktiv`}
          </p>
          <p className="text-[11px] text-text-muted">{CLASSIFICATION_PROPOSAL_NOTE}</p>
        </div>

        {result.total === 0 && activeFilters === 0 ? (
          <EmptyState
            title="Noch keine Referenzen erfasst"
            description="Importieren Sie eine Objektliste, um Referenzprojekte anzulegen."
            action={
              <LinkButton href="/imports/references" variant="primary" size="sm">
                Zum Datenimport
              </LinkButton>
            }
          />
        ) : (
          <BulkConfirmTable
            projects={result.items}
            canEdit={canEdit}
            emptyMessage="Keine Referenzen entsprechen den gewählten Filtern."
          />
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

      {suggestions.length > 0 && (
        <Card>
          <CardHeader
            title="Suchprofil-Vorschläge"
            description="Abgeleitet aus bestätigten Leistungsarten"
          />
          <CardBody className="space-y-3">
            <ul className="space-y-2">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.key}
                  className="rounded-lg border border-border-subtle p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {suggestion.title}
                    </span>
                    <Badge tone="info">Vorschlag</Badge>
                    <Badge tone="neutral">
                      {suggestion.evidenceCount}{' '}
                      {suggestion.evidenceCount === 1 ? 'Referenz' : 'Referenzen'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">
                    {suggestion.rationale}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-snug text-text-muted">
              {SUGGESTION_NOTE}
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
