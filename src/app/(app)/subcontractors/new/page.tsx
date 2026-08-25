import type { Metadata } from 'next';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { PartnerForm } from '@/components/partners/partner-form';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore, isUsingDemoStore } from '@/lib/db';

export const metadata: Metadata = { title: 'Partner anlegen' };

export default async function NewPartnerPage() {
  // Viewers never reach the form: the check runs before anything is read.
  const session = await requirePermission('subcontractors:write');

  const store = await getPartnerStore();
  const existing = await store.listDuplicateCandidates(session.organization.id);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Partner anlegen"
        description="Ein Unternehmen, das für uns arbeiten kann, das selbst Subunternehmer sucht — oder beides."
        actions={
          <LinkButton href="/subcontractors" size="sm">
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
            Supabase ist nicht konfiguriert. Erfassen Sie hier keine echten Firmendaten —
            sie gehen beim Neustart verloren.
          </p>
        </div>
      )}

      <Card>
        <CardHeader
          title="Stammdaten"
          description="Pflichtfeld ist nur der Firmenname. Fehlende Angaben bleiben leer und werden nicht ergänzt."
        />
        <CardBody>
          <PartnerForm existing={existing} />
        </CardBody>
      </Card>
    </div>
  );
}
