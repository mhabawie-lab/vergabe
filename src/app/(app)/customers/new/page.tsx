import type { Metadata } from 'next';
import { ClientForm } from '@/components/references/client-form';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { LinkButton } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { getReferenceStore, isUsingDemoStore } from '@/lib/db';

export const metadata: Metadata = { title: 'Kunde anlegen' };

export default async function NewCustomerPage() {
  // Viewers never reach the form: the check runs before anything is read.
  const session = await requirePermission('clients:write');

  const store = await getReferenceStore();
  const existingClients = await store.listClientNames(session.organization.id);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kunde anlegen"
        description="Eigener Geschäftskunde Ihrer Organisation. Nicht zu verwechseln mit öffentlichen Auftraggebern aus Vergabeverfahren."
        actions={
          <LinkButton href="/customers" size="sm">
            Zurück zur Übersicht
          </LinkButton>
        }
      />

      {isUsingDemoStore() && (
        <div className="rounded-xl border border-warning/25 bg-warning-subtle px-4 py-3">
          <p className="text-sm font-semibold text-warning">
            Flüchtiger Entwicklungsspeicher
          </p>
          <p className="mt-1 text-xs text-warning">
            Supabase ist nicht konfiguriert. Erfassen Sie hier keine echten
            Kundendaten — sie gehen beim Neustart verloren.
          </p>
        </div>
      )}

      <Card>
        <CardHeader
          title="Stammdaten"
          description="Pflichtfeld ist nur der Firmenname. Fehlende Angaben bleiben leer und werden nicht ergänzt."
        />
        <CardBody>
          <ClientForm existingClients={existingClients} />
        </CardBody>
      </Card>
    </div>
  );
}
