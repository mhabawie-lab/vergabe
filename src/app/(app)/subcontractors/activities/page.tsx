import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/page';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableEmpty,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore } from '@/lib/db';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { ACTIVITY_TYPE_LABELS } from '@/types/partner';

export const metadata: Metadata = { title: 'Aktivitäten & Wiedervorlagen' };

export default async function ActivitiesPage() {
  const session = await requirePermission('subcontractors:read');

  const store = await getPartnerStore();
  const today = new Date().toISOString().slice(0, 10);

  const [dueFollowUps, activities] = await Promise.all([
    store.listDueFollowUps(session.organization.id, today),
    store.listActivities(session.organization.id, { limit: 100 }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Aktivitäten & Wiedervorlagen"
        description="Was zuletzt mit welchem Unternehmen besprochen wurde — und was ansteht."
      />

      <Card>
        <CardHeader
          title="Fällige Wiedervorlagen"
          description={`Stand ${formatDate(today)}`}
        />
        <TableContainer>
          <Table className="min-w-[48rem]">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TableHeaderCell>Fällig am</TableHeaderCell>
                <TableHeaderCell>Unternehmen</TableHeaderCell>
                <TableHeaderCell>Art</TableHeaderCell>
                <TableHeaderCell>Nächste Aktion</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dueFollowUps.length === 0 ? (
                <TableEmpty colSpan={4}>Keine fälligen Wiedervorlagen.</TableEmpty>
              ) : (
                dueFollowUps.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="tabular text-xs whitespace-nowrap">
                      <Badge tone="warning">{formatDate(activity.followUpAt)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/subcontractors/${activity.partnerCompanyId}?tab=activities`}
                        className="text-sm font-medium text-text-primary hover:text-accent hover:underline"
                      >
                        {activity.companyName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">
                      {ACTIVITY_TYPE_LABELS[activity.activityType]}
                    </TableCell>
                    <TableCell className="max-w-[20rem] text-xs">
                      {activity.nextAction ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Card>
        <CardHeader title="Letzte Aktivitäten" description="Die 100 jüngsten Einträge" />
        {activities.length === 0 ? (
          <EmptyState
            title="Noch keine Aktivitäten"
            description="Telefonate, Besprechungen und angeforderte Unterlagen werden am jeweiligen Unternehmen erfasst."
          />
        ) : (
          <TableContainer>
            <Table className="min-w-[52rem]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeaderCell>Zeitpunkt</TableHeaderCell>
                  <TableHeaderCell>Unternehmen</TableHeaderCell>
                  <TableHeaderCell>Art</TableHeaderCell>
                  <TableHeaderCell>Zusammenfassung</TableHeaderCell>
                  <TableHeaderCell>Nächste Aktion</TableHeaderCell>
                  <TableHeaderCell>Wiedervorlage</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activities.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="tabular text-xs whitespace-nowrap">
                      {formatDateTime(activity.occurredAt)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/subcontractors/${activity.partnerCompanyId}?tab=activities`}
                        className="text-xs font-medium text-text-primary hover:text-accent hover:underline"
                      >
                        {activity.companyName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">
                      {ACTIVITY_TYPE_LABELS[activity.activityType]}
                    </TableCell>
                    <TableCell className="max-w-[24rem] text-xs">
                      {activity.summary ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[16rem] text-xs">
                      {activity.nextAction ?? '—'}
                    </TableCell>
                    <TableCell className="tabular text-xs whitespace-nowrap">
                      {formatDate(activity.followUpAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </div>
  );
}
