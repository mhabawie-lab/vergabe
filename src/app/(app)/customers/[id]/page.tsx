import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DataList, DataRow, PageHeader, PhasePlaceholder } from '@/components/ui/page';
import { ReferenceTable } from '@/components/references/reference-table';
import { ServiceBadge } from '@/components/references/service-badges';
import { requirePermission } from '@/lib/auth/session';
import { getReferenceStore } from '@/lib/db';
import { formatDate, formatNumber } from '@/lib/utils/format';
import { CLASSIFICATION_PROPOSAL_NOTE } from '@/modules/references/classification';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return { title: `Kunde ${(await params).id.slice(0, 8)}` };
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const session = await requirePermission('clients:read');

  const { id } = await params;
  const store = await getReferenceStore();
  const detail = await store.findClientById(session.organization.id, id);

  if (detail === null) {
    notFound();
  }

  const { client, projects, locations, confirmedServiceCategories, proposedServiceCategories } =
    detail;

  return (
    <div className="space-y-5">
      <PageHeader
        title={client.name}
        description={client.notes ?? undefined}
        badges={
          client.isActive ? (
            <Badge tone="success">Aktiv</Badge>
          ) : (
            <Badge tone="neutral">Inaktiv</Badge>
          )
        }
        actions={
          <LinkButton href="/customers" size="sm">
            Zurück zur Übersicht
          </LinkButton>
        }
      />

      {detail.duplicateCandidates.length > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning-subtle px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="size-4" aria-hidden />
            Möglicherweise doppelt erfasst
          </p>
          <p className="mt-1 text-xs text-warning">
            Ähnlich geschriebene Kunden in Ihrer Organisation:{' '}
            {detail.duplicateCandidates.map((candidate) => candidate.name).join(', ')}.
            Die Zusammenführung erfolgt nicht automatisch.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {[
          { label: 'Referenzprojekte', value: formatNumber(projects.length) },
          {
            label: 'Aktive Projekte',
            value: formatNumber(
              projects.filter((project) => project.projectStatus === 'active').length,
            ),
          },
          { label: 'Standorte', value: formatNumber(locations.length) },
          {
            label: 'Bestätigte Leistungsarten',
            value: formatNumber(confirmedServiceCategories.length),
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl border border-border-subtle bg-surface-raised p-4 shadow-card"
          >
            <p className="text-xs font-medium text-text-secondary">{tile.label}</p>
            <p className="tabular mt-2 text-2xl font-semibold text-text-primary">
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Referenzprojekte"
              description="Alle für diesen Kunden erfassten Projekte"
            />
            <ReferenceTable
              projects={projects}
              emptyMessage="Für diesen Kunden sind noch keine Projekte erfasst."
            />
          </Card>

          <Card>
            <CardHeader
              title="Leistungsarten"
              description="Bestätigte Angaben und offene Vorschläge"
            />
            <CardBody className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-text-secondary">
                  Bestätigt ({confirmedServiceCategories.length})
                </p>
                {confirmedServiceCategories.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    Noch keine Leistungsart bestätigt. Nur bestätigte Angaben
                    fließen später in Suchprofil-Vorschläge ein.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {confirmedServiceCategories.map((category) => (
                      <ServiceBadge key={category} category={category} confirmed />
                    ))}
                  </div>
                )}
              </div>

              {proposedServiceCategories.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-text-secondary">
                    Vorschläge ({proposedServiceCategories.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {proposedServiceCategories.map((category) => (
                      <ServiceBadge
                        key={category}
                        category={category}
                        confirmed={false}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-text-muted">
                    {CLASSIFICATION_PROPOSAL_NOTE}
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Stammdaten" />
            <CardBody>
              <DataList>
                <DataRow label="Name">{client.name}</DataRow>
                <DataRow label="Land">{client.country ?? '—'}</DataRow>
                <DataRow label="Website">
                  {client.website === null ? (
                    '—'
                  ) : (
                    <span className="text-xs break-all">{client.website}</span>
                  )}
                </DataRow>
                <DataRow label="Angelegt am">
                  <span className="tabular text-xs">{formatDate(client.createdAt)}</span>
                </DataRow>
                <DataRow label="Zuletzt geändert">
                  <span className="tabular text-xs">{formatDate(client.updatedAt)}</span>
                </DataRow>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Standorte" description="Aus den Referenzprojekten" />
            <CardBody>
              {locations.length === 0 ? (
                <p className="text-sm text-text-muted">Keine Orte erfasst.</p>
              ) : (
                <ul className="space-y-1">
                  {locations.map((location) => (
                    <li key={location} className="text-sm text-text-primary">
                      {location}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] leading-snug text-text-muted">
                Unvollständige Ortsangaben werden nicht automatisch ergänzt.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Interne Notizen" />
            <CardBody>
              {client.notes === null ? (
                <p className="text-sm text-text-muted">Keine Notizen hinterlegt.</p>
              ) : (
                <p className="text-sm whitespace-pre-wrap text-text-secondary">
                  {client.notes}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Nachweise und Änderungsverlauf" />
            <CardBody>
              <PhasePlaceholder phase={3} title="Referenznachweise">
                Das Hochladen von Referenzschreiben und der vollständige
                Änderungsverlauf folgen mit der Dokumentenverarbeitung. Änderungen
                an Kundendaten werden bereits heute serverseitig im{' '}
                <code className="tabular">audit_log</code> protokolliert.
              </PhasePlaceholder>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
