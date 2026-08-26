import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { PartnerForm } from '@/components/partners/partner-form';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: 'Partner bearbeiten' };

export default async function EditPartnerPage({ params }: PageProps) {
  const session = await requirePermission('subcontractors:write');
  const { id } = await params;

  const store = await getPartnerStore();
  const [company, existing] = await Promise.all([
    store.findCompanyRecord(session.organization.id, id),
    store.listDuplicateCandidates(session.organization.id),
  ]);

  // A record of another organisation is simply not found — the same answer a
  // non-existent id gets, so nothing can be probed.
  if (company === null) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Partner bearbeiten"
        description={company.legalName}
        actions={
          <LinkButton href={`/subcontractors/${company.id}`} size="sm">
            Zurück zum Partner
          </LinkButton>
        }
      />

      <Card>
        <CardHeader
          title="Stammdaten"
          description="Änderungen werden protokolliert — mit den geänderten Feldern, nicht mit deren Inhalt."
        />
        <CardBody>
          <PartnerForm
            existing={existing}
            company={{
              id: company.id,
              legalName: company.legalName,
              tradeName: company.tradeName,
              relationshipDirection: company.relationshipDirection,
              partnerLevel: company.partnerLevel,
              status: company.status,
              verificationStatus: company.verificationStatus,
              country: company.country,
              region: company.region,
              city: company.city,
              postalCode: company.postalCode,
              address: company.address,
              website: company.website,
              email: company.email,
              phone: company.phone,
              registryName: company.registryName,
              registryNumber: company.registryNumber,
              vatId: company.vatId,
              lei: company.lei,
              staffModel: company.staffModel,
              furtherSubcontractingStatus: company.furtherSubcontractingStatus,
              datacenterExperienceStatus: company.datacenterExperienceStatus,
              isPreferred: company.isPreferred,
              isBlocked: company.isBlocked,
              blockedReason: company.blockedReason,
              internalRating: company.internalRating,
              sourceType: company.sourceType,
              sourceName: company.sourceName,
              sourceUrl: company.sourceUrl,
              internalNotes: company.internalNotes,
              lastContactAt: company.lastContactAt,
              nextFollowUpAt: company.nextFollowUpAt,
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
