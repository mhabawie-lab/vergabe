import type { Metadata } from 'next';
import {
  Building2,
  FileSearch,
  Gavel,
  Radar,
  Timer,
  Wallet,
} from 'lucide-react';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { TenderTable } from '@/components/tenders/tender-table';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { EmptyState, PageHeader, PageSection } from '@/components/ui/page';
import { DemoBadge } from '@/components/ui/badge';
import { getTenderRepository, isUsingDemoStore } from '@/lib/db';
import { requireSession } from '@/lib/auth/session';
import { formatCurrencyCompact, formatNumber } from '@/lib/utils/format';
import { DeadlineList } from '@/components/dashboard/deadline-list';
import { TOP_MATCH_THRESHOLD } from '@/modules/matching/preview';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const session = await requireSession();
  const repository = await getTenderRepository();

  const [metrics, recent, deadlines, demoOnly] = await Promise.all([
    repository.getDashboardMetrics(session.organization.id),
    repository.listRecent(8),
    repository.listUpcomingDeadlines(6),
    repository.isDemoOnly(),
  ]);

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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
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
            /* The match column lives on its own screen; omitting it here
               keeps the table readable next to the deadline rail. */
            <TenderTable tenders={recent} showMatch={false} />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Nächste Fristen"
            description="Angebotsfristen mit dem geringsten Vorlauf"
            action={
              <LinkButton href="/deadlines" size="sm">
                Alle
              </LinkButton>
            }
          />
          <CardBody className="p-0">
            <DeadlineList tenders={deadlines} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
