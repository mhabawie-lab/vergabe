import type { Metadata } from 'next';
import { Badge, ConnectorRunStatusBadge, DemoBadge } from '@/components/ui/badge';
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
import { requirePermission } from '@/lib/auth/session';
import { getTenderRepository } from '@/lib/db';
import { formatDateTime, formatNumber } from '@/lib/utils/format';
import { listConnectors } from '@/modules/connectors/core/registry';
import { listMappers } from '@/modules/ingestion/normalizer';
import { SOURCE_TYPE_LABELS } from '@/types/source';

export const metadata: Metadata = { title: 'Datenquellen' };

export default async function SourcesPage() {
  await requirePermission('sources:read');

  const repository = await getTenderRepository();
  const [health, runs] = await Promise.all([
    repository.listSourceHealth(),
    repository.listConnectorRuns(20),
  ]);

  const connectors = listConnectors();
  const mappers = listMappers();
  const mapperVersionByKey = new Map(
    mappers.map((mapper) => [mapper.sourceKey, mapper.version]),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Datenquellen"
        description="Registrierte Quellen, ihre Connector-Läufe und der daraus entstandene Datenbestand. Quellen werden über die Datenbank aktiviert oder deaktiviert — nicht über ein Deployment."
      />

      <div className="rounded-xl border border-info/20 bg-info-subtle px-4 py-3">
        <p className="text-sm font-medium text-info">
          Phase 1: ausschließlich die DEMO-Quelle
        </p>
        <p className="mt-1 text-xs text-info">
          Es ist bewusst keine Live-Vergabequelle angebunden. TED / EU eForms
          sowie die deutschen Bundes-, Landes- und Kommunalportale folgen in
          Phase 2. Ein neuer Connector wird als eigenes Modul ergänzt — ohne
          Änderung an der Benutzeroberfläche oder am zentralen Datenmodell.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Registrierte Quellen"
          description="Status, Datenbestand und letzter Lauf"
        />
        <TableContainer>
          <Table className="min-w-[52rem]">
            <TableHead>
              <TableRow className="hover:bg-transparent">
                <TableHeaderCell>Quelle</TableHeaderCell>
                <TableHeaderCell>Typ</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell align="right">Ausschreibungen</TableHeaderCell>
                <TableHeaderCell align="right">Rohdatensätze</TableHeaderCell>
                <TableHeaderCell>Letzter Lauf</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {health.length === 0 ? (
                <TableEmpty colSpan={6}>Keine Quellen registriert.</TableEmpty>
              ) : (
                health.map(({ source, lastRun, tenderCount, rawImportCount }) => (
                  <TableRow key={source.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-text-primary">
                          {source.name}
                        </span>
                        {source.isDemo && <DemoBadge />}
                      </div>
                      <span className="tabular block text-[11px] text-text-muted">
                        {source.key}
                        {mapperVersionByKey.has(source.key) &&
                          ` · Mapper v${mapperVersionByKey.get(source.key)}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {SOURCE_TYPE_LABELS[source.sourceType]}
                    </TableCell>
                    <TableCell>
                      {source.isActive ? (
                        <Badge tone="success">Aktiv</Badge>
                      ) : (
                        <Badge tone="neutral">Deaktiviert</Badge>
                      )}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {formatNumber(tenderCount)}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {formatNumber(rawImportCount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {lastRun === null ? (
                        <span className="text-xs text-text-muted">Noch kein Lauf</span>
                      ) : (
                        <>
                          <ConnectorRunStatusBadge status={lastRun.status} />
                          <span className="tabular mt-1 block text-[11px] text-text-muted">
                            {formatDateTime(lastRun.startedAt)}
                          </span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader
            title="Connector-Läufe"
            description="Protokoll der letzten Importe"
          />
          <TableContainer>
            <Table className="min-w-[44rem]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeaderCell>Quelle</TableHeaderCell>
                  <TableHeaderCell>Gestartet</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell align="right">Gefunden</TableHeaderCell>
                  <TableHeaderCell align="right">Importiert</TableHeaderCell>
                  <TableHeaderCell align="right">Übersprungen</TableHeaderCell>
                  <TableHeaderCell align="right">Fehler</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {runs.length === 0 ? (
                  <TableEmpty colSpan={7}>
                    Es wurde noch kein Connector-Lauf protokolliert.
                  </TableEmpty>
                ) : (
                  runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="tabular text-xs">
                        {run.sourceKey || '—'}
                      </TableCell>
                      <TableCell className="tabular text-xs whitespace-nowrap">
                        {formatDateTime(run.startedAt)}
                      </TableCell>
                      <TableCell>
                        <ConnectorRunStatusBadge status={run.status} />
                        {run.errorMessage !== null && (
                          <span className="mt-1 block max-w-[16rem] text-[11px] text-danger">
                            {run.errorMessage}
                          </span>
                        )}
                      </TableCell>
                      <TableCell align="right" className="tabular">
                        {formatNumber(run.itemsFound)}
                      </TableCell>
                      <TableCell align="right" className="tabular">
                        {formatNumber(run.itemsImported)}
                      </TableCell>
                      <TableCell align="right" className="tabular">
                        {formatNumber(run.itemsSkipped)}
                      </TableCell>
                      <TableCell align="right" className="tabular">
                        {run.itemsFailed > 0 ? (
                          <span className="font-medium text-danger">
                            {formatNumber(run.itemsFailed)}
                          </span>
                        ) : (
                          formatNumber(run.itemsFailed)
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

        <Card>
          <CardHeader
            title="Verfügbare Connectoren"
            description="Im Code registrierte Implementierungen"
          />
          <CardBody>
            <ul className="space-y-3">
              {connectors.map((connector) => (
                <li
                  key={connector.key}
                  className="rounded-lg border border-border-subtle p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="tabular text-xs font-semibold text-text-primary">
                      {connector.key}
                    </span>
                    <Badge tone="neutral">
                      {SOURCE_TYPE_LABELS[connector.sourceType]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-text-muted">
                    {connector.description}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-[11px] leading-snug text-text-muted">
              Ein Connector liefert ausschließlich Rohdaten. Die Übersetzung in
              das interne Ausschreibungsformat übernimmt der zugehörige Mapper —
              deshalb bleibt die Oberfläche von jeder neuen Quelle unberührt.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
