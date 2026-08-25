import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AlertTriangle, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { DataList, DataRow, PageHeader } from '@/components/ui/page';
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
  ConfidenceBadge,
  CredentialBadge,
  DatacenterBadge,
  DirectionBadge,
  PartnerStatusBadge,
  SignalStatusBadge,
  SignalTypeBadge,
  VerificationBadge,
} from '@/components/partners/badges';
import {
  DetailTabs,
  PARTNER_TABS,
  isPartnerTab,
  type PartnerTab,
} from '@/components/partners/detail-tabs';
import { ChainTree } from '@/components/partners/chain-tree';
import {
  ActivityForm,
  AssignmentForm,
  AvailabilityForm,
  ContactForm,
  QualificationForm,
  RegionForm,
  ServiceForm,
} from '@/components/partners/sub-forms';
import { hasPermission, requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { formatDate, formatDateTime, formatNumber } from '@/lib/utils/format';
import {
  CREDENTIAL_STATE_DESCRIPTIONS,
  CREDENTIAL_STATE_LABELS,
  classifyCredential,
  qualificationAsCredential,
  suggestVerificationStatus,
} from '@/modules/partners/credentials';
import {
  AVAILABILITY_FRESHNESS_DESCRIPTIONS,
  AVAILABILITY_FRESHNESS_LABELS,
  availabilityFreshness,
} from '@/modules/partners/availability';
import { flattenChain } from '@/modules/partners/chain';
import { SIGNAL_DISCLAIMER } from '@/modules/partners/signals';
import {
  ACTIVITY_TYPE_LABELS,
  AVAILABILITY_STATUS_LABELS,
  CREDENTIAL_TYPE_LABELS,
  FURTHER_SUBCONTRACTING_LABELS,
  PARTNER_LEVEL_LABELS,
  PARTNER_SERVICE_CATEGORY_LABELS,
  PARTNER_SERVICE_CONFIRMATION_LABELS,
  PARTNER_SERVICE_SOURCE_LABELS,
  RATE_MODEL_LABELS,
  SHIFT_MODEL_LABELS,
  SOURCE_TYPE_LABELS,
  STAFF_MODEL_LABELS,
} from '@/types/partner';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return { title: `Partner ${(await params).id.slice(0, 8)}` };
}

export default async function PartnerDetailPage({ params, searchParams }: PageProps) {
  const session = await requirePermission('subcontractors:read');
  const canEdit = hasPermission(session, 'subcontractors:write');
  const canSeeRates = hasPermission(session, 'subcontractors:financial');
  const canSeeDocuments = hasPermission(session, 'subcontractors:documents');

  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const store = await getPartnerStore();
  const detail = await store.findCompanyById(session.organization.id, id);

  if (detail === null) notFound();

  const {
    company,
    contacts,
    services,
    regions,
    availability,
    qualifications,
    documents,
    activities,
    signals,
    credentialSummary,
    duplicateCandidates,
  } = detail;

  const activeTab: PartnerTab = isPartnerTab(rawTab) ? rawTab : 'overview';

  // Rates are hidden entirely without the permission, not merely emptied: a
  // visible but blank tab still tells you a price exists.
  const visibleTabs = PARTNER_TABS.filter((tab) => {
    if (tab === 'rates') return canSeeRates;
    if (tab === 'documents') return canSeeDocuments;
    return true;
  });

  const tab = visibleTabs.includes(activeTab) ? activeTab : 'overview';

  const [rates, chain, allAssignments] = await Promise.all([
    canSeeRates ? store.listRates(session.organization.id, id) : Promise.resolve([]),
    store.listAssignments(session.organization.id, { partnerCompanyId: id }),
    // The parent for a new assignment can be *any* assignment of the
    // organisation, not only one this company is already part of — otherwise a
    // newly created partner could never be placed under an existing one.
    store.listAssignments(session.organization.id, {}),
  ]);

  // Only assignments that actually permit further subcontracting are offered.
  // "Unknown" is not permission, and the server refuses it anyway; showing it
  // here would only produce an error the user cannot act on.
  const selectableParents = flattenChain(allAssignments)
    .filter(({ node }) => node.assignment.furtherSubcontractingAllowed === 'allowed')
    .map(({ node }) => ({
      id: node.assignment.id,
      label: `${node.companyName} · Ebene ${node.assignment.chainLevel}`,
    }));

  const auditEntries = await store.listAuditEntries(
    session.organization.id,
    'partner_companies',
    [id],
    30,
  );

  const verificationSuggestion = suggestVerificationStatus(
    qualifications.map(qualificationAsCredential),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={company.legalName}
        description={company.tradeName ?? undefined}
        badges={
          <>
            <DirectionBadge direction={company.relationshipDirection} />
            <PartnerStatusBadge status={company.status} />
            <VerificationBadge status={company.verificationStatus} />
            {company.isPreferred && <Badge tone="brand">Bevorzugt</Badge>}
            {company.isBlocked && <BlockedBadge reason={company.blockedReason} />}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <LinkButton
                href={`/subcontractors/${company.id}/edit`}
                variant="primary"
                size="sm"
              >
                Partner bearbeiten
              </LinkButton>
            )}
            <LinkButton href="/subcontractors" size="sm">
              Zurück zur Übersicht
            </LinkButton>
          </div>
        }
      />

      {company.isBlocked && (
        <div className="rounded-xl border border-danger/25 bg-danger-subtle px-4 py-3">
          <p className="text-sm font-semibold text-danger">Gesperrt</p>
          <p className="mt-1 text-xs text-danger">
            {company.blockedReason ?? 'Kein Grund hinterlegt.'} Das Unternehmen wird aus
            allen neuen Matches ausgeschlossen, bleibt aber in bestehenden
            Projektzuordnungen sichtbar.
          </p>
        </div>
      )}

      {duplicateCandidates.length > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning-subtle px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="size-4" aria-hidden />
            Möglicherweise doppelt erfasst
          </p>
          <p className="mt-1 text-xs text-warning">
            Ähnlich geschriebene Unternehmen:{' '}
            {duplicateCandidates.map((candidate) => candidate.legalName).join(', ')}. Eine
            Zusammenführung erfolgt nicht automatisch.
          </p>
        </div>
      )}

      <Card>
        <DetailTabs companyId={company.id} active={tab} visible={visibleTabs} />

        {tab === 'overview' && (
          <CardBody className="space-y-5">
            <DataList>
              <DataRow label="Beziehungsrichtung">
                <DirectionBadge direction={company.relationshipDirection} />
              </DataRow>
              <DataRow label="Ebene in der Kette">
                {PARTNER_LEVEL_LABELS[company.partnerLevel]}
              </DataRow>
              <DataRow label="Mitarbeitermodell">
                {STAFF_MODEL_LABELS[company.staffModel]}
              </DataRow>
              <DataRow label="Weitere Untervergabe">
                {FURTHER_SUBCONTRACTING_LABELS[company.furtherSubcontractingStatus]}
              </DataRow>
              <DataRow label="Datacenter-Erfahrung">
                <DatacenterBadge status={company.datacenterExperienceStatus} />
              </DataRow>
              <DataRow label="Standort">
                {[company.address, company.postalCode, company.city, company.region]
                  .filter((value) => value !== null && value.length > 0)
                  .join(', ') || '—'}
              </DataRow>
              <DataRow label="Land">{company.country ?? '—'}</DataRow>
              <DataRow label="Website">
                {company.website === null ? (
                  '—'
                ) : (
                  <a
                    href={company.website}
                    rel="noreferrer noopener"
                    target="_blank"
                    className="hover:text-accent hover:underline"
                  >
                    {company.website}
                  </a>
                )}
              </DataRow>
              <DataRow label="E-Mail">{company.email ?? '—'}</DataRow>
              <DataRow label="Telefon">{company.phone ?? '—'}</DataRow>
              <DataRow label="Register">
                {[company.registryName, company.registryNumber]
                  .filter((value) => value !== null)
                  .join(' ') || '—'}
              </DataRow>
              <DataRow label="Umsatzsteuer-ID">{company.vatId ?? '—'}</DataRow>
              <DataRow label="LEI">{company.lei ?? '—'}</DataRow>
              <DataRow label="Letzter Kontakt">{formatDate(company.lastContactAt)}</DataRow>
              <DataRow label="Nächste Wiedervorlage">
                {formatDate(company.nextFollowUpAt)}
              </DataRow>
            </DataList>

            <div className="rounded-lg border border-border-subtle p-3.5">
              <p className="text-xs font-medium text-text-secondary">
                Interne Bewertung
              </p>
              <p className="mt-1 text-sm text-text-primary">
                {company.internalRating === null
                  ? 'Keine Bewertung hinterlegt.'
                  : `${company.internalRating} von 5`}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-text-muted">
                Subjektive Einschätzung Ihrer Organisation. Keine objektive
                Qualitätsaussage und für niemanden außerhalb sichtbar.
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle p-3.5">
              <p className="text-xs font-medium text-text-secondary">Nachweislage</p>
              <div className="mt-2">
                <CredentialBadge summary={credentialSummary} />
              </div>
              <p className="mt-2 text-[11px] leading-snug text-text-muted">
                Vorschlag aus den hinterlegten Nachweisen:{' '}
                <span className="font-medium text-text-secondary">
                  {verificationSuggestion.suggested}
                </span>{' '}
                — {verificationSuggestion.reason} Der gespeicherte Status wird davon nicht
                automatisch geändert.
              </p>
            </div>

            {company.internalNotes !== null && (
              <div className="rounded-lg border border-border-subtle bg-surface-sunken p-3.5">
                <p className="text-xs font-medium text-text-secondary">Interne Notizen</p>
                <p className="mt-1 text-sm whitespace-pre-line text-text-primary">
                  {company.internalNotes}
                </p>
              </div>
            )}

            {company.sourceType !== null && (
              <div className="rounded-lg border border-border-subtle p-3.5">
                <p className="text-xs font-medium text-text-secondary">Herkunft</p>
                <p className="mt-1 text-sm text-text-primary">
                  {SOURCE_TYPE_LABELS[company.sourceType]}
                  {company.sourceName !== null && ` · ${company.sourceName}`}
                </p>
                {company.sourceUrl !== null && (
                  <a
                    href={company.sourceUrl}
                    rel="noreferrer noopener"
                    target="_blank"
                    className="mt-1 block text-[11px] text-text-muted hover:text-accent hover:underline"
                  >
                    {company.sourceUrl}
                  </a>
                )}
              </div>
            )}
          </CardBody>
        )}

        {tab === 'contacts' && (
          <>
          <TableContainer>
            <Table className="min-w-[48rem]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Funktion</TableHeaderCell>
                  <TableHeaderCell>E-Mail</TableHeaderCell>
                  <TableHeaderCell>Telefon</TableHeaderCell>
                  <TableHeaderCell>Bevorzugter Weg</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contacts.length === 0 ? (
                  <TableEmpty colSpan={6}>Keine Ansprechpartner erfasst.</TableEmpty>
                ) : (
                  contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="text-sm">
                        {[contact.firstName, contact.lastName]
                          .filter((value) => value !== null)
                          .join(' ')}
                      </TableCell>
                      <TableCell className="text-xs">{contact.role ?? '—'}</TableCell>
                      <TableCell className="text-xs">
                        {contact.businessEmail ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {contact.businessPhone ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">{contact.preferredChannel}</TableCell>
                      <TableCell>
                        {contact.isActive ? (
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
          {canEdit && (
            <CardBody>
              <ContactForm companyId={company.id} />
            </CardBody>
          )}
          </>
        )}

        {tab === 'services' && (
          <CardBody className="space-y-3">
            <p className="text-xs leading-snug text-text-muted">
              Nur <span className="font-medium text-text-secondary">bestätigte</span>{' '}
              Leistungen zählen als Nachweis und fließen in Matches ein. Selbst angegebene
              Leistungen werden festgehalten, gelten aber nicht als belegt.
            </p>
            {services.length === 0 ? (
              <p className="text-sm text-text-muted">Keine Leistungen erfasst.</p>
            ) : (
              <ul className="space-y-2">
                {services.map((service) => (
                  <li
                    key={service.id}
                    className="rounded-lg border border-border-subtle p-3.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {PARTNER_SERVICE_CATEGORY_LABELS[service.serviceCategory]}
                      </span>
                      <Badge
                        tone={service.confirmation === 'confirmed' ? 'success' : 'warning'}
                      >
                        {PARTNER_SERVICE_CONFIRMATION_LABELS[service.confirmation]}
                      </Badge>
                    </div>
                    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
                      <div className="flex gap-1.5">
                        <dt className="text-text-muted">Herkunft:</dt>
                        <dd className="text-text-secondary">
                          {PARTNER_SERVICE_SOURCE_LABELS[service.confirmationSource]}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-text-muted">Verfügbare Mitarbeiter:</dt>
                        <dd className="tabular text-text-secondary">
                          {service.availableStaff === null
                            ? '—'
                            : formatNumber(service.availableStaff)}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-text-muted">Erbringung:</dt>
                        <dd className="text-text-secondary">{service.deliveryMode}</dd>
                      </div>
                    </dl>
                    {service.note !== null && (
                      <p className="mt-2 text-[11px] text-text-muted">{service.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <ServiceForm companyId={company.id} />}
          </CardBody>
        )}

        {tab === 'regions' && (
          <>
          <TableContainer>
            <Table className="min-w-[44rem]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeaderCell>Land</TableHeaderCell>
                  <TableHeaderCell>Region</TableHeaderCell>
                  <TableHeaderCell>Ort</TableHeaderCell>
                  <TableHeaderCell align="right">Radius</TableHeaderCell>
                  <TableHeaderCell>Bundesweit</TableHeaderCell>
                  <TableHeaderCell>Bestätigt</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {regions.length === 0 ? (
                  <TableEmpty colSpan={6}>Kein Einsatzgebiet hinterlegt.</TableEmpty>
                ) : (
                  regions.map((region) => (
                    <TableRow key={region.id}>
                      <TableCell className="text-xs">{region.country ?? '—'}</TableCell>
                      <TableCell className="text-xs">{region.region ?? '—'}</TableCell>
                      <TableCell className="text-xs">{region.city ?? '—'}</TableCell>
                      <TableCell align="right" className="tabular text-xs">
                        {region.radiusKm === null ? '—' : `${region.radiusKm} km`}
                      </TableCell>
                      <TableCell className="text-xs">
                        {region.nationwide ? 'Ja' : 'Nein'}
                      </TableCell>
                      <TableCell>
                        {region.isConfirmed ? (
                          <Badge tone="success">Bestätigt</Badge>
                        ) : (
                          <Badge tone="warning">Angegeben</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {canEdit && (
            <CardBody>
              <RegionForm companyId={company.id} />
            </CardBody>
          )}
          </>
        )}

        {tab === 'availability' && (
          <CardBody className="space-y-3">
            <p className="text-xs leading-snug text-text-muted">
              Eine Verfügbarkeitsangabe altert. Nach sechs Wochen ohne Bestätigung gilt sie
              nicht mehr als aktuell und fließt nicht in Matches ein — sie bleibt aber
              sichtbar, weil sie das Letzte ist, was wir wissen.
            </p>
            {availability.length === 0 ? (
              <p className="text-sm text-text-muted">Keine Verfügbarkeit hinterlegt.</p>
            ) : (
              <ul className="space-y-2">
                {availability.map((entry) => {
                  const freshness = availabilityFreshness(entry);
                  return (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-border-subtle p-3.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary">
                          {AVAILABILITY_STATUS_LABELS[entry.status]}
                        </span>
                        <Badge
                          tone={
                            freshness === 'fresh'
                              ? 'success'
                              : freshness === 'ageing'
                                ? 'warning'
                                : 'neutral'
                          }
                          title={AVAILABILITY_FRESHNESS_DESCRIPTIONS[freshness]}
                        >
                          {AVAILABILITY_FRESHNESS_LABELS[freshness]}
                        </Badge>
                        {entry.serviceCategory !== null && (
                          <Badge tone="neutral">
                            {PARTNER_SERVICE_CATEGORY_LABELS[entry.serviceCategory]}
                          </Badge>
                        )}
                      </div>
                      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
                        <div className="flex gap-1.5">
                          <dt className="text-text-muted">Zeitraum:</dt>
                          <dd className="tabular text-text-secondary">
                            {formatDate(entry.availableFrom)} – {formatDate(entry.availableUntil)}
                          </dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="text-text-muted">Mitarbeiter:</dt>
                          <dd className="tabular text-text-secondary">
                            {entry.availableStaff === null
                              ? '—'
                              : formatNumber(entry.availableStaff)}
                          </dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="text-text-muted">Schichtmodell:</dt>
                          <dd className="text-text-secondary">
                            {SHIFT_MODEL_LABELS[entry.shiftModel]}
                          </dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="text-text-muted">Zuletzt bestätigt:</dt>
                          <dd className="tabular text-text-secondary">
                            {entry.lastConfirmedAt === null
                              ? 'nie'
                              : formatDateTime(entry.lastConfirmedAt)}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
            {canEdit && <AvailabilityForm companyId={company.id} />}
          </CardBody>
        )}

        {tab === 'qualifications' && (
          <>
          <TableContainer>
            <Table className="min-w-[52rem]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeaderCell>Art</TableHeaderCell>
                  <TableHeaderCell>Aussteller</TableHeaderCell>
                  <TableHeaderCell>Nummer</TableHeaderCell>
                  <TableHeaderCell>Gültig bis</TableHeaderCell>
                  <TableHeaderCell>Zustand</TableHeaderCell>
                  <TableHeaderCell>Geprüft am</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {qualifications.length === 0 ? (
                  <TableEmpty colSpan={6}>Keine Nachweise erfasst.</TableEmpty>
                ) : (
                  qualifications.map((qualification) => {
                    const state = classifyCredential(
                      qualificationAsCredential(qualification),
                    );
                    return (
                      <TableRow key={qualification.id}>
                        <TableCell className="text-xs">
                          {CREDENTIAL_TYPE_LABELS[qualification.credentialType]}
                        </TableCell>
                        <TableCell className="text-xs">
                          {qualification.issuer ?? '—'}
                        </TableCell>
                        <TableCell className="tabular text-xs">
                          {qualification.documentNumber ?? '—'}
                        </TableCell>
                        <TableCell className="tabular text-xs whitespace-nowrap">
                          {formatDate(qualification.validUntil)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            tone={
                              state === 'valid'
                                ? 'success'
                                : state === 'expiring'
                                  ? 'warning'
                                  : state === 'expired' || state === 'rejected'
                                    ? 'danger'
                                    : 'neutral'
                            }
                            title={CREDENTIAL_STATE_DESCRIPTIONS[state]}
                          >
                            {CREDENTIAL_STATE_LABELS[state]}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular text-xs whitespace-nowrap">
                          {formatDate(qualification.reviewedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {canEdit && (
            <CardBody>
              <QualificationForm companyId={company.id} />
            </CardBody>
          )}
          </>
        )}

        {tab === 'documents' && canSeeDocuments && (
          <CardBody className="space-y-3">
            <div className="rounded-lg border border-border-subtle bg-surface-sunken p-3.5">
              <p className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                <Lock className="size-3.5" aria-hidden />
                Privat abgelegt
              </p>
              <p className="mt-1 text-[11px] leading-snug text-text-muted">
                Dokumente liegen in einem privaten Speicher ohne öffentliche URL. In dieser
                Phase werden ausschließlich Metadaten erfasst — es wird kein Dateiinhalt
                hochgeladen und keine Schadsoftwareprüfung durchgeführt.
              </p>
            </div>
            <TableContainer>
              <Table className="min-w-[48rem]">
                <TableHead>
                  <TableRow className="hover:bg-transparent">
                    <TableHeaderCell>Datei</TableHeaderCell>
                    <TableHeaderCell>Art</TableHeaderCell>
                    <TableHeaderCell>Gültig bis</TableHeaderCell>
                    <TableHeaderCell>Prüfstatus</TableHeaderCell>
                    <TableHeaderCell>Scan</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {documents.length === 0 ? (
                    <TableEmpty colSpan={5}>Keine Dokumente hinterlegt.</TableEmpty>
                  ) : (
                    documents.map((document) => (
                      <TableRow key={document.id}>
                        <TableCell className="text-xs">{document.fileName}</TableCell>
                        <TableCell className="text-xs">
                          {CREDENTIAL_TYPE_LABELS[document.credentialType]}
                        </TableCell>
                        <TableCell className="tabular text-xs">
                          {formatDate(document.validUntil)}
                        </TableCell>
                        <TableCell className="text-xs">{document.reviewStatus}</TableCell>
                        <TableCell>
                          <Badge tone="neutral">Nicht geprüft</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardBody>
        )}

        {tab === 'rates' && canSeeRates && (
          <CardBody className="space-y-3">
            <div className="rounded-lg border border-danger/20 bg-danger-subtle p-3.5">
              <p className="text-xs font-semibold text-danger">Besonders vertraulich</p>
              <p className="mt-1 text-[11px] leading-snug text-danger">
                Verhandelte Konditionen. Sichtbar nur mit der Berechtigung
                <code className="tabular"> subcontractors:financial</code>. Beträge werden
                nicht im Audit-Log gespeichert.
              </p>
            </div>
            <TableContainer>
              <Table className="min-w-[52rem]">
                <TableHead>
                  <TableRow className="hover:bg-transparent">
                    <TableHeaderCell>Leistung</TableHeaderCell>
                    <TableHeaderCell>Modell</TableHeaderCell>
                    <TableHeaderCell align="right">Netto</TableHeaderCell>
                    <TableHeaderCell>Gültig</TableHeaderCell>
                    <TableHeaderCell>Verhandlungsstand</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rates.length === 0 ? (
                    <TableEmpty colSpan={5}>Keine Konditionen hinterlegt.</TableEmpty>
                  ) : (
                    rates.map((rate) => (
                      <TableRow key={rate.id}>
                        <TableCell className="text-xs">
                          {rate.serviceCategory === null
                            ? '—'
                            : PARTNER_SERVICE_CATEGORY_LABELS[rate.serviceCategory]}
                        </TableCell>
                        <TableCell className="text-xs">
                          {RATE_MODEL_LABELS[rate.rateModel]}
                        </TableCell>
                        <TableCell align="right" className="tabular text-xs">
                          {rate.netAmount === null
                            ? '—'
                            : `${formatNumber(rate.netAmount)} ${rate.currency}`}
                        </TableCell>
                        <TableCell className="tabular text-xs whitespace-nowrap">
                          {formatDate(rate.validFrom)} – {formatDate(rate.validUntil)}
                        </TableCell>
                        <TableCell className="text-xs">{rate.negotiationStatus}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardBody>
        )}

        {tab === 'projects' && (
          <CardBody className="space-y-4">
            <ChainTree nodes={chain} emptyMessage="Keine Projektzuordnungen erfasst." />
            {canEdit && (
              <AssignmentForm companyId={company.id} parents={selectableParents} />
            )}
          </CardBody>
        )}

        {tab === 'signals' && (
          <CardBody className="space-y-3">
            <p className="text-xs leading-snug text-text-muted">{SIGNAL_DISCLAIMER}</p>
            {signals.length === 0 ? (
              <p className="text-sm text-text-muted">Keine Signale erfasst.</p>
            ) : (
              <ul className="space-y-2">
                {signals.map((signal) => (
                  <li
                    key={signal.id}
                    className="rounded-lg border border-border-subtle p-3.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <SignalTypeBadge type={signal.signalType} />
                      <SignalStatusBadge status={signal.status} />
                      <ConfidenceBadge confidence={signal.confidence} />
                    </div>
                    {signal.description !== null && (
                      <p className="mt-2 text-xs text-text-secondary">
                        {signal.description}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-text-muted">
                      Beobachtet am {formatDate(signal.observedAt)} · Quelle:{' '}
                      {SOURCE_TYPE_LABELS[signal.sourceType]}
                      {signal.sourceName !== null && ` (${signal.sourceName})`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        )}

        {tab === 'activities' && (
          <>
          <TableContainer>
            <Table className="min-w-[52rem]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeaderCell>Zeitpunkt</TableHeaderCell>
                  <TableHeaderCell>Art</TableHeaderCell>
                  <TableHeaderCell>Zusammenfassung</TableHeaderCell>
                  <TableHeaderCell>Ergebnis</TableHeaderCell>
                  <TableHeaderCell>Wiedervorlage</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activities.length === 0 ? (
                  <TableEmpty colSpan={5}>Keine Aktivitäten erfasst.</TableEmpty>
                ) : (
                  activities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="tabular text-xs whitespace-nowrap">
                        {formatDateTime(activity.occurredAt)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {ACTIVITY_TYPE_LABELS[activity.activityType]}
                      </TableCell>
                      <TableCell className="max-w-[22rem] text-xs">
                        {activity.summary ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[16rem] text-xs">
                        {activity.outcome ?? '—'}
                      </TableCell>
                      <TableCell className="tabular text-xs whitespace-nowrap">
                        {formatDate(activity.followUpAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {canEdit && (
            <CardBody>
              <ActivityForm companyId={company.id} />
            </CardBody>
          )}
          </>
        )}

        {tab === 'chain' && (
          <CardBody className="space-y-3">
            <p className="text-xs leading-snug text-text-muted">
              Wer beauftragt wen. Ein gesperrter Partner bleibt in einer bestehenden Kette
              sichtbar — er war dort im Einsatz, und dieser Umstand darf nicht durch eine
              spätere Entscheidung verschwinden.
            </p>
            <ChainTree nodes={chain} emptyMessage="Keine Kette erfasst." />
          </CardBody>
        )}

        {tab === 'audit' && (
          <CardBody>
            {auditEntries.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Noch keine Änderung protokolliert.
              </p>
            ) : (
              <ul className="space-y-2.5" aria-label="Audit-Historie">
                {auditEntries.map((entry) => (
                  <li key={entry.id} className="text-xs">
                    <span className="font-medium text-text-primary">{entry.action}</span>
                    <span className="tabular mt-0.5 block text-[11px] text-text-muted">
                      {formatDateTime(entry.createdAt)}
                      {entry.userName !== null && ` · ${entry.userName}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] leading-snug text-text-muted">
              Protokolliert werden ausschließlich Metadaten — welche Felder sich geändert
              haben, nie deren Inhalt, und niemals Preise oder Notiztexte.
            </p>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
