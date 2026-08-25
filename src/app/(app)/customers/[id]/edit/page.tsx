import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ClientForm } from '@/components/references/client-form';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { LinkButton } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { getReferenceStore } from '@/lib/db';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: 'Kunde bearbeiten' };

export default async function EditCustomerPage({ params }: PageProps) {
  const session = await requirePermission('clients:write');
  const { id } = await params;

  const store = await getReferenceStore();
  const [client, existingClients] = await Promise.all([
    store.findClientRecord(session.organization.id, id),
    store.listClientNames(session.organization.id),
  ]);

  // A record of another organisation is simply not found — the same answer a
  // non-existent id gets, so nothing can be probed.
  if (client === null) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kunde bearbeiten"
        description={client.name}
        actions={
          <LinkButton href={`/customers/${client.id}`} size="sm">
            Zurück zum Kunden
          </LinkButton>
        }
      />

      <Card>
        <CardHeader
          title="Stammdaten"
          description="Änderungen werden protokolliert — mit den geänderten Feldern, nicht mit deren Inhalt."
        />
        <CardBody>
          <ClientForm
            client={{
              id: client.id,
              name: client.name,
              country: client.country,
              website: client.website,
              notes: client.notes,
              isActive: client.isActive,
            }}
            existingClients={existingClients}
          />
        </CardBody>
      </Card>
    </div>
  );
}
