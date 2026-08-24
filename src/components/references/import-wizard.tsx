'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
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
import { cn } from '@/lib/utils/cn';
import {
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  REQUIRED_IMPORT_FIELDS,
  type ColumnMapping,
  type ImportField,
} from '@/modules/references/column-mapping';
import { CLASSIFICATION_PROPOSAL_NOTE } from '@/modules/references/classification';
import { SHIFT_MEANING_NOTE } from '@/modules/references/shift-format';
import type { ParsedTable } from '@/modules/references/parse/csv';
import type { ImportAnalysis } from '@/modules/references/import-pipeline';

/**
 * The reference import.
 *
 * Deliberately staged, and deliberately slow at the end: file → detect → map →
 * preview → dry run → explicit confirmation. Nothing is written before the
 * user has seen exactly what would be written, because the payload is real
 * customer data and a bad import is expensive to unpick.
 */

type Step = 'select' | 'map' | 'preview' | 'done';

interface RunResult {
  dryRun: boolean;
  importRunId: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  importedRows: number;
  skippedRows: number;
  createdClients: number;
  volatileStorage: boolean;
}

const STEP_LABELS: Array<{ id: Step; label: string }> = [
  { id: 'select', label: '1 · Datei' },
  { id: 'map', label: '2 · Spalten' },
  { id: 'preview', label: '3 · Prüfung' },
  { id: 'done', label: '4 · Ergebnis' },
];

export function ImportWizard({ volatileStorage }: { volatileStorage: boolean }) {
  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [includeWarningRows, setIncludeWarningRows] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<RunResult | null>(null);
  const [finalResult, setFinalResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const fileType: 'csv' | 'xlsx' =
    file !== null && /\.xlsx?$|\.xlsm$/i.test(file.name) && !/\.csv$/i.test(file.name)
      ? 'xlsx'
      : 'csv';

  const missingRequired = REQUIRED_IMPORT_FIELDS.filter(
    (field) => !mapping.some((assignment) => assignment.field === field),
  );

  async function handleFileSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (file === null) return;

    setError(null);
    setPending(true);

    const payload = new FormData();
    payload.append('file', file);

    try {
      const response = await fetch('/api/v1/references/import/parse', {
        method: 'POST',
        body: payload,
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
        mapping: ColumnMapping;
        analysis: ImportAnalysis;
      };

      setTable(result.table);
      setMapping(result.mapping);
      setAnalysis(result.analysis);
      setStep('map');
    } catch {
      setError('Die Datei konnte nicht übertragen werden.');
    } finally {
      setPending(false);
    }
  }

  function updateAssignment(columnIndex: number, value: string): void {
    const nextField: ImportField | null =
      value === '' ? null : (value as ImportField);

    setMapping((current) =>
      current.map((assignment) => {
        if (assignment.columnIndex === columnIndex) {
          return { ...assignment, field: nextField, matchType: 'none' as const };
        }
        // A field may only be assigned once; claiming it clears it elsewhere.
        if (nextField !== null && assignment.field === nextField) {
          return { ...assignment, field: null, matchType: 'none' as const };
        }
        return assignment;
      }),
    );
  }

  async function runImport(dryRun: boolean): Promise<void> {
    if (table === null || file === null) return;

    setError(null);
    setPending(true);

    try {
      const response = await fetch('/api/v1/references/import/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType,
          table,
          mapping,
          includeWarningRows,
          dryRun,
          confirmed: !dryRun,
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Der Import konnte nicht ausgeführt werden.')
            : 'Der Import konnte nicht ausgeführt werden.';
        setError(message);
        return;
      }

      const result = data as RunResult;
      if (dryRun) {
        setDryRunResult(result);
      } else {
        setFinalResult(result);
        setStep('done');
      }
    } catch {
      setError('Der Import konnte nicht ausgeführt werden.');
    } finally {
      setPending(false);
    }
  }

  function reset(): void {
    setStep('select');
    setFile(null);
    setTable(null);
    setMapping([]);
    setAnalysis(null);
    setDryRunResult(null);
    setFinalResult(null);
    setIncludeWarningRows(false);
    setError(null);
  }

  const importableCount =
    analysis === null
      ? 0
      : analysis.validRows + (includeWarningRows ? analysis.warningRows : 0);

  return (
    <div className="space-y-5">
      {/* Progress ---------------------------------------------------------- */}
      <ol className="flex flex-wrap gap-2">
        {STEP_LABELS.map((entry) => {
          const index = STEP_LABELS.findIndex((item) => item.id === entry.id);
          const currentIndex = STEP_LABELS.findIndex((item) => item.id === step);
          const state =
            index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';

          return (
            <li
              key={entry.id}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                state === 'current' && 'bg-brand-subtle text-brand ring-brand/20',
                state === 'done' && 'bg-success-subtle text-success ring-success/20',
                state === 'todo' && 'bg-surface-sunken text-text-muted ring-border-subtle',
              )}
            >
              {entry.label}
            </li>
          );
        })}
      </ol>

      {error !== null && (
        <div
          role="alert"
          className="rounded-xl border border-danger/25 bg-danger-subtle px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {/* Step 1: file ------------------------------------------------------ */}
      {step === 'select' && (
        <Card>
          <CardHeader
            title="Datei auswählen"
            description="CSV oder XLSX. Die Datei wird gelesen, aber noch nicht gespeichert."
          />
          <CardBody>
            <form onSubmit={handleFileSubmit} className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-sunken/40 px-6 py-10 text-center transition-colors hover:border-brand">
                <Upload className="size-6 text-text-muted" aria-hidden />
                <span className="text-sm font-medium text-text-primary">
                  {file === null ? 'Datei hierher wählen' : file.name}
                </span>
                <span className="text-xs text-text-muted">
                  Unterstützt: .csv, .xlsx — maximal 10 MB und 5.000 Zeilen
                </span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xlsm,.txt"
                  className="sr-only"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setFile(event.target.files?.[0] ?? null);
                    setError(null);
                  }}
                />
              </label>

              <div className="flex items-center gap-2">
                <Button type="submit" variant="primary" disabled={file === null || pending}>
                  {pending ? 'Datei wird gelesen …' : 'Datei einlesen'}
                </Button>
                <a
                  href="/api/v1/references/import/template"
                  className="text-xs text-accent hover:underline"
                >
                  Beispielvorlage herunterladen
                </a>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Step 2: mapping --------------------------------------------------- */}
      {step === 'map' && table !== null && (
        <Card>
          <CardHeader
            title="Spaltenzuordnung prüfen"
            description="Automatisch erkannt. Bitte kontrollieren und bei Bedarf korrigieren."
          />
          <TableContainer>
            <Table className="min-w-[44rem]">
              <TableHead>
                <TableRow className="hover:bg-transparent">
                  <TableHeaderCell>Spalte in der Datei</TableHeaderCell>
                  <TableHeaderCell>Beispielwert</TableHeaderCell>
                  <TableHeaderCell>Erkennung</TableHeaderCell>
                  <TableHeaderCell className="min-w-[14rem]">Zugeordnetes Feld</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mapping.map((assignment) => (
                  <TableRow key={assignment.columnIndex}>
                    <TableCell className="text-sm font-medium text-text-primary">
                      {assignment.header || `Spalte ${assignment.columnIndex + 1}`}
                    </TableCell>
                    <TableCell className="max-w-[16rem] text-xs text-text-muted">
                      <span className="line-clamp-1">
                        {table.rows[0]?.[assignment.columnIndex] ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {assignment.matchType === 'exact' && (
                        <Badge tone="success">Eindeutig</Badge>
                      )}
                      {assignment.matchType === 'partial' && (
                        <Badge tone="warning">Vermutet</Badge>
                      )}
                      {assignment.matchType === 'none' && (
                        <Badge tone="neutral">Manuell</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        aria-label={`Feld für ${assignment.header}`}
                        value={assignment.field ?? ''}
                        onChange={(event) =>
                          updateAssignment(assignment.columnIndex, event.target.value)
                        }
                        placeholder="Nicht importieren"
                        options={IMPORT_FIELDS.map((field) => ({
                          value: field,
                          label: IMPORT_FIELD_LABELS[field],
                        }))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <CardBody className="space-y-3">
            {missingRequired.length > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-xs text-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Pflichtfelder fehlen:{' '}
                {missingRequired.map((field) => IMPORT_FIELD_LABELS[field]).join(', ')}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={reset}>
                Andere Datei
              </Button>
              <Button
                variant="primary"
                disabled={missingRequired.length > 0}
                onClick={() => setStep('preview')}
              >
                Weiter zur Prüfung
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Step 3: preview and dry run --------------------------------------- */}
      {step === 'preview' && analysis !== null && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Zeilen gesamt', value: analysis.totalRows, tone: 'neutral' },
              { label: 'Gültig', value: analysis.validRows, tone: 'success' },
              { label: 'Warnungen', value: analysis.warningRows, tone: 'warning' },
              { label: 'Fehler', value: analysis.errorRows, tone: 'danger' },
            ].map((tile) => (
              <div
                key={tile.label}
                className="rounded-xl border border-border-subtle bg-surface-raised p-4 shadow-card"
              >
                <p className="text-xs font-medium text-text-secondary">{tile.label}</p>
                <p
                  className={cn(
                    'tabular mt-2 text-2xl font-semibold',
                    tile.tone === 'success' && 'text-success',
                    tile.tone === 'warning' && 'text-warning',
                    tile.tone === 'danger' && 'text-danger',
                    tile.tone === 'neutral' && 'text-text-primary',
                  )}
                >
                  {tile.value}
                </p>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader
              title="Vorschau und Validierung"
              description="Originalwerte bleiben unverändert. Vorschläge werden nicht automatisch übernommen."
            />
            <TableContainer>
              <Table className="min-w-[64rem]">
                <TableHead>
                  <TableRow className="hover:bg-transparent">
                    <TableHeaderCell>Zeile</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Objekt-Nr.</TableHeaderCell>
                    <TableHeaderCell className="min-w-[14rem]">Objektname</TableHeaderCell>
                    <TableHeaderCell>Kunde</TableHeaderCell>
                    <TableHeaderCell>Ort</TableHeaderCell>
                    <TableHeaderCell>Schichten</TableHeaderCell>
                    <TableHeaderCell>Leistungsvorschlag</TableHeaderCell>
                    <TableHeaderCell className="min-w-[18rem]">Hinweise</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analysis.rows.slice(0, 50).map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="tabular text-xs">{row.rowNumber}</TableCell>
                      <TableCell>
                        {row.status === 'error' && <Badge tone="danger">Fehler</Badge>}
                        {row.status === 'warning' && <Badge tone="warning">Warnung</Badge>}
                        {row.status === 'valid' && <Badge tone="success">Gültig</Badge>}
                      </TableCell>
                      <TableCell className="tabular text-xs">
                        {row.normalized.externalObjectNumber ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[18rem] text-xs">
                        <span className="line-clamp-2">
                          {row.normalized.projectName ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[12rem] text-xs">
                        <span className="line-clamp-2">
                          {row.normalized.clientName ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.normalized.city ?? '—'}
                      </TableCell>
                      <TableCell className="tabular text-xs" title={SHIFT_MEANING_NOTE}>
                        {row.normalized.shiftSummaryRaw ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.serviceProposals
                          .map((proposal) => proposal.serviceCategory)
                          .join(', ')}
                      </TableCell>
                      <TableCell>
                        {row.messages.length === 0 ? (
                          <span className="text-xs text-text-muted">—</span>
                        ) : (
                          <ul className="space-y-1">
                            {row.messages.map((message, index) => (
                              <li
                                key={`${message.code}-${index}`}
                                className={cn(
                                  'text-[11px] leading-snug',
                                  message.severity === 'error' && 'text-danger',
                                  message.severity === 'warning' && 'text-warning',
                                  message.severity === 'info' && 'text-text-muted',
                                )}
                              >
                                {message.message}
                                {message.suggestion !== null && (
                                  <span className="text-text-muted">
                                    {' '}
                                    Vorschlag: „{message.suggestion}&ldquo; (nicht
                                    automatisch übernommen)
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {analysis.rows.length > 50 && (
              <CardBody className="pt-0">
                <p className="text-xs text-text-muted">
                  Es werden die ersten 50 von {analysis.rows.length} Zeilen angezeigt.
                  Geprüft wurden alle Zeilen.
                </p>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title="Import ausführen" />
            <CardBody className="space-y-4">
              <p className="flex items-start gap-2 rounded-lg border border-info/20 bg-info-subtle px-3 py-2 text-xs leading-snug text-info">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {CLASSIFICATION_PROPOSAL_NOTE}
              </p>

              {volatileStorage && (
                <p className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-subtle px-3 py-2 text-xs leading-snug text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Supabase ist nicht konfiguriert. Importierte Daten liegen nur im
                  Arbeitsspeicher und gehen beim Neustart verloren. Importieren Sie
                  hier keine echten Kundendaten.
                </p>
              )}

              <Checkbox
                label={`Zeilen mit Warnungen mit importieren (${analysis.warningRows})`}
                checked={includeWarningRows}
                onChange={(event) => setIncludeWarningRows(event.target.checked)}
              />
              <p className="text-xs text-text-muted">
                Zeilen mit Fehlern werden nie importiert. Es würden derzeit{' '}
                <span className="tabular font-semibold text-text-primary">
                  {importableCount}
                </span>{' '}
                von {analysis.totalRows} Zeilen übernommen.
              </p>

              {dryRunResult !== null && (
                <div className="rounded-lg border border-success/20 bg-success-subtle px-3 py-2.5">
                  <p className="flex items-center gap-2 text-xs font-semibold text-success">
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    Testlauf abgeschlossen — es wurde nichts gespeichert
                  </p>
                  <p className="mt-1 text-xs text-success">
                    {importableCount} Zeilen würden übernommen,{' '}
                    {dryRunResult.totalRows - importableCount} übersprungen.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => setStep('map')}>
                  Zurück zur Zuordnung
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => void runImport(true)}
                >
                  {pending ? 'Läuft …' : 'Testlauf ohne Speichern'}
                </Button>
                <Button
                  variant="primary"
                  disabled={pending || importableCount === 0}
                  onClick={() => void runImport(false)}
                >
                  {importableCount} Zeilen verbindlich importieren
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Step 4: result ---------------------------------------------------- */}
      {step === 'done' && finalResult !== null && (
        <Card>
          <CardHeader title="Importergebnis" />
          <CardBody className="space-y-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-success">
              <CheckCircle2 className="size-4" aria-hidden />
              {finalResult.importedRows} von {finalResult.totalRows} Zeilen importiert
            </p>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Importiert', value: finalResult.importedRows },
                { label: 'Übersprungen', value: finalResult.skippedRows },
                { label: 'Fehlerzeilen', value: finalResult.errorRows },
                { label: 'Neue Kunden', value: finalResult.createdClients },
              ].map((entry) => (
                <div
                  key={entry.label}
                  className="rounded-lg border border-border-subtle p-3"
                >
                  <dt className="text-xs text-text-secondary">{entry.label}</dt>
                  <dd className="tabular mt-1 text-xl font-semibold text-text-primary">
                    {entry.value}
                  </dd>
                </div>
              ))}
            </dl>

            {finalResult.volatileStorage && (
              <p className="rounded-lg border border-warning/25 bg-warning-subtle px-3 py-2 text-xs text-warning">
                Die Daten liegen im flüchtigen Entwicklungsspeicher und gehen beim
                Neustart verloren.
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={reset}>
                Weitere Datei importieren
              </Button>
              <LinkButton href="/references">Zu den Referenzen</LinkButton>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 'select' && (
        <Card>
          <CardHeader
            title="Erwartete Spalten"
            description="Diese Überschriften werden automatisch erkannt"
          />
          <CardBody>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  'externalObjectNumber',
                  'projectName',
                  'objectType',
                  'city',
                  'clientName',
                  'shiftSummary',
                  'invoiceStatus',
                ] as const
              ).map((field) => (
                <Badge key={field} tone="neutral">
                  {IMPORT_FIELD_LABELS[field]}
                </Badge>
              ))}
            </div>
            <p className="mt-3 flex items-start gap-2 text-xs leading-snug text-text-muted">
              <FileSpreadsheet className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Abweichende Überschriften lassen sich im nächsten Schritt manuell
              zuordnen. PDF-Import und OCR folgen in einer späteren Phase.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
