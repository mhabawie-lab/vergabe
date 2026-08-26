import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
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
import { formatDate } from '@/lib/utils/format';
import {
  bucketByExpiry,
  daysUntil,
  qualificationAsCredential,
} from '@/modules/partners/credentials';
import { CREDENTIAL_TYPE_LABELS } from '@/types/partner';

export const metadata: Metadata = { title: 'Nachweise' };

/** How far ahead the monitor looks. Anything beyond is not yet interesting. */
const HORIZON_DAYS = 90;

export default async function CredentialsPage() {
  const session = await requirePermission('subcontractors:read');

  const store = await getPartnerStore();
  const entries = await store.listExpiringCredentials(
    session.organization.id,
    HORIZON_DAYS,
  );

  const buckets = bucketByExpiry(
    entries.map((entry) => ({
      ...qualificationAsCredential(entry.qualification),
      // Kept so the table can name the company without a second lookup.
      __entry: entry,
    })),
  );

  const sections = [
    { key: 'expired', title: 'Bereits abgelaufen', rows: buckets.expired, tone: 'danger' as const },
    { key: 'within30', title: 'Läuft in 30 Tagen ab', rows: buckets.within30, tone: 'danger' as const },
    { key: 'within60', title: 'Läuft in 60 Tagen ab', rows: buckets.within60, tone: 'warning' as const },
    { key: 'within90', title: 'Läuft in 90 Tagen ab', rows: buckets.within90, tone: 'warning' as const },
    { key: 'pending', title: 'Ungeprüfte Dokumente', rows: buckets.pendingReview, tone: 'info' as const },
  ];

  const total = sections.reduce((sum, section) => sum + section.rows.length, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nachweise"
        description="Welche Nachweise ablaufen, abgelaufen sind oder noch niemand geprüft hat."
      />

      <div className="rounded-xl border border-border-subtle bg-surface-sunken px-4 py-3">
        <p className="text-xs leading-snug text-text-secondary">
          Hinweise erscheinen nur hier in der Anwendung. Es werden keine E-Mails versendet
          und es läuft keine Hintergrundautomatik — die Liste wird bei jedem Aufruf neu
          berechnet.
        </p>
      </div>

      {total === 0 ? (
        <EmptyState
          title="Keine ablaufenden Nachweise"
          description={`In den nächsten ${HORIZON_DAYS} Tagen läuft kein hinterlegter Nachweis ab.`}
        />
      ) : (
        sections
          .filter((section) => section.rows.length > 0)
          .map((section) => (
            <Card key={section.key}>
              <CardHeader
                title={section.title}
                description={`${section.rows.length} Nachweis${section.rows.length === 1 ? '' : 'e'}`}
              />
              <TableContainer>
                <Table className="min-w-[48rem]">
                  <TableHead>
                    <TableRow className="hover:bg-transparent">
                      <TableHeaderCell>Unternehmen</TableHeaderCell>
                      <TableHeaderCell>Nachweis</TableHeaderCell>
                      <TableHeaderCell>Aussteller</TableHeaderCell>
                      <TableHeaderCell>Gültig bis</TableHeaderCell>
                      <TableHeaderCell align="right">Verbleibend</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {section.rows.length === 0 ? (
                      <TableEmpty colSpan={5}>Keine Einträge.</TableEmpty>
                    ) : (
                      section.rows.map((row) => {
                        const entry = row.__entry;
                        const remaining =
                          entry.qualification.validUntil === null
                            ? null
                            : daysUntil(entry.qualification.validUntil, new Date());
                        return (
                          <TableRow key={entry.qualification.id}>
                            <TableCell>
                              <Link
                                href={`/subcontractors/${entry.partnerCompanyId}?tab=qualifications`}
                                className="text-sm font-medium text-text-primary hover:text-accent hover:underline"
                              >
                                {entry.companyName}
                              </Link>
                            </TableCell>
                            <TableCell className="text-xs">
                              {CREDENTIAL_TYPE_LABELS[entry.qualification.credentialType]}
                            </TableCell>
                            <TableCell className="text-xs">
                              {entry.qualification.issuer ?? '—'}
                            </TableCell>
                            <TableCell className="tabular text-xs whitespace-nowrap">
                              {formatDate(entry.qualification.validUntil)}
                            </TableCell>
                            <TableCell align="right">
                              {remaining === null ? (
                                <Badge tone="neutral">Ohne Datum</Badge>
                              ) : (
                                <Badge tone={section.tone}>
                                  {remaining < 0
                                    ? `${Math.abs(remaining)} Tage überfällig`
                                    : `${remaining} Tage`}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          ))
      )}

      {buckets.undated.length > 0 && (
        <Card>
          <CardHeader
            title="Ohne Ablaufdatum"
            description="Es wird kein Datum geschätzt. Diese Nachweise gelten als nicht datiert."
          />
          <CardBody>
            <ul className="space-y-1.5 text-xs">
              {buckets.undated.map((row) => (
                <li key={row.__entry.qualification.id}>
                  <Link
                    href={`/subcontractors/${row.__entry.partnerCompanyId}?tab=qualifications`}
                    className="text-text-primary hover:text-accent hover:underline"
                  >
                    {row.__entry.companyName}
                  </Link>
                  {' — '}
                  {CREDENTIAL_TYPE_LABELS[row.__entry.qualification.credentialType]}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
