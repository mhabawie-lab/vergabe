import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { MatchScoreCard } from '@/components/tenders/match-score-card';
import {
  Badge,
  DemoBadge,
  DocumentStatusBadge,
  TenderStatusBadge,
} from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { DataList, DataRow, PageHeader, PhasePlaceholder } from '@/components/ui/page';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table';
import { getCpvLabel } from '@/config/cpv';
import { getCountryLabel, getRegionLabel } from '@/config/regions';
import { getSectorLabel } from '@/config/sectors';
import { requirePermission } from '@/lib/auth/session';
import { getTenderRepository } from '@/lib/db';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDeadlineDistance,
  formatDuration,
  formatFileSize,
} from '@/lib/utils/format';
import { scoreTender } from '@/modules/matching/preview';
import {
  PROCEDURE_TYPE_LABELS,
  PROCUREMENT_TYPE_LABELS,
  type RequirementCategory,
  type Tender,
} from '@/types/tender';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const repository = await getTenderRepository();
  const tender = await repository.findById(id);

  return { title: tender?.title ?? 'Ausschreibung' };
}

/** In-page navigation for the detail sections. */
const SECTIONS = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'leistungsbeschreibung', label: 'Leistungsbeschreibung' },
  { id: 'eignung', label: 'Eignung' },
  { id: 'personal', label: 'Personal' },
  { id: 'dokumente', label: 'Dokumente' },
  { id: 'fristen', label: 'Fristen' },
  { id: 'auftraggeber', label: 'Auftraggeber' },
  { id: 'vergabehistorie', label: 'Vergabehistorie' },
] as const;

function SectionNav() {
  return (
    <nav
      aria-label="Abschnitte"
      className="scrollbar-slim -mx-4 flex gap-1 overflow-x-auto border-b border-border-subtle px-4 pb-px sm:mx-0 sm:px-0"
    >
      {SECTIONS.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="rounded-t-lg px-3 py-2 text-xs font-medium whitespace-nowrap text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}

function RequirementSection({
  tender,
  category,
  id,
  title,
  description,
  emptyMessage,
}: {
  tender: Tender;
  category: RequirementCategory;
  id: string;
  title: string;
  description: string;
  emptyMessage: string;
}) {
  const requirements = tender.requirements.filter(
    (requirement) => requirement.category === category,
  );

  return (
    <Card>
      <CardHeader
        title={<span id={id}>{title}</span>}
        description={description}
        action={
          <Badge tone="neutral">
            {requirements.length}{' '}
            {requirements.length === 1 ? 'Anforderung' : 'Anforderungen'}
          </Badge>
        }
      />
      <CardBody>
        {requirements.length === 0 ? (
          <p className="text-sm text-text-muted">{emptyMessage}</p>
        ) : (
          <ul className="space-y-2.5">
            {requirements.map((requirement) => (
              <li key={requirement.id} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand"
                />
                <div className="min-w-0">
                  <p className="text-sm text-text-primary">{requirement.label}</p>
                  {requirement.description !== null && (
                    <p className="mt-0.5 text-xs text-text-muted">
                      {requirement.description}
                    </p>
                  )}
                  {!requirement.mandatory && (
                    <Badge tone="neutral" className="mt-1">
                      Optional
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <PhasePlaceholder phase={3} title="Abgleich mit dem Unternehmensprofil">
          Ab Phase 3 gleicht die KI-Analyse diese Anforderungen mit den
          hinterlegten Zertifikaten, Referenzen und Mitarbeiterqualifikationen ab
          und weist fehlende Nachweise gezielt aus.
        </PhasePlaceholder>
      </CardBody>
    </Card>
  );
}

export default async function TenderDetailPage({ params }: PageProps) {
  await requirePermission('tenders:read');

  const { id } = await params;
  const repository = await getTenderRepository();
  const tender = await repository.findById(id);

  if (tender === null) {
    notFound();
  }

  const awards = await repository.listAwardsForTender(tender.id);
  const preview = scoreTender({
    sectors: tender.sectors,
    cpvCodes: tender.cpvCodes,
    regionCode: tender.regionCode,
    countryCode: tender.countryCode,
    estimatedValueNet: tender.estimatedValueNet,
  });

  const authority = tender.contractingAuthority;

  return (
    <div className="space-y-5">
      <PageHeader
        title={tender.title}
        description={tender.summary ?? undefined}
        badges={
          <>
            <TenderStatusBadge status={tender.status} />
            {tender.isDemo && <DemoBadge />}
          </>
        }
        actions={
          <>
            <LinkButton href="/tenders" size="sm">
              Zurück zur Suche
            </LinkButton>
            {tender.sourceUrl !== null && (
              <a
                href={tender.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-raised px-2.5 text-xs font-medium text-text-primary ring-1 ring-inset ring-border-strong transition-colors hover:bg-surface-sunken"
              >
                Originalbekanntmachung
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </>
        }
      />

      <SectionNav />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          {/* --- Übersicht ------------------------------------------------ */}
          <Card>
            <CardHeader
              title={<span id="uebersicht">Übersicht</span>}
              description="Kerndaten im einheitlichen internen Format"
            />
            <CardBody>
              <DataList>
                <DataRow label="Vergabenummer">
                  <span className="tabular">{tender.externalId}</span>
                </DataRow>
                <DataRow label="Aktenzeichen">
                  <span className="tabular">{tender.referenceNumber ?? '—'}</span>
                </DataRow>
                <DataRow label="Leistungsart">
                  {PROCUREMENT_TYPE_LABELS[tender.procurementType]}
                </DataRow>
                <DataRow label="Verfahrensart">
                  {tender.procedureType === null
                    ? '—'
                    : PROCEDURE_TYPE_LABELS[tender.procedureType]}
                </DataRow>
                <DataRow label="Branchen">
                  {tender.sectors.length === 0 ? (
                    '—'
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {tender.sectors.map((sector) => (
                        <Badge key={sector} tone="brand">
                          {getSectorLabel(sector)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </DataRow>
                <DataRow label="CPV-Codes">
                  {tender.cpvCodes.length === 0 ? (
                    '—'
                  ) : (
                    <ul className="space-y-1">
                      {tender.cpvCodes.map((code) => (
                        <li key={code} className="text-sm">
                          <span className="tabular font-medium">{code}</span>
                          <span className="text-text-muted"> — {getCpvLabel(code)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </DataRow>
                <DataRow label="Erfüllungsort">
                  {tender.city ?? '—'}
                  {tender.postalCode !== null && ` (${tender.postalCode})`}
                  <span className="block text-xs text-text-muted">
                    {getRegionLabel(tender.regionCode)} ·{' '}
                    {getCountryLabel(tender.countryCode)}
                    {tender.nutsCodes.length > 0 && ` · NUTS ${tender.nutsCodes.join(', ')}`}
                  </span>
                </DataRow>
                <DataRow label="Geschätzter Auftragswert">
                  <span className="tabular font-medium">
                    {formatCurrency(tender.estimatedValueNet, tender.currency)}
                  </span>
                </DataRow>
                <DataRow label="Laufzeit">
                  {formatDuration(tender.durationMonths)}
                  <span className="block text-xs text-text-muted">
                    {formatDate(tender.contractStart)} – {formatDate(tender.contractEnd)}
                  </span>
                </DataRow>
                <DataRow label="Quelle">
                  {tender.sourceName}
                  <span className="block text-xs text-text-muted">
                    Interner Schlüssel: {tender.sourceKey} · Original-ID:{' '}
                    {tender.externalId}
                  </span>
                </DataRow>
              </DataList>

              {tender.lots.length > 0 && (
                <div className="mt-5 border-t border-border-subtle pt-4">
                  <h3 className="mb-3 text-sm font-semibold text-text-primary">
                    Lose ({tender.lots.length})
                  </h3>
                  <TableContainer>
                    <Table className="min-w-[36rem]">
                      <TableHead>
                        <TableRow className="hover:bg-transparent">
                          <TableHeaderCell>Los</TableHeaderCell>
                          <TableHeaderCell>Bezeichnung</TableHeaderCell>
                          <TableHeaderCell align="right">Wert</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {tender.lots.map((lot) => (
                          <TableRow key={lot.id}>
                            <TableCell className="tabular whitespace-nowrap">
                              {lot.lotNumber}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-text-primary">
                                {lot.title}
                              </span>
                              {lot.description !== null && (
                                <span className="mt-0.5 block text-xs text-text-muted">
                                  {lot.description}
                                </span>
                              )}
                            </TableCell>
                            <TableCell align="right" className="tabular whitespace-nowrap">
                              {formatCurrency(lot.estimatedValueNet, tender.currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </div>
              )}
            </CardBody>
          </Card>

          {/* --- Leistungsbeschreibung ------------------------------------ */}
          <Card>
            <CardHeader
              title={<span id="leistungsbeschreibung">Leistungsbeschreibung</span>}
              description="Vollständiger Text wie von der Quelle übermittelt"
            />
            <CardBody>
              {tender.description === null ? (
                <p className="text-sm text-text-muted">
                  Die Quelle hat keine Leistungsbeschreibung übermittelt.
                </p>
              ) : (
                <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
                  {tender.description.split('\n').map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* --- Eignung / Personal --------------------------------------- */}
          <RequirementSection
            tender={tender}
            category="eligibility"
            id="eignung"
            title="Eignung"
            description="Eignungskriterien und geforderte Nachweise"
            emptyMessage="Die Quelle hat keine strukturierten Eignungskriterien übermittelt."
          />

          <RequirementSection
            tender={tender}
            category="staff"
            id="personal"
            title="Personal"
            description="Anforderungen an das eingesetzte Personal"
            emptyMessage="Die Quelle hat keine strukturierten Personalanforderungen übermittelt."
          />

          {/* --- Dokumente ------------------------------------------------ */}
          <Card>
            <CardHeader
              title={<span id="dokumente">Dokumente</span>}
              description="Vergabeunterlagen und Anlagen"
              action={
                <Badge tone="neutral">
                  {tender.documents.length}{' '}
                  {tender.documents.length === 1 ? 'Dokument' : 'Dokumente'}
                </Badge>
              }
            />
            {tender.documents.length === 0 ? (
              <CardBody>
                <p className="text-sm text-text-muted">
                  Für diese Ausschreibung sind keine Unterlagen hinterlegt.
                </p>
              </CardBody>
            ) : (
              <TableContainer>
                <Table className="min-w-[34rem]">
                  <TableHead>
                    <TableRow className="hover:bg-transparent">
                      <TableHeaderCell>Titel</TableHeaderCell>
                      <TableHeaderCell>Format</TableHeaderCell>
                      <TableHeaderCell align="right">Größe</TableHeaderCell>
                      <TableHeaderCell>Download</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tender.documents.map((document) => (
                      <TableRow key={document.id}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm text-text-primary">
                              {document.title}
                            </span>
                            {document.isDemo && <DemoBadge />}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs uppercase">
                          {document.fileType ?? '—'}
                        </TableCell>
                        <TableCell align="right" className="tabular text-xs">
                          {formatFileSize(document.fileSizeBytes)}
                        </TableCell>
                        <TableCell>
                          <DocumentStatusBadge status={document.downloadStatus} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            <CardBody className="pt-0">
              <PhasePlaceholder phase={3} title="Automatischer Download und Textanalyse">
                Ab Phase 3 lädt SicherVergabe die Vergabeunterlagen automatisch
                herunter, extrahiert den Text (inklusive OCR für Scans) und
                analysiert Anlagen auf Anforderungen und Fristen. Aktuell werden
                nur die von der Quelle gemeldeten Metadaten angezeigt.
              </PhasePlaceholder>
            </CardBody>
          </Card>

          {/* --- Fristen -------------------------------------------------- */}
          <Card>
            <CardHeader
              title={<span id="fristen">Fristen</span>}
              description="Termine des Vergabeverfahrens"
            />
            <CardBody>
              <DataList>
                <DataRow label="Veröffentlicht am">
                  <span className="tabular">{formatDateTime(tender.publicationDate)}</span>
                </DataRow>
                <DataRow label="Bieterfragen bis">
                  <span className="tabular">{formatDateTime(tender.questionDeadline)}</span>
                </DataRow>
                <DataRow label="Angebotsfrist">
                  <span className="tabular font-medium text-text-primary">
                    {formatDateTime(tender.submissionDeadline)}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {formatDeadlineDistance(tender.submissionDeadline)}
                  </span>
                </DataRow>
                <DataRow label="Bindefrist">
                  <span className="tabular">{formatDateTime(tender.bindingPeriodEnd)}</span>
                </DataRow>
                <DataRow label="Vertragsbeginn">
                  <span className="tabular">{formatDate(tender.contractStart)}</span>
                </DataRow>
                <DataRow label="Vertragsende">
                  <span className="tabular">{formatDate(tender.contractEnd)}</span>
                </DataRow>
              </DataList>
            </CardBody>
          </Card>

          {/* --- Auftraggeber --------------------------------------------- */}
          <Card>
            <CardHeader
              title={<span id="auftraggeber">Auftraggeber</span>}
              description="Vergebende Stelle"
              action={
                authority !== null ? (
                  <LinkButton href={`/authorities/${authority.id}`} size="sm">
                    Profil öffnen
                  </LinkButton>
                ) : undefined
              }
            />
            <CardBody>
              {authority === null ? (
                <p className="text-sm text-text-muted">
                  Die Quelle hat keinen Auftraggeber übermittelt.
                </p>
              ) : (
                <DataList>
                  <DataRow label="Name">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{authority.name}</span>
                      {authority.isDemo && <DemoBadge />}
                    </div>
                  </DataRow>
                  <DataRow label="Typ">{authority.authorityType ?? '—'}</DataRow>
                  <DataRow label="Anschrift">
                    {authority.street ?? '—'}
                    <span className="block text-xs text-text-muted">
                      {authority.postalCode ?? ''} {authority.city ?? ''} ·{' '}
                      {getRegionLabel(authority.regionCode)}
                    </span>
                  </DataRow>
                  <DataRow label="E-Mail">{authority.email ?? '—'}</DataRow>
                  <DataRow label="Telefon">{authority.phone ?? '—'}</DataRow>
                </DataList>
              )}
            </CardBody>
          </Card>

          {/* --- Vergabehistorie ------------------------------------------ */}
          <Card>
            <CardHeader
              title={<span id="vergabehistorie">Vergabehistorie</span>}
              description="Zuschläge zu dieser Ausschreibung"
            />
            {awards.length === 0 ? (
              <CardBody>
                <p className="text-sm text-text-muted">
                  Zu dieser Ausschreibung ist noch kein Zuschlag erfasst.
                </p>
              </CardBody>
            ) : (
              <TableContainer>
                <Table className="min-w-[34rem]">
                  <TableHead>
                    <TableRow className="hover:bg-transparent">
                      <TableHeaderCell>Auftragnehmer</TableHeaderCell>
                      <TableHeaderCell>Zuschlag am</TableHeaderCell>
                      <TableHeaderCell align="right">Zuschlagswert</TableHeaderCell>
                      <TableHeaderCell align="right">Bieter</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {awards.map((award) => (
                      <TableRow key={award.id}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm text-text-primary">
                              {award.winnerName}
                            </span>
                            {award.isDemo && <DemoBadge />}
                          </div>
                          {award.winnerCity !== null && (
                            <span className="text-xs text-text-muted">
                              {award.winnerCity}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="tabular text-xs">
                          {formatDate(award.awardDate)}
                        </TableCell>
                        <TableCell align="right" className="tabular">
                          {formatCurrency(award.awardValueNet, award.currency)}
                        </TableCell>
                        <TableCell align="right" className="tabular text-xs">
                          {award.bidderCount ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Card>
        </div>

        {/* --- Right rail ------------------------------------------------- */}
        <aside className="space-y-5">
          <MatchScoreCard preview={preview} />

          <Card>
            <CardHeader title="KI-Analyse" description="Inhaltliche Auswertung" />
            <CardBody>
              <PhasePlaceholder phase={3} title="Noch nicht verbunden">
                Zusammenfassung, Risikohinweise und die Extraktion von
                Anforderungen aus Leistungsbeschreibung und Anlagen entstehen in
                Phase 3. Es ist derzeit kein KI-Dienst angebunden — die
                Anwendung zeigt ausschließlich Daten, die aus der Quelle stammen.
              </PhasePlaceholder>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Kalkulation" description="Preisermittlung" />
            <CardBody>
              <PhasePlaceholder phase={4} title="Kalkulationsbereich vorbereitet">
                Stundensätze, Schichtmodelle und Deckungsbeiträge werden in
                Phase 4 direkt an dieser Ausschreibung erfasst und in die
                Angebotsvorbereitung übernommen.
              </PhasePlaceholder>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Angebotsvorbereitung"
              description="Unterlagen und Abgabe"
            />
            <CardBody>
              <PhasePlaceholder phase={4} title="Angebotsmappe vorbereitet">
                Checkliste der geforderten Nachweise, Zuordnung vorhandener
                Zertifikate und Referenzen sowie der Abgabestatus folgen in
                Phase 4.
              </PhasePlaceholder>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Herkunft" description="Nachvollziehbarkeit" />
            <CardBody>
              <DataList>
                <DataRow label="Quelle">{tender.sourceName}</DataRow>
                <DataRow label="Original-ID">
                  <span className="tabular text-xs">{tender.externalId}</span>
                </DataRow>
                <DataRow label="Fingerprint">
                  <span
                    className="tabular text-xs break-all text-text-muted"
                    title="SHA-256 über Titel, Auftraggeber, Frist und Wert — Basis der Dublettenerkennung"
                  >
                    {tender.fingerprint.slice(0, 24)}…
                  </span>
                </DataRow>
                <DataRow label="Zuletzt aktualisiert">
                  <span className="tabular text-xs">{formatDateTime(tender.updatedAt)}</span>
                </DataRow>
              </DataList>
              <p className="mt-3 text-[11px] leading-snug text-text-muted">
                Die unveränderten Originaldaten dieser Ausschreibung bleiben im
                Rohdatenbestand erhalten und können jederzeit erneut
                normalisiert werden.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
