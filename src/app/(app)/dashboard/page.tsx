import type { Metadata } from 'next';
import {
  Antenna,
  Award,
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardList,
  FileBadge,
  FileSearch,
  Gavel,
  Handshake,
  MapPin,
  Radar,
  ShieldCheck,
  Timer,
  Wallet,
} from 'lucide-react';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { TenderTable } from '@/components/tenders/tender-table';
import { Card, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { EmptyState, PageHeader, PageSection } from '@/components/ui/page';
import { DemoBadge } from '@/components/ui/badge';
import {
  getPartnerStore,
  getReferenceStore,
  getTenderRepository,
  isUsingDemoStore,
} from '@/lib/db';
import { hasPermission, requireSession } from '@/lib/auth/session';
import { formatCurrencyCompact, formatNumber } from '@/lib/utils/format';
import { DeadlineList } from '@/components/dashboard/deadline-list';
import { TOP_MATCH_THRESHOLD } from '@/modules/matching/preview';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const session = await requireSession();
  const repository = await getTenderRepository();

  const referenceStore = await getReferenceStore();
  const partnerStore = await getPartnerStore();

  const [metrics, recent, deadlines, demoOnly, referenceMetrics, partnerMetrics] =
    await Promise.all([
      repository.getDashboardMetrics(session.organization.id),
      repository.listRecent(8),
      repository.listUpcomingDeadlines(6),
      repository.isDemoOnly(),
      referenceStore.getMetrics(session.organization.id),
      // Partner data is tenant-private; the tiles only appear for members who
      // may read it and only once there is something behind them.
      hasPermission(session, 'subcontractors:read')
        ? partnerStore.getMetrics(session.organization.id)
        : null,
    ]);

  // The reference block is only worth its space once there is data behind it.
  const hasReferenceData =
    referenceMetrics.activeClients > 0 || referenceMetrics.referenceProjects > 0;

  // Same restraint for the radar: no empty row of zeroes on a dashboard that
  // already carries six tiles.
  const hasPartnerData =
    partnerMetrics !== null &&
    (partnerMetrics.qualifiedPartners > 0 ||
      partnerMetrics.companiesSeekingSubcontractors > 0 ||
      partnerMetrics.openNeeds > 0 ||
      partnerMetrics.expiringCredentials > 0 ||
      partnerMetrics.dueFollowUps > 0);

  const showDemoNotice = isUsingDemoStore() || demoOnly;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Willkommen, ${session.profile.fullName ?? session.profile.email}`}
        description={`Übersicht für ${session.organization.name}. Kennzahlen beziehen sich auf den aktuell importierten Datenbestand.`}
        badges={showDemoNotice ? <DemoBadge /> : undefined}
        actions={
          <LinkButton href="/tenders" variant="primary">
            Ausschreibungen durchsuchen
          </LinkButton>
        }
      />

      {showDemoNotice && (
        <div className="rounded-xl border border-demo-border bg-demo-subtle px-4 py-3">
          <p className="text-sm font-semibold text-demo">
            Demo-Datenbestand — keine echten Ausschreibungen
          </p>
          <p className="mt-1 text-xs text-demo">
            Es sind ausschließlich synthetische Beispieldaten geladen. Live-Quellen
            wie TED oder deutsche Vergabeportale werden ab Phase 2 angebunden.
          </p>
        </div>
      )}

      <PageSection>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <KpiCard
            label="Neue Ausschreibungen"
            value={formatNumber(metrics.newTenders)}
            hint="Veröffentlicht in den letzten 7 Tagen"
            Icon={FileSearch}
            tone="brand"
            href="/tenders"
          />
          <KpiCard
            label="Top Matches"
            value={formatNumber(metrics.topMatches)}
            hint={`Offene Ausschreibungen ab ${TOP_MATCH_THRESHOLD} % Relevanz`}
            Icon={Radar}
            tone="success"
            href="/matches"
          />
          <KpiCard
            label="Offene Fristen"
            value={formatNumber(metrics.openDeadlines)}
            hint="Angebotsfrist innerhalb von 30 Tagen"
            Icon={Timer}
            tone="warning"
            href="/deadlines"
          />
          <KpiCard
            label="Ausschreibungsvolumen"
            value={formatCurrencyCompact(metrics.openVolume)}
            hint="Geschätzter Wert aller offenen Ausschreibungen"
            Icon={Wallet}
            tone="info"
          />
          <KpiCard
            label="Neue Zuschläge"
            value={formatNumber(metrics.newAwards)}
            hint="Erfasst in den letzten 30 Tagen"
            Icon={Gavel}
            tone="neutral"
            href="/awards"
          />
          <KpiCard
            label="Beobachtete Auftraggeber"
            value={formatNumber(metrics.watchedAuthorities)}
            hint="Im Auftraggeber-Radar hinterlegt"
            Icon={Building2}
            tone="neutral"
            href="/authorities"
          />
        </div>
      </PageSection>

      {hasReferenceData && (
        <PageSection>
          <h2 className="text-sm font-semibold text-text-primary">Eigene Daten</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Aktive Kunden"
              value={formatNumber(referenceMetrics.activeClients)}
              hint="Eigene Geschäftskunden mit Status aktiv"
              Icon={Briefcase}
              tone="brand"
              href="/customers"
            />
            <KpiCard
              label="Referenzobjekte"
              value={formatNumber(referenceMetrics.referenceProjects)}
              hint="Erfasste Kundenprojekte"
              Icon={Award}
              tone="neutral"
              href="/references"
            />
            <KpiCard
              label="Abgedeckte Standorte"
              value={formatNumber(referenceMetrics.coveredLocations)}
              hint="Unterschiedliche Orte in den Referenzen"
              Icon={MapPin}
              tone="info"
              href="/references"
            />
            <KpiCard
              label="Bestätigte Leistungsarten"
              value={formatNumber(referenceMetrics.confirmedServiceCategories)}
              hint="Nur bestätigte Angaben zählen als Nachweis"
              Icon={ShieldCheck}
              tone="success"
              href="/references?referenceStatus=confirmed"
            />
          </div>
        </PageSection>
      )}

      {hasPartnerData && partnerMetrics !== null && (
        <PageSection>
          <h2 className="text-sm font-semibold text-text-primary">
            Subunternehmer-Radar
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              label="Qualifizierte Partner"
              value={formatNumber(partnerMetrics.qualifiedPartners)}
              hint="Status qualifiziert oder bevorzugt, nicht gesperrt"
              Icon={Handshake}
              tone="brand"
              href="/subcontractors?statuses=qualified"
            />
            <KpiCard
              label="Aktuell verfügbar"
              value={formatNumber(partnerMetrics.availableNow)}
              hint="Mit bestätigter, nicht veralteter Verfügbarkeit"
              Icon={CalendarClock}
              tone="success"
              href="/subcontractors"
            />
            <KpiCard
              label="Suchen Subunternehmer"
              value={formatNumber(partnerMetrics.companiesSeekingSubcontractors)}
              hint="Mit offenem Bedarfssignal"
              Icon={Antenna}
              tone="info"
              href="/subcontractors/signals?demandOnly=true"
            />
            <KpiCard
              label="Fällige Wiedervorlagen"
              value={formatNumber(partnerMetrics.dueFollowUps)}
              hint="Heute oder überfällig"
              Icon={Timer}
              tone="warning"
              href="/subcontractors/activities"
            />
            <KpiCard
              label="Ablaufende Nachweise"
              value={formatNumber(partnerMetrics.expiringCredentials)}
              hint="In den nächsten 90 Tagen oder bereits abgelaufen"
              Icon={FileBadge}
              tone="warning"
              href="/subcontractors/credentials"
            />
            <KpiCard
              label="Offene eigene Bedarfe"
              value={formatNumber(partnerMetrics.openNeeds)}
              hint="Aktiv oder in Prüfung"
              Icon={ClipboardList}
              tone="neutral"
              href="/subcontractors/needs"
            />
          </div>
        </PageSection>
      )}

      {/* Full width: the table carries eight columns and must not be
          squeezed into a side-by-side layout. */}
      <Card>
        <CardHeader
          title="Zuletzt veröffentlicht"
          description="Die neuesten Ausschreibungen im Datenbestand"
          action={
            <LinkButton href="/tenders" size="sm">
              Alle anzeigen
            </LinkButton>
          }
        />
        {recent.length === 0 ? (
          <EmptyState
            title="Noch keine Ausschreibungen importiert"
            description="Führen Sie den Import aus (npm run ingest:demo) oder aktivieren Sie eine Datenquelle."
            action={
              <LinkButton href="/sources" size="sm">
                Datenquellen öffnen
              </LinkButton>
            }
          />
        ) : (
          <TenderTable tenders={recent} />
        )}
      </Card>

      <Card>
        <CardHeader
          title="Nächste Fristen"
          description="Angebotsfristen mit dem geringsten Vorlauf"
          action={
            <LinkButton href="/deadlines" size="sm">
              Alle Fristen
            </LinkButton>
          }
        />
        <DeadlineList tenders={deadlines} layout="grid" />
      </Card>
    </div>
  );
}
