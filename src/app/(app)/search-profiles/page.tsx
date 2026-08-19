import type { Metadata } from 'next';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, PageHeader, PhasePlaceholder } from '@/components/ui/page';
import { requirePermission } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Suchprofile' };

export default async function SearchProfilesPage() {
  await requirePermission('tenders:read');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Suchprofile"
        description="Gespeicherte Suchen, die neue passende Ausschreibungen automatisch melden."
      />

      <Card>
        <CardHeader
          title="Gespeicherte Profile"
          description="Noch keine Profile angelegt"
        />
        <EmptyState
          title="Speichern von Suchprofilen folgt in Phase 2"
          description="Die Ausschreibungssuche ist bereits vollständig nutzbar. Filter werden in der URL geführt und lassen sich als Lesezeichen sichern, bis die Profilverwaltung verfügbar ist."
          action={
            <LinkButton href="/tenders" variant="primary" size="sm">
              Zur Ausschreibungssuche
            </LinkButton>
          }
        />
      </Card>

      <Card>
        <CardHeader
          title="Was in Phase 2 entsteht"
          description="Der Datenbestand dafür ist bereits angelegt"
        />
        <CardBody className="space-y-4">
          <ul className="space-y-2 text-sm text-text-secondary">
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              Benannte Suchprofile je Organisation, gemeinsam nutzbar im Team.
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              Benachrichtigung bei neuen Treffern, in wählbarem Intervall.
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              Favoriten und Wiedervorlagen direkt aus der Trefferliste.
            </li>
          </ul>

          <PhasePlaceholder phase={2} title="Technischer Stand">
            Die Tabelle <code className="tabular">search_profiles</code> speichert
            Filter als JSON, damit eine neue Filterdimension keine Migration
            erfordert. Row Level Security beschränkt Zugriff und Änderung bereits
            heute auf die eigene Organisation.
          </PhasePlaceholder>
        </CardBody>
      </Card>
    </div>
  );
}
