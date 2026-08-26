import type { Metadata } from 'next';
import { CheckCircle2, CircleSlash, TriangleAlert, XCircle } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { DataList, DataRow, PageHeader } from '@/components/ui/page';
import { requirePermission } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/utils/format';
import {
  collectInfrastructureStatus,
  type CheckState,
} from '@/modules/infrastructure/status';

export const metadata: Metadata = { title: 'Infrastruktur' };
export const dynamic = 'force-dynamic';

const STATE_TONE: Record<CheckState, BadgeTone> = {
  ok: 'success',
  warning: 'warning',
  failed: 'danger',
  skipped: 'neutral',
};

const STATE_LABEL: Record<CheckState, string> = {
  ok: 'In Ordnung',
  warning: 'Hinweis',
  failed: 'Fehlgeschlagen',
  skipped: 'Übersprungen',
};

const STATE_ICON = {
  ok: CheckCircle2,
  warning: TriangleAlert,
  failed: XCircle,
  skipped: CircleSlash,
} as const;

/**
 * Technical status of the deployment.
 *
 * Everything here is deliberately non-secret: presence, reachability, counts,
 * a host name. No key, no full connection string, no URL carrying a token,
 * and no stack trace — an operator needs to know whether it works, not what
 * it is configured with.
 */
export default async function InfrastructurePage() {
  // Administrative information, so it sits behind the members permission
  // rather than being visible to every signed-in user.
  await requirePermission('members:read');

  const status = await collectInfrastructureStatus();
  const failing = status.checks.filter((check) => check.state === 'failed');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Infrastruktur"
        description="Technischer Status dieser Installation. Es werden ausschließlich nicht geheime Angaben angezeigt."
        badges={
          <>
            <Badge tone={status.backend === 'supabase' ? 'success' : 'warning'}>
              Backend: {status.backend}
            </Badge>
            <Badge tone={status.environment === 'production' ? 'brand' : 'neutral'}>
              {status.environment === 'production' ? 'Produktion' : 'Entwicklung'}
            </Badge>
          </>
        }
      />

      {status.backend === 'memory' && (
        <div className="rounded-xl border border-warning/25 bg-warning-subtle px-4 py-3">
          <p className="text-sm font-semibold text-warning">
            Flüchtiger Entwicklungsspeicher aktiv
          </p>
          <p className="mt-1 text-xs text-warning">
            {status.backendReason}. Daten gehen beim Neustart verloren. In dieser
            Betriebsart gehören keine echten Kunden-, Partner- oder Dokumentdaten in die
            Anwendung.
          </p>
        </div>
      )}

      {failing.length > 0 && (
        <div className="rounded-xl border border-danger/25 bg-danger-subtle px-4 py-3">
          <p className="text-sm font-semibold text-danger">
            {failing.length} Prüfung{failing.length === 1 ? '' : 'en'} fehlgeschlagen
          </p>
          <p className="mt-1 text-xs text-danger">
            Die Anwendung weicht nicht auf einen Ersatzspeicher aus. Bis das behoben ist,
            schlagen Datenzugriffe mit einer Meldung fehl.
          </p>
        </div>
      )}

      {status.deprecations.length > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning-subtle px-4 py-3">
          <p className="text-sm font-semibold text-warning">Veraltete Variablennamen</p>
          <ul className="mt-1 space-y-1 text-xs text-warning">
            {status.deprecations.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader
            title="Prüfungen"
            description={`Zuletzt ausgeführt: ${formatDateTime(status.checkedAt)}`}
          />
          <CardBody>
            <ul className="space-y-2.5">
              {status.checks.map((check) => {
                const Icon = STATE_ICON[check.state];
                return (
                  <li
                    key={check.label}
                    className="flex items-start gap-2.5 rounded-lg border border-border-subtle p-3"
                  >
                    <Icon
                      className={
                        check.state === 'ok'
                          ? 'mt-0.5 size-4 shrink-0 text-success'
                          : check.state === 'failed'
                            ? 'mt-0.5 size-4 shrink-0 text-danger'
                            : check.state === 'warning'
                              ? 'mt-0.5 size-4 shrink-0 text-warning'
                              : 'mt-0.5 size-4 shrink-0 text-text-muted'
                      }
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">
                          {check.label}
                        </span>
                        <Badge tone={STATE_TONE[check.state]}>
                          {STATE_LABEL[check.state]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-snug text-text-secondary">
                        {check.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Konfiguration" />
            <CardBody>
              <DataList>
                <DataRow label="Datenbackend">{status.backend}</DataRow>
                <DataRow label="Herkunft der Wahl">
                  {status.backendExplicit ? 'DATA_BACKEND gesetzt' : 'abgeleitet'}
                </DataRow>
                <DataRow label="Supabase konfiguriert">
                  {status.supabaseConfigured ? 'Ja' : 'Nein'}
                </DataRow>
                <DataRow label="Projekt-Host">{status.supabaseHost ?? '—'}</DataRow>
                <DataRow label="Projektreferenz">{status.projectRef ?? '—'}</DataRow>
                <DataRow label="Privilegierter Schlüssel">
                  {status.serviceKeyConfigured ? 'konfiguriert' : 'nicht konfiguriert'}
                </DataRow>
                <DataRow label="Signierte Links gültig">
                  <span className="tabular">{status.signedUrlTtlSeconds} s</span>
                </DataRow>
              </DataList>
              <p className="mt-3 text-[11px] leading-snug text-text-muted">
                Schlüssel, vollständige URLs und Verbindungszeichenfolgen werden hier
                bewusst nicht angezeigt.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Erwartete Buckets"
              description="Alle privat, ohne öffentliche Datei-URLs"
            />
            <CardBody>
              <ul className="space-y-1 text-xs">
                {status.expectedBuckets.map((bucket) => (
                  <li key={bucket} className="tabular text-text-secondary">
                    {bucket}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-snug text-text-muted">
                {status.documentCapabilities.note}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Offene Infrastrukturpunkte" />
            <CardBody>
              <ul className="space-y-1.5 text-xs text-text-secondary">
                <li>Kein Malware-Scanner angebunden.</li>
                <li>Kein Scheduler für Ablaufhinweise.</li>
                <li>RLS nicht automatisiert gegen eine echte Instanz geprüft.</li>
              </ul>
              <p className="mt-3 text-[11px] leading-snug text-text-muted">
                Vollständig in <code className="tabular">PROJECT_PLAN.md</code> § 16.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
