/**
 * Ingestion CLI.
 *
 *   npm run ingest:demo          # run the demo source
 *   npx tsx scripts/run-ingestion.ts          # run every active source
 *   npx tsx scripts/run-ingestion.ts <key>    # run one source by key
 *
 * Writes through the configured store: Postgres when Supabase credentials are
 * present, the in-process demo store otherwise (nothing is persisted then —
 * useful only as a pipeline smoke test).
 */

import { getIngestionStore } from '../src/lib/db/ingestion';
import { ingestAllActiveSources, ingestSource } from '../src/modules/ingestion/pipeline';
import { toErrorMessage } from '../src/lib/errors';
import type { IngestSourceReport } from '../src/modules/ingestion/pipeline';

function printReport(report: IngestSourceReport): void {
  const lines = [
    `Quelle:            ${report.sourceKey}`,
    `Status:            ${report.status}`,
    `Gefunden:          ${report.itemsFound}`,
    `Importiert:        ${report.itemsImported}`,
    `Übersprungen:      ${report.itemsSkipped}`,
    `Fehlgeschlagen:    ${report.itemsFailed}`,
    `Dublettenverdacht: ${report.duplicateCandidates}`,
    `Dauer:             ${report.durationMs} ms`,
  ];

  if (report.errorMessage !== null) {
    lines.push(`Fehler:            ${report.errorMessage}`);
  }

  console.log(`\n${lines.join('\n')}\n`);
}

async function main(): Promise<void> {
  const sourceKey = process.argv[2];
  const store = getIngestionStore();

  if (sourceKey === undefined) {
    const reports = await ingestAllActiveSources(store);
    reports.forEach(printReport);
    process.exitCode = reports.some((report) => report.status === 'failed') ? 1 : 0;
    return;
  }

  const source = await store.getSourceByKey(sourceKey);
  if (source === null) {
    console.error(`Quelle "${sourceKey}" ist nicht registriert.`);
    process.exitCode = 1;
    return;
  }

  if (!source.isActive) {
    console.error(
      `Quelle "${sourceKey}" ist deaktiviert (sources.is_active = false).`,
    );
    process.exitCode = 1;
    return;
  }

  const report = await ingestSource(store, source);
  printReport(report);
  process.exitCode = report.status === 'failed' ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(`Import fehlgeschlagen: ${toErrorMessage(error)}`);
  process.exitCode = 1;
});
