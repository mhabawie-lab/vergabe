import type { Metadata } from 'next';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { NeedForm } from '@/components/partners/need-form';
import { requirePermission } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Bedarf anlegen' };

export default async function NewNeedPage() {
  await requirePermission('subcontractors:write');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bedarf anlegen"
        description="Für welches eigene Projekt wird ein Partner benötigt? Dieser Eintrag ist rein intern."
        actions={
          <LinkButton href="/subcontractors/needs" size="sm">
            Zurück zur Übersicht
          </LinkButton>
        }
      />

      <Card>
        <CardHeader
          title="Anforderungen"
          description="Je genauer die Angaben, desto aussagekräftiger die Bewertung. Fehlende Angaben werden im Match ausdrücklich als fehlend ausgewiesen — sie zählen nie als erfüllt."
        />
        <CardBody>
          <NeedForm />
        </CardBody>
      </Card>
    </div>
  );
}
