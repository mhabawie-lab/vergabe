import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
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
import { ImportWizard } from '@/components/references/import-wizard';
import { ManualReferenceForm } from '@/components/references/manual-reference-form';
import { requirePermission } from '@/lib/auth/session';
import { getReferenceStore, isUsingDemoStore } from '@/lib/db';
import { formatDateTime, formatNumber } from '@/lib/utils/format';
import { REFERENCE_IMPORT_STATUS_LABELS } from '@/types/reference';

export const metadata: Metadata = { title: 'Datenimport' };

export default async function ReferenceImportPage() {
  const session = await requirePermission('references:import');

  const store = await getReferenceStore();
  const [recentImports, facets] = await Promise.all([
    store.listImports(session.organization.id, 10),
    store.listFacets(session.organization.id),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Datenimport"
        description="Kunden- und Referenzdaten aus einer CSV- oder XLSX-Datei übernehmen. Nichts wird gespeichert, bevor Sie den Import ausdrücklich bestätigen."
      />

      <div className="rounded-xl border border-info/20 bg-info-subtle px-4 py-3">
        <p className="text-sm font-semibold text-info">Umgang mit echten Kundendaten</p>
        <ul className="mt-1.5 space-y-1 text-xs text-info">
          <li>
            Importdateien werden nur verarbeitet, nicht im Projektverzeichnis
            abgelegt — echte Kundendaten gelangen nie in die Versionsverwaltung.
          </li>
          <li>
            Originalwerte bleiben unverändert erhalten. Normalisierte Vorschläge
            werden getrennt davon gespeichert.
          </li>
          <li>
            Erkannte Schreibvarianten sind Hinweise, keine automatischen
            Korrekturen.
          </li>
        </ul>
      </div>

      <ImportWizard volatileStorage={isUsingDemoStore()} />

      <Card>
        <CardHeader
          title="Manuelle Erfassung"
          description="Einzelnes Referenzprojekt ohne Datei anlegen"
        />
        <CardBody>
          <ManualReferenceForm clients={facets.clients} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Bisherige Importe"
          description="Protokoll der letzten Läufe, einschließlich Testläufe"
        />
        <TableContainer>
          <Table className="min-w-[46rem]">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TableHeaderCell>Datei</TableHeaderCell>
                <TableHeaderCell>Zeitpunkt</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell align="right">Zeilen</TableHeaderCell>
                <TableHeaderCell align="right">Importiert</TableHeaderCell>
                <TableHeaderCell align="right">Warnungen</TableHeaderCell>
                <TableHeaderCell align="right">Fehler</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentImports.length === 0 ? (
                <TableEmpty colSpan={7}>
                  Es wurde noch kein Import ausgeführt.
                </TableEmpty>
              ) : (
                recentImports.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm text-text-primary">
                      {entry.fileName}
                      <span className="block text-[11px] text-text-muted uppercase">
                        {entry.fileType}
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-xs whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        tone={
                          entry.status === 'imported'
                            ? 'success'
                            : entry.status === 'dry_run'
                              ? 'info'
                              : entry.status === 'failed'
                                ? 'danger'
                                : 'neutral'
                        }
                      >
                        {REFERENCE_IMPORT_STATUS_LABELS[entry.status]}
                      </Badge>
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {formatNumber(entry.totalRows)}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {formatNumber(entry.importedRows)}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {formatNumber(entry.warningRows)}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {entry.errorRows > 0 ? (
                        <span className="font-medium text-danger">
                          {formatNumber(entry.errorRows)}
                        </span>
                      ) : (
                        formatNumber(entry.errorRows)
                      )}
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
