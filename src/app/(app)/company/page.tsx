import type { Metadata } from 'next';
import { Badge, DemoBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DocumentPanel } from '@/components/documents/document-panel';
import { DataList, DataRow, PageHeader, PhasePlaceholder } from '@/components/ui/page';
import { SECTORS } from '@/config/sectors';
import { hasPermission, requirePermission } from '@/lib/auth/session';
import { DEFAULT_MATCH_PROFILE } from '@/modules/matching/preview';

export const metadata: Metadata = { title: 'Unternehmensprofil' };

export default async function CompanyPage() {
  const session = await requirePermission('company:read');
  const canManageDocuments = hasPermission(session, 'company:write');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Unternehmensprofil"
        description="Grundlage der Match-Bewertung: Branchen, Regionen, Zertifikate, Referenzen und Mitarbeiterqualifikationen."
        badges={session.organization.isDemo ? <DemoBadge /> : undefined}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Stammdaten"
              description="Aus der Organisation übernommen"
            />
            <CardBody>
              <DataList>
                <DataRow label="Unternehmen">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{session.organization.name}</span>
                    {session.organization.isDemo && <DemoBadge />}
                  </div>
                </DataRow>
                <DataRow label="Rechtsform">
                  {session.organization.legalForm ?? '—'}
                </DataRow>
                <DataRow label="Sitz">{session.organization.city ?? '—'}</DataRow>
                <DataRow label="Land">
                  {session.organization.countryCode ?? '—'}
                </DataRow>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Bewertungsprofil"
              description="Aktuell für die vorläufige Match-Bewertung verwendet"
            />
            <CardBody className="space-y-4">
              <p className="text-sm text-text-secondary">
                Solange kein Unternehmensprofil hinterlegt ist, bewertet die
                Plattform gegen ein neutrales Standardprofil: alle Startbranchen,
                Deutschland als Zielmarkt, keine Wertgrenzen. Sobald das Profil
                gepflegt ist, wird die Bewertung entsprechend geschärft.
              </p>

              <div>
                <p className="mb-2 text-xs font-medium text-text-secondary">
                  Berücksichtigte Branchen ({DEFAULT_MATCH_PROFILE.sectors.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SECTORS.map((sector) => (
                    <Badge key={sector.key} tone="brand" title={sector.description}>
                      {sector.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <DataList>
                <DataRow label="Zielländer">
                  {DEFAULT_MATCH_PROFILE.countryCodes.join(', ')}
                </DataRow>
                <DataRow label="Regionen">
                  Keine Einschränkung hinterlegt
                </DataRow>
                <DataRow label="Auftragswert">
                  Keine Unter- oder Obergrenze hinterlegt
                </DataRow>
              </DataList>
            </CardBody>
          </Card>

          <PhasePlaceholder phase={4} title="Pflege des Unternehmensprofils">
            Ab Phase 4 werden Branchen, CPV-Schwerpunkte, bediente Regionen und
            Wertgrenzen direkt hier gepflegt und wirken unmittelbar auf den Match
            Score. Die Tabelle{' '}
            <code className="tabular">company_profiles</code> und die zugehörigen
            RLS-Richtlinien stehen bereits.
          </PhasePlaceholder>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Referenzen" />
            <CardBody>
              <PhasePlaceholder phase={4} title="Referenzprojekte">
                Vergleichbare Aufträge mit Auftraggeber, Volumen und Zeitraum —
                die Grundlage für den Eignungsnachweis.
              </PhasePlaceholder>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Zertifikate" />
            <CardBody>
              <PhasePlaceholder phase={4} title="Zertifikatsverwaltung">
                DIN 77200, ISO 9001, ISO/IEC 27001 und weitere Nachweise mit
                Gültigkeitsdatum und hinterlegtem Dokument. Ab Phase 3 gleicht
                die KI-Analyse geforderte Nachweise damit ab.
              </PhasePlaceholder>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Mitarbeiterqualifikationen" />
            <CardBody>
              <PhasePlaceholder phase={4} title="Qualifikationsnachweise">
                Sachkundeprüfung nach § 34a GewO, Unterrichtungsnachweise,
                Sicherheitsüberprüfungen und Schulungen — je Standort auswertbar.
              </PhasePlaceholder>
            </CardBody>
          </Card>
        </aside>
      </div>
      <Card>
        <CardHeader
          title="Unternehmensdokumente"
          description="Eigene Zertifikate, Versicherungsnachweise und Qualitätsunterlagen. Privat abgelegt; Download nur über kurzlebige Links."
        />
        <CardBody>
          <DocumentPanel
            ownerType="organization"
            ownerId={session.organization.id}
            canWrite={canManageDocuments}
            canDelete={canManageDocuments}
            title="Eigene Nachweise"
          />
        </CardBody>
      </Card>

    </div>
  );
}
