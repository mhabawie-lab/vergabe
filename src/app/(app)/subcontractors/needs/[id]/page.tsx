import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DataList, DataRow, PageHeader } from '@/components/ui/page';
import { MatchTable } from '@/components/partners/match-table';
import { hasPermission, requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { formatDate, formatNumber } from '@/lib/utils/format';
import { MATCH_SCORE_VERSION, describeWeights } from '@/modules/partners/matching';
import {
  CREDENTIAL_TYPE_LABELS,
  FURTHER_SUBCONTRACTING_LABELS,
  NEED_STATUS_LABELS,
  PARTNER_SERVICE_CATEGORY_LABELS,
  SHIFT_MODEL_LABELS,
} from '@/types/partner';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return { title: `Bedarf ${(await params).id.slice(0, 8)}` };
}

export default async function NeedDetailPage({ params }: PageProps) {
  const session = await requirePermission('subcontractors:read');
  const canEdit = hasPermission(session, 'subcontractors:write');

  const { id } = await params;
  const store = await getPartnerStore();
  const need = await store.findNeedById(session.organization.id, id);

  if (need === null) notFound();

  const matches = await store.listMatches(session.organization.id, id);

  return (
    <div className="space-y-5">
      <PageHeader
        title={need.title}
        description={`Benötigt: ${PARTNER_SERVICE_CATEGORY_LABELS[need.serviceCategory]}`}
        badges={
          <Badge tone={need.status === 'active' ? 'success' : 'neutral'}>
            {NEED_STATUS_LABELS[need.status]}
          </Badge>
        }
        actions={
          <LinkButton href="/subcontractors/needs" size="sm">
            Zurück zur Übersicht
          </LinkButton>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Passende Partner"
              description="Bewertet nach der dokumentierten Gewichtung. Der Score ist ein Hilfsmittel für Ihre Entscheidung, keine automatische Vergabe."
            />
            <MatchTable needId={need.id} matches={matches} canEdit={canEdit} />
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Anforderungen" />
            <CardBody>
              <DataList>
                <DataRow label="Leistung">
                  {PARTNER_SERVICE_CATEGORY_LABELS[need.serviceCategory]}
                </DataRow>
                <DataRow label="Ort">
                  {[need.city, need.region, need.country]
                    .filter((value) => value !== null)
                    .join(', ') || '—'}
                </DataRow>
                <DataRow label="Zeitraum">
                  <span className="tabular">
                    {formatDate(need.startDate)} – {formatDate(need.endDate)}
                  </span>
                </DataRow>
                <DataRow label="Benötigte Mitarbeiter">
                  <span className="tabular">
                    {need.requiredStaff === null ? '—' : formatNumber(need.requiredStaff)}
                  </span>
                </DataRow>
                <DataRow label="Schichtmodell">
                  {SHIFT_MODEL_LABELS[need.shiftModel]}
                </DataRow>
                <DataRow label="Betriebszeiten">
                  {[
                    need.aroundTheClock ? '24/7' : null,
                    need.nightWork ? 'Nachtarbeit' : null,
                    need.weekendWork ? 'Wochenende' : null,
                  ]
                    .filter((value) => value !== null)
                    .join(', ') || 'Keine besonderen Anforderungen'}
                </DataRow>
                <DataRow label="Weitere Untervergabe">
                  {FURTHER_SUBCONTRACTING_LABELS[need.furtherSubcontractingAllowed]}
                </DataRow>
                <DataRow label="Erforderliche Nachweise">
                  {need.requiredCredentials.length === 0
                    ? '—'
                    : need.requiredCredentials
                        .map((type) => CREDENTIAL_TYPE_LABELS[type])
                        .join(', ')}
                </DataRow>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Gewichtung"
              description={`Regelstand ${MATCH_SCORE_VERSION}`}
            />
            <CardBody>
              <ul className="space-y-1.5 text-xs">
                {describeWeights().map((entry) => (
                  <li key={entry.label} className="flex items-center justify-between gap-2">
                    <span className="text-text-secondary">{entry.label}</span>
                    <span className="tabular font-medium text-text-primary">
                      {entry.weight} %
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-snug text-text-muted">
                Gesperrte Partner werden ausgeschlossen. Unbestätigte Leistungen und
                abgelaufene Nachweise zählen nicht. Fehlende Angaben werden ausgewiesen und
                nie als erfüllt gewertet.
              </p>
            </CardBody>
          </Card>

          {need.internalNote !== null && (
            <Card>
              <CardHeader title="Interne Notiz" />
              <CardBody>
                <p className="text-sm whitespace-pre-line text-text-primary">
                  {need.internalNote}
                </p>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
