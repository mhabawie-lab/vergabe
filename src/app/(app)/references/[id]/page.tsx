import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DataList, DataRow, PageHeader, PhasePlaceholder } from '@/components/ui/page';
import { ServiceConfirmationPanel } from '@/components/references/service-confirmation-panel';
import { hasPermission, requirePermission } from '@/lib/auth/session';
import { getReferenceStore } from '@/lib/db';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { CLASSIFICATION_PROPOSAL_NOTE } from '@/modules/references/classification';
import { CONFIRMATION_ACTION_LABELS } from '@/modules/references/confirmation';
import { SHIFT_MEANING_NOTE, formatShiftSummary } from '@/modules/references/shift-format';
import {
  CONFIDENTIALITY_LEVEL_LABELS,
  REFERENCE_INVOICE_STATUS_LABELS,
  REFERENCE_PROJECT_STATUS_LABELS,
  type ReferenceProjectStatus,
} from '@/types/reference';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return { title: `Referenz ${(await params).id.slice(0, 8)}` };
}

const STATUS_TONES: Record<ReferenceProjectStatus, BadgeTone> = {
  planned: 'info',
  active: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  unknown: 'neutral',
};

/** Audit action codes as written by the API and the database trigger. */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  service_confirmed: CONFIRMATION_ACTION_LABELS.confirm,
  service_category_changed: CONFIRMATION_ACTION_LABELS.change_and_confirm,
  service_marked_unknown: CONFIRMATION_ACTION_LABELS.mark_unknown,
  service_rejected: CONFIRMATION_ACTION_LABELS.reject,
  service_confirmation_reset: CONFIRMATION_ACTION_LABELS.reset,
};

export default async function ReferenceDetailPage({ params }: PageProps) {
  const session = await requirePermission('references:read');

  const { id } = await params;
  const store = await getReferenceStore();
  const project = await store.findProjectById(session.organization.id, id);

  if (project === null) {
    notFound();
  }

  const canEdit = hasPermission(session, 'references:write');

  // Open proposals are what still needs a decision; a rejected entry has been
  // dealt with even though it is not evidence.
  const openProposals = project.services.filter(
    (service) => service.confirmationStatus === 'proposed',
  );
  const evidence = project.services.filter((service) => service.confirmedByUser);

  const auditEntries = await store.listAuditEntries(
    session.organization.id,
    'reference_project_services',
    project.services.map((service) => service.id),
    25,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={project.projectName}
        description={project.description ?? undefined}
        badges={
          <>
            <Badge tone={STATUS_TONES[project.projectStatus]}>
              {REFERENCE_PROJECT_STATUS_LABELS[project.projectStatus]}
            </Badge>
            {openProposals.length > 0 ? (
              <Badge tone="warning">
                {openProposals.length === 1
                  ? '1 Vorschlag offen'
                  : `${openProposals.length} Vorschläge offen`}
              </Badge>
            ) : (
              evidence.length > 0 && <Badge tone="success">Leistungen bestätigt</Badge>
            )}
          </>
        }
        actions={
          <LinkButton href="/references" size="sm">
            Zurück zur Übersicht
          </LinkButton>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Projektübersicht" />
            <CardBody>
              <DataList>
                <DataRow label="Objekt-Nr.">
                  <span className="tabular">{project.externalObjectNumber ?? '—'}</span>
                </DataRow>
                <DataRow label="Projektname">{project.projectName}</DataRow>
                <DataRow label="Objektart">
                  {project.objectType ?? '—'}
                  <span className="mt-0.5 block text-[11px] text-text-muted">
                    Die Objektart beschreibt die Art des Standorts, nicht die dort
                    erbrachte Leistung.
                  </span>
                </DataRow>
                <DataRow label="Kunde">
                  {project.businessClientId === null ? (
                    '—'
                  ) : (
                    <Link
                      href={`/customers/${project.businessClientId}`}
                      className="hover:text-accent hover:underline"
                    >
                      {project.businessClientName ?? 'Kunde öffnen'}
                    </Link>
                  )}
                </DataRow>
                <DataRow label="Vertraulichkeit">
                  {CONFIDENTIALITY_LEVEL_LABELS[project.confidentialityLevel]}
                </DataRow>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Standort" />
            <CardBody>
              <DataList>
                <DataRow label="Ort">{project.city ?? '—'}</DataRow>
                <DataRow label="PLZ">
                  <span className="tabular">{project.postalCode ?? '—'}</span>
                </DataRow>
                <DataRow label="Region">{project.region ?? '—'}</DataRow>
                <DataRow label="Land">{project.country ?? '—'}</DataRow>
                <DataRow label="Adresse">{project.address ?? '—'}</DataRow>
              </DataList>
              <p className="mt-3 text-[11px] leading-snug text-text-muted">
                Fehlende Ortsangaben werden nicht automatisch ergänzt.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Leistungsarten"
              description={
                canEdit
                  ? 'Vorschläge prüfen und entscheiden. Erst eine Bestätigung macht daraus einen Nachweis.'
                  : 'Bestätigte Angaben und offene Vorschläge'
              }
              action={
                openProposals.length > 0 ? (
                  <Badge tone="warning">
                    {openProposals.length} offen
                  </Badge>
                ) : undefined
              }
            />
            <CardBody className="space-y-3">
              <ServiceConfirmationPanel
                services={project.services}
                canEdit={canEdit}
              />

              <p className="rounded-lg border border-info/20 bg-info-subtle px-3 py-2 text-[11px] leading-snug text-info">
                {CLASSIFICATION_PROPOSAL_NOTE}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Original-Importwerte" description="Unveränderte Quelldaten" />
            <CardBody>
              <DataList>
                <DataRow label="Schichten (Originalwert)">
                  <span className="tabular font-medium">
                    {formatShiftSummary(project.shiftSummaryRaw)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-text-muted">
                    {SHIFT_MEANING_NOTE}
                  </span>
                </DataRow>
                <DataRow label="Schichten (Zahlenwerte)">
                  {project.shiftValues.length === 0 ? (
                    '—'
                  ) : (
                    <span className="tabular">{project.shiftValues.join(' · ')}</span>
                  )}
                  <span className="mt-0.5 block text-[11px] text-text-muted">
                    Nur technische Aufteilung. Den einzelnen Positionen ist keine
                    Bedeutung zugeordnet.
                  </span>
                </DataRow>
                <DataRow label="Rechnungsstatus">
                  {REFERENCE_INVOICE_STATUS_LABELS[project.invoiceStatus]}
                </DataRow>
                <DataRow label="Herkunft">
                  {project.sourceImportId === null
                    ? 'Manuell erfasst'
                    : 'Aus Datenimport übernommen'}
                </DataRow>
              </DataList>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Projektzeitraum" />
            <CardBody>
              <DataList>
                <DataRow label="Beginn">
                  <span className="tabular">{formatDate(project.startDate)}</span>
                </DataRow>
                <DataRow label="Ende">
                  <span className="tabular">{formatDate(project.endDate)}</span>
                </DataRow>
                <DataRow label="Status">
                  {REFERENCE_PROJECT_STATUS_LABELS[project.projectStatus]}
                </DataRow>
              </DataList>
            </CardBody>
          </Card>

          {openProposals.length > 0 && (
            <Card>
              <CardHeader title="Datenwarnungen" />
              <CardBody>
                <p className="text-sm text-text-secondary">
                  {openProposals.length === 1
                    ? 'Eine Leistungsart ist noch ein unbestätigter Vorschlag.'
                    : `${openProposals.length} Leistungsarten sind noch unbestätigte Vorschläge.`}{' '}
                  Solange sie offen sind, zählt diese Referenz nicht als Nachweis
                  und fließt nicht in Suchprofil-Vorschläge ein.
                </p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Herkunft" />
            <CardBody>
              <DataList>
                <DataRow label="Angelegt am">
                  <span className="tabular text-xs">
                    {formatDateTime(project.createdAt)}
                  </span>
                </DataRow>
                <DataRow label="Zuletzt geändert">
                  <span className="tabular text-xs">
                    {formatDateTime(project.updatedAt)}
                  </span>
                </DataRow>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Referenznachweise" />
            <CardBody>
              <PhasePlaceholder phase={3} title="Nachweisdokumente">
                Referenzschreiben und Leistungsnachweise werden mit der
                Dokumentenverarbeitung hinterlegt und geprüft.
              </PhasePlaceholder>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Audit-Historie"
              description="Entscheidungen zu Leistungsarten"
            />
            <CardBody>
              {auditEntries.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  Noch keine Entscheidung protokolliert. Änderungen werden
                  serverseitig im <code className="tabular">audit_log</code>{' '}
                  festgehalten.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {auditEntries.map((entry) => {
                    const previous = entry.metadata['previousCategory'];
                    const next = entry.metadata['newCategory'];
                    const changed =
                      typeof previous === 'string' &&
                      typeof next === 'string' &&
                      previous !== next;

                    return (
                      <li key={entry.id} className="text-xs">
                        <span className="font-medium text-text-primary">
                          {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                        </span>
                        {changed && (
                          <span className="text-text-muted">
                            {' '}
                            ({String(previous)} → {String(next)})
                          </span>
                        )}
                        <span className="tabular mt-0.5 block text-[11px] text-text-muted">
                          {formatDateTime(entry.createdAt)}
                          {entry.userName !== null && ` · ${entry.userName}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
