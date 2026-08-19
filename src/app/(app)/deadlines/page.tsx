import type { Metadata } from 'next';
import { TenderTable } from '@/components/tenders/tender-table';
import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader, PhasePlaceholder } from '@/components/ui/page';
import { requirePermission } from '@/lib/auth/session';
import { getTenderRepository } from '@/lib/db';
import { daysUntil, formatNumber } from '@/lib/utils/format';
import type { TenderListItem } from '@/types/tender';

export const metadata: Metadata = { title: 'Fristen' };

interface DeadlineBucket {
  key: string;
  title: string;
  description: string;
  tenders: TenderListItem[];
}

/** Groups by remaining days so the most urgent work sits at the top. */
function bucketByUrgency(tenders: readonly TenderListItem[]): DeadlineBucket[] {
  const within7: TenderListItem[] = [];
  const within30: TenderListItem[] = [];
  const later: TenderListItem[] = [];

  for (const tender of tenders) {
    const days = daysUntil(tender.submissionDeadline);
    if (days === null) continue;
    if (days <= 7) within7.push(tender);
    else if (days <= 30) within30.push(tender);
    else later.push(tender);
  }

  return [
    {
      key: 'urgent',
      title: 'Kritisch — innerhalb von 7 Tagen',
      description: 'Angebotsabgabe steht unmittelbar bevor.',
      tenders: within7,
    },
    {
      key: 'soon',
      title: 'Demnächst — innerhalb von 30 Tagen',
      description: 'Ausreichend Vorlauf für die Angebotsbearbeitung.',
      tenders: within30,
    },
    {
      key: 'later',
      title: 'Später',
      description: 'Angebotsfrist liegt mehr als 30 Tage in der Zukunft.',
      tenders: later,
    },
  ];
}

export default async function DeadlinesPage() {
  await requirePermission('tenders:read');

  const repository = await getTenderRepository();
  const tenders = await repository.listUpcomingDeadlines(200);
  const buckets = bucketByUrgency(tenders);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fristen"
        description="Alle laufenden Ausschreibungen nach Dringlichkeit der Angebotsfrist."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {buckets.map((bucket) => (
          <div
            key={bucket.key}
            className="rounded-xl border border-border-subtle bg-surface-raised p-4 shadow-card"
          >
            <p className="text-xs font-medium text-text-secondary">{bucket.title}</p>
            <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-text-primary">
              {formatNumber(bucket.tenders.length)}
            </p>
          </div>
        ))}
      </div>

      {buckets.map((bucket) => (
        <Card key={bucket.key}>
          <CardHeader title={bucket.title} description={bucket.description} />
          <TenderTable
            tenders={bucket.tenders}
            emptyMessage="Keine Ausschreibungen in diesem Zeitfenster."
          />
        </Card>
      ))}

      <PhasePlaceholder phase={2} title="Erinnerungen und eigene Termine">
        Ab Phase 2 lassen sich eigene Wiedervorlagen setzen, Fristen einem
        Bearbeiter zuweisen und Benachrichtigungen vor Ablauf versenden.
      </PhasePlaceholder>
    </div>
  );
}
