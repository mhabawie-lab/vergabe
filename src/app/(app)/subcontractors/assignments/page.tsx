import type { Metadata } from 'next';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { ChainTree } from '@/components/partners/chain-tree';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { MAX_CHAIN_DEPTH } from '@/types/partner';

export const metadata: Metadata = { title: 'Projektzuordnungen' };

export default async function AssignmentsPage() {
  const session = await requirePermission('subcontractors:read');

  const store = await getPartnerStore();
  const chain = await store.listAssignments(session.organization.id, {});

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projektzuordnungen"
        description="Welcher Partner arbeitet auf welchem Projekt — und wer beauftragt wen."
      />

      <Card>
        <CardHeader
          title="Nachunternehmerkette"
          description={`Ebene 1 wird von uns beauftragt, jede weitere von der darüberliegenden. Höchstens ${MAX_CHAIN_DEPTH} Ebenen.`}
        />
        <CardBody className="space-y-3">
          <p className="text-xs leading-snug text-text-muted">
            Ein inzwischen gesperrter Partner bleibt in einer bestehenden Kette sichtbar.
            Er war dort im Einsatz; diesen Umstand nachträglich verschwinden zu lassen
            würde die Kette wertlos machen.
          </p>
          <ChainTree
            nodes={chain}
            emptyMessage="Noch keine Projektzuordnungen erfasst."
          />
        </CardBody>
      </Card>
    </div>
  );
}
