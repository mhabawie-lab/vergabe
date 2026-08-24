import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DataList, DataRow, PageHeader, PhasePlaceholder } from '@/components/ui/page';
import { ServiceBadge } from '@/components/references/service-badges';
import { requirePermission } from '@/lib/auth/session';
import { getReferenceStore } from '@/lib/db';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import {
  CLASSIFICATION_PROPOSAL_NOTE,
} from '@/modules/references/classification';
import { SHIFT_MEANING_NOTE, formatShiftSummary } from '@/modules/references/shift-format';
import {
  CLASSIFICATION_SOURCE_LABELS,
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

export default async function ReferenceDetailPage({ params }: PageProps) {
  const session = await requirePermission('references:read');

  const { id } = await params;
  const store = await getReferenceStore();
  const project = await store.findProjectById(session.organization.id, id);

  if (project === null) {
    notFound();
  }

  const unconfirmed = project.services.filter((service) => !service.confirmedByUser);

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
            {unconfirmed.length > 0 && (
              <Badge tone="warning">{unconfirmed.length} Vorschlag/Vorschläge offen</Badge>
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
              description="Bestätigte Angaben und offene Vorschläge"
            />
            <CardBody>
              {project.services.length === 0 ? (
                <p className="text-sm text-text-muted">
                  Keine Leistungsart erfasst.
                </p>
              ) : (
                <ul className="space-y-3">
                  {project.services.map((service) => (
                    <li
                      key={service.id}
                      className="rounded-lg border border-border-subtle p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <ServiceBadge
                          category={service.serviceCategory}
                          confirmed={service.confirmedByUser}
                        />
                        {service.confirmedByUser ? (
                          <Badge tone="success">Bestätigt</Badge>
                        ) : (
                          <Badge tone="warning">Vorschlag</Badge>
                        )}
                        <span className="text-[11px] text-text-muted">
                          {CLASSIFICATION_SOURCE_LABELS[service.classificationSource]}
                          {service.classificationConfidence !== null &&
                            ` · Konfidenz ${Math.round(service.classificationConfidence * 100)} %`}
                        </span>
                      </div>
                      {service.notes !== null && (
                        <p className="mt-1.5 text-xs text-text-secondary">
                          {service.notes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-3 rounded-lg border border-info/20 bg-info-subtle px-3 py-2 text-[11px] leading-snug text-info">
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

          {unconfirmed.length > 0 && (
            <Card>
              <CardHeader title="Datenwarnungen" />
              <CardBody>
                <p className="text-sm text-text-secondary">
                  {unconfirmed.length === 1
                    ? 'Eine Leistungsart ist noch ein unbestätigter Vorschlag.'
                    : `${unconfirmed.length} Leistungsarten sind noch unbestätigte Vorschläge.`}{' '}
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
            <CardHeader title="Audit-Historie" />
            <CardBody>
              <p className="text-sm text-text-secondary">
                Änderungen an dieser Referenz werden serverseitig im{' '}
                <code className="tabular">audit_log</code> protokolliert. Die
                Anzeige im Adminbereich folgt mit der Benutzerverwaltung.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
