'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Select } from '@/components/ui/form';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table';
import {
  PARTNER_IMPORT_FIELDS,
  PARTNER_IMPORT_FIELD_LABELS,
  type PartnerColumnMapping,
  type PartnerImportField,
} from '@/modules/partners/column-mapping';
import type { PartnerImportAnalysis } from '@/modules/partners/import-pipeline';
import type { ParsedTable } from '@/modules/references/parse/csv';

type Step = 'select' | 'map' | 'preview' | 'done';

interface RunResult {
  analysis: PartnerImportAnalysis;
  dryRun: boolean;
  importedCompanies: number;
  createdSignals: number;
  skippedRows: number;
  volatileStore: boolean;
}

/** The ten steps the user is walked through, shown as a progress list. */
const STEP_LABELS = [
  'Datei auswählen',
  'Spalten erkennen',
  'Zuordnung prüfen',
  'Vorschau',
  'Validierung',
  'Hinweise lesen',
  'Dublettenprüfung',
  'Testlauf',
  'Import bestätigen',
  'Ergebnis',
];

/**
 * Partner import.
 *
 * Deliberately the same ten-step shape as the reference import of phase 2, and
 * for the same reasons: the dry run and the real import go through one code
 * path, rows with errors are never written, and rows with warnings only on
 * explicit request. The raw file content is kept unchanged alongside the
 * normalised proposal.
 */
export function PartnerImportWizard({ volatileStorage }: { volatileStorage: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<PartnerColumnMapping>([]);
  const [analysis, setAnalysis] = useState<PartnerImportAnalysis | null>(null);
  const [includeWarningRows, setIncludeWarningRows] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<RunResult | null>(null);
  const [finalResult, setFinalResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset(): void {
    setStep('select');
    setFile(null);
    setTable(null);
    setMapping([]);
    setAnalysis(null);
    setDryRunResult(null);
    setFinalResult(null);
    setError(null);
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);
  }

  async function parse(): Promise<void> {
    if (file === null) return;
    setError(null);
    setPending(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/v1/partners/import/parse', {
        method: 'POST',
        body: formData,
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Die Datei konnte nicht gelesen werden.')
            : 'Die Datei konnte nicht gelesen werden.';
        setError(message);
        return;
      }

      const result = data as {
        table: ParsedTable;
        mapping: PartnerColumnMapping;
        analysis: PartnerImportAnalysis;
      };
      setTable(result.table);
      setMapping(result.mapping);
      setAnalysis(result.analysis);
      setStep('map');
    } catch {
      setError('Die Datei konnte nicht gelesen werden.');
    } finally {
      setPending(false);
    }
  }

  async function run(dryRun: boolean): Promise<void> {
    if (table === null) return;
    setError(null);
    setPending(true);

    try {
      const response = await fetch('/api/v1/partners/import/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file?.name ?? 'import.csv',
          fileType: (file?.name ?? '').toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx',
          table,
          mapping,
          includeWarningRows,
          dryRun,
          // A real import is only ever performed with this flag set.
          confirmed: !dryRun,
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Der Import ist fehlgeschlagen.')
            : 'Der Import ist fehlgeschlagen.';
        setError(message);
        return;
      }

      const result = data as RunResult;
      setAnalysis(result.analysis);

      if (dryRun) {
        setDryRunResult(result);
        setStep('preview');
      } else {
        setFinalResult(result);
        setStep('done');
        router.refresh();
      }
    } catch {
      setError('Der Import ist fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }

  function updateMapping(columnIndex: number, field: string): void {
    setMapping((current) =>
      current.map((assignment) =>
        assignment.columnIndex === columnIndex
          ? {
              ...assignment,
              field: field === '' ? null : (field as PartnerImportField),
              matchType: 'none',
            }
          : assignment,
      ),
    );
  }

  const stepIndex =
    step === 'select' ? 0 : step === 'map' ? 2 : step === 'preview' ? 7 : 9;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Ablauf" description="Erst der letzte Schritt schreibt Daten." />
        <CardBody>
          <ol className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2 lg:grid-cols-5">
            {STEP_LABELS.map((label, index) => (
              <li
                key={label}
                className={
                  index <= stepIndex
                    ? 'font-medium text-text-primary'
                    : 'text-text-muted'
                }
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      {volatileStorage && (
        <div className="rounded-xl border border-warning/25 bg-warning-subtle px-4 py-3">
          <p className="text-sm font-semibold text-warning">
            Flüchtiger Entwicklungsspeicher
          </p>
          <p className="mt-1 text-xs text-warning">
            Supabase ist nicht konfiguriert. Importierte Partnerdaten gehen beim Neustart
            verloren. Importieren Sie hier keine echten Firmendaten.
          </p>
        </div>
      )}

      {error !== null && (
        <p
          role="alert"
          className="rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {step === 'select' && (
        <Card>
          <CardHeader
            title="1. Datei auswählen"
            description="CSV oder XLSX. PDF-Import und OCR sind nicht Teil dieser Phase."
          />
          <CardBody className="space-y-3">
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xlsm"
              onChange={(event) => void readFile(event)}
              className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-surface-sunken file:px-3 file:py-2 file:text-sm file:font-medium file:text-text-primary"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                disabled={file === null || pending}
                onClick={() => void parse()}
              >
                <Upload className="size-3.5" aria-hidden />
                {pending ? 'Wird gelesen …' : 'Datei einlesen'}
              </Button>
              <a
                href="/api/v1/partners/import/template"
                className="text-xs text-accent hover:underline"
              >
                Vorlage herunterladen
              </a>
            </div>
            <p className="text-[11px] leading-snug text-text-muted">
              Die Vorlage enthält ausschließlich erfundene Beispielwerte. Echte
              Partnerdaten gehören nie in eine Datei im Projektverzeichnis.
            </p>
          </CardBody>
        </Card>
      )}

      {step === 'map' && table !== null && (
        <Card>
          <CardHeader
            title="2.–3. Spaltenzuordnung prüfen"
            description="Jede Zuordnung ist ein Vorschlag und lässt sich korrigieren oder abwählen."
          />
          <TableContainer>
            <Table className="min-w-[40rem]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeaderCell>Spalte in der Datei</TableHeaderCell>
                  <TableHeaderCell>Erkennung</TableHeaderCell>
                  <TableHeaderCell>Internes Feld</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mapping.map((assignment) => (
                  <TableRow key={assignment.columnIndex}>
                    <TableCell className="text-sm">{assignment.header}</TableCell>
                    <TableCell>
                      <Badge
                        tone={
                          assignment.matchType === 'exact'
                            ? 'success'
                            : assignment.matchType === 'partial'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {assignment.matchType === 'exact'
                          ? 'Eindeutig'
                          : assignment.matchType === 'partial'
                            ? 'Vermutet'
                            : 'Manuell'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        aria-label={`Zuordnung für ${assignment.header}`}
                        value={assignment.field ?? ''}
                        onChange={(event) =>
                          updateMapping(assignment.columnIndex, event.target.value)
                        }
                        placeholder="Nicht importieren"
                        options={PARTNER_IMPORT_FIELDS.map((field) => ({
                          value: field,
                          label: PARTNER_IMPORT_FIELD_LABELS[field],
                        }))}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <CardBody className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={pending} onClick={() => void run(true)}>
              {pending ? 'Testlauf läuft …' : 'Testlauf starten (schreibt nichts)'}
            </Button>
            <Button variant="ghost" onClick={reset}>
              Abbrechen
            </Button>
          </CardBody>
        </Card>
      )}

      {step === 'preview' && analysis !== null && dryRunResult !== null && (
        <Card>
          <CardHeader
            title="4.–8. Vorschau, Validierung und Testlauf"
            description="Der Testlauf hat nichts gespeichert. So würde der echte Import ausfallen."
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Zeilen gesamt', value: analysis.totalRows },
                { label: 'Gültig', value: analysis.validRows },
                { label: 'Mit Warnung', value: analysis.warningRows },
                { label: 'Mit Fehler', value: analysis.errorRows },
              ].map((tile) => (
                <div
                  key={tile.label}
                  className="rounded-lg border border-border-subtle p-3"
                >
                  <p className="text-[11px] text-text-secondary">{tile.label}</p>
                  <p className="tabular mt-1 text-xl font-semibold text-text-primary">
                    {tile.value}
                  </p>
                </div>
              ))}
            </div>

            <Checkbox
              label="Zeilen mit Warnungen mit importieren"
              checked={includeWarningRows}
              onChange={(event) => setIncludeWarningRows(event.target.checked)}
            />
            <p className="text-[11px] leading-snug text-text-muted">
              Zeilen mit Fehlern werden nie importiert.
            </p>

            <TableContainer>
              <Table className="min-w-[52rem]">
                <TableHead>
                  <TableRow className="hover:bg-transparent">
                    <TableHeaderCell>Zeile</TableHeaderCell>
                    <TableHeaderCell>Firmenname</TableHeaderCell>
                    <TableHeaderCell>Richtung</TableHeaderCell>
                    <TableHeaderCell>Ort</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Hinweise</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analysis.rows.slice(0, 50).map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="tabular text-xs">{row.rowNumber}</TableCell>
                      <TableCell className="text-xs">
                        {row.normalized.legalName ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.normalized.relationshipDirection}
                      </TableCell>
                      <TableCell className="text-xs">{row.normalized.city ?? '—'}</TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            row.status === 'valid'
                              ? 'success'
                              : row.status === 'warning'
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {row.status === 'valid'
                            ? 'Gültig'
                            : row.status === 'warning'
                              ? 'Warnung'
                              : 'Fehler'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[22rem] text-[11px]">
                        {row.messages.length === 0
                          ? '—'
                          : row.messages.map((message) => message.message).join(' ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={pending} onClick={() => void run(false)}>
                {pending ? 'Wird importiert …' : '9. Import verbindlich bestätigen'}
              </Button>
              <Button variant="ghost" onClick={() => setStep('map')}>
                Zurück zur Zuordnung
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 'done' && finalResult !== null && (
        <Card>
          <CardHeader title="10. Ergebnis" />
          <CardBody className="space-y-3">
            <p className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-sm text-success">
              <CheckCircle2 className="size-4" aria-hidden />
              {finalResult.importedCompanies} Unternehmen importiert
              {finalResult.createdSignals > 0 &&
                `, ${finalResult.createdSignals} Signal(e) angelegt`}
              , {finalResult.skippedRows} Zeile(n) übersprungen.
            </p>
            <p className="flex items-start gap-2 text-[11px] leading-snug text-text-muted">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Importierte Leistungen gelten als selbst angegeben, nicht als bestätigt.
              Importierte Verfügbarkeiten sind unbestätigt. Beides muss geprüft werden,
              bevor es in einem Match zählt.
            </p>
            <Button variant="primary" onClick={reset}>
              Weiteren Import starten
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
