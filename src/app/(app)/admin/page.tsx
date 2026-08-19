import type { Metadata } from 'next';
import { Badge, DemoBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
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
import {
  PERMISSIONS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  ROLES,
} from '@/config/roles';
import { requirePermission } from '@/lib/auth/session';
import { isUsingDemoStore } from '@/lib/db';
import { formatDate } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Administration' };

export default async function AdminPage() {
  const session = await requirePermission('members:read');
  const demoEnvironment = isUsingDemoStore();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Administration"
        description="Organisation, Rollen und Berechtigungen."
        badges={demoEnvironment ? <DemoBadge /> : undefined}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Rollen- und Rechtematrix"
              description="Rollen sind ein benanntes Bündel von Berechtigungen. Sie werden serverseitig geprüft und zusätzlich über Row Level Security in der Datenbank durchgesetzt."
            />
            <TableContainer>
              <Table className="min-w-[46rem]">
                <TableHead>
                  <TableRow className="hover:bg-transparent">
                    <TableHeaderCell className="min-w-[14rem]">
                      Berechtigung
                    </TableHeaderCell>
                    {ROLES.map((role) => (
                      <TableHeaderCell key={role} align="center">
                        {ROLE_LABELS[role]}
                      </TableHeaderCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {PERMISSIONS.map((permission) => (
                    <TableRow key={permission}>
                      <TableCell className="tabular text-xs">{permission}</TableCell>
                      {ROLES.map((role) => (
                        <TableCell key={role} align="center">
                          {ROLE_PERMISSIONS[role].includes(permission) ? (
                            <span
                              className="text-success"
                              title="Berechtigung vorhanden"
                              aria-label="Berechtigung vorhanden"
                            >
                              ●
                            </span>
                          ) : (
                            <span
                              className="text-text-muted opacity-40"
                              title="Keine Berechtigung"
                              aria-label="Keine Berechtigung"
                            >
                              ○
                            </span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>

          <Card>
            <CardHeader title="Rollen" description="Zweck der einzelnen Rollen" />
            <CardBody>
              <ul className="space-y-3">
                {ROLES.map((role) => (
                  <li key={role} className="rounded-lg border border-border-subtle p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {ROLE_LABELS[role]}
                      </span>
                      {session.role === role && <Badge tone="brand">Ihre Rolle</Badge>}
                      <Badge tone="neutral">
                        {ROLE_PERMISSIONS[role].length} Berechtigungen
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      {ROLE_DESCRIPTIONS[role]}
                    </p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <PhasePlaceholder phase={6} title="Benutzerverwaltung">
            Einladen von Mitgliedern, Zuweisen und Ändern von Rollen sowie die
            Einsicht in das Audit-Log folgen in Phase 6. Das Datenmodell
            (organizations, organization_members, audit_log) und die
            RLS-Richtlinien stehen bereits.
          </PhasePlaceholder>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Organisation" />
            <CardBody>
              <DataList>
                <DataRow label="Name">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{session.organization.name}</span>
                    {session.organization.isDemo && <DemoBadge />}
                  </div>
                </DataRow>
                <DataRow label="Kennung">
                  <span className="tabular text-xs">{session.organization.slug}</span>
                </DataRow>
                <DataRow label="Rechtsform">
                  {session.organization.legalForm ?? '—'}
                </DataRow>
                <DataRow label="Sitz">{session.organization.city ?? '—'}</DataRow>
                <DataRow label="Angelegt am">
                  <span className="tabular text-xs">
                    {formatDate(session.organization.createdAt)}
                  </span>
                </DataRow>
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Angemeldeter Benutzer" />
            <CardBody>
              <DataList>
                <DataRow label="Name">{session.profile.fullName ?? '—'}</DataRow>
                <DataRow label="E-Mail">
                  <span className="text-xs break-all">{session.profile.email}</span>
                </DataRow>
                <DataRow label="Funktion">{session.profile.jobTitle ?? '—'}</DataRow>
                <DataRow label="Rolle">{ROLE_LABELS[session.role]}</DataRow>
                <DataRow label="Plattform-Admin">
                  {session.profile.isPlatformAdmin ? 'Ja' : 'Nein'}
                </DataRow>
              </DataList>
            </CardBody>
          </Card>

          {demoEnvironment && (
            <Card>
              <CardHeader title="Betriebsmodus" />
              <CardBody>
                <p className="text-xs leading-relaxed text-text-secondary">
                  Supabase ist nicht konfiguriert. Die Anwendung nutzt einen
                  prozessinternen DEMO-Speicher und eine feste Demo-Session.
                  Sobald die Umgebungsvariablen gesetzt sind, greifen
                  Authentifizierung, Rollen und Row Level Security der Datenbank.
                </p>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
