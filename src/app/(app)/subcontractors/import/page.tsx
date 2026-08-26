import type { Metadata } from 'next';
import { LinkButton } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
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
import { Badge } from '@/components/ui/badge';
import { PartnerImportWizard } from '@/components/partners/partner-import-wizard';
import { requirePermission } from '@/lib/auth/session';
import { getPartnerStore, isUsingDemoStore } from '@/lib/db';
import { formatDateTime } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Partnerimport' };

export default async function PartnerImportPage() {
  const session = await requirePermission('subcontractors:write');

  const store = await getPartnerStore();
  const runs = await store.listImports(session.organization.id, 20);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Partnerimport"
        description="CSV oder XLSX einlesen — mit Vorschau, Testlauf und ausdrücklicher Bestätigung."
        actions={
          <LinkButton href="/subcontractors" size="sm">
            Zurück zur Übersicht
          </LinkButton>
        }
      />

      <PartnerImportWizard volatileStorage={isUsingDemoStore()} />

      <Card>
        <CardHeader
          title="Importprotokoll"
          description="Jeder Lauf wird festgehalten, auch Testläufe."
        />
        <TableContainer>
          <Table className="min-w-[48rem]">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TableHeaderCell>Zeitpunkt</TableHeaderCell>
                <TableHeaderCell>Datei</TableHeaderCell>
                <TableHeaderCell>Art</TableHeaderCell>
                <TableHeaderCell align="right">Zeilen</TableHeaderCell>
                <TableHeaderCell align="right">Importiert</TableHeaderCell>
                <TableHeaderCell align="right">Fehler</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.length === 0 ? (
                <TableEmpty colSpan={6}>Noch kein Importlauf.</TableEmpty>
              ) : (
                runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="tabular text-xs whitespace-nowrap">
                      {formatDateTime(run.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">{run.fileName}</TableCell>
                    <TableCell>
                      <Badge tone={run.status === 'dry_run' ? 'neutral' : 'success'}>
                        {run.status === 'dry_run' ? 'Testlauf' : 'Import'}
                      </Badge>
                    </TableCell>
                    <TableCell align="right" className="tabular text-xs">
                      {run.totalRows}
                    </TableCell>
                    <TableCell align="right" className="tabular text-xs">
                      {run.importedRows}
                    </TableCell>
                    <TableCell align="right" className="tabular text-xs">
                      {run.errorRows}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </div>
  );
}
