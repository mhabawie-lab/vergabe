'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Download, FileText, Lock, ShieldQuestion } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
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
import { formatDate } from '@/lib/utils/format';
import {
  CREDENTIAL_STATE_DESCRIPTIONS,
  CREDENTIAL_STATE_LABELS,
  classifyCredential,
} from '@/modules/partners/credentials';
import {
  describeAllowedTypes,
  MAX_DOCUMENT_BYTES,
  SCAN_STATUS_LABELS,
  type DocumentOwnerType,
} from '@/modules/documents/storage';
import {
  CONFIDENTIALITY_LEVELS,
  CONFIDENTIALITY_LEVEL_LABELS,
} from '@/types/reference';
import { CREDENTIAL_TYPES, CREDENTIAL_TYPE_LABELS } from '@/types/partner';

interface DocumentRecord {
  id: string;
  credentialType: keyof typeof CREDENTIAL_TYPE_LABELS;
  title: string | null;
  issuer: string | null;
  documentNumber: string | null;
  originalFileName: string | null;
  fileName: string;
  fileSize: number | null;
  confidentiality: keyof typeof CONFIDENTIALITY_LEVEL_LABELS;
  scanStatus: keyof typeof SCAN_STATUS_LABELS;
  lifecycle: 'active' | 'archived';
  validFrom: string | null;
  validUntil: string | null;
  reviewStatus: 'pending' | 'reviewed' | 'accepted' | 'rejected';
  note: string | null;
  createdAt: string;
}

interface Capabilities {
  storesFileContent: boolean;
  malwareScanning: boolean;
  note: string;
}

const LIFECYCLE_TONE: Record<'active' | 'archived', BadgeTone> = {
  active: 'neutral',
  archived: 'warning',
};

function formatSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Documents of one record: list, upload, download, archive, delete.
 *
 * Two things this component refuses to do. It never renders a direct file
 * URL — a download is always fetched on demand as a short-lived signed link,
 * so nothing durable ends up in the markup. And it never shows a document as
 * "geprüft" or "sicher" on the strength of an upload: the scan status is
 * whatever the backend actually knows, which today is "not available".
 */
export function DocumentPanel({
  ownerType,
  ownerId,
  canWrite,
  canDelete,
  title = 'Dokumente',
}: {
  ownerType: DocumentOwnerType;
  ownerId: string;
  canWrite: boolean;
  canDelete: boolean;
  title?: string;
}) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  /**
   * Fetches without touching state, so the effect below has nothing
   * synchronous to do — that is what keeps it from cascading renders, and it
   * also makes the unmount race easy to handle.
   */
  const fetchDocuments = useCallback(async (): Promise<
    { documents: DocumentRecord[]; capabilities: Capabilities } | { error: string }
  > => {
    try {
      const response = await fetch(
        `/api/v1/documents?ownerType=${ownerType}&ownerId=${ownerId}&includeArchived=${includeArchived}`,
      );
      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Die Dokumente konnten nicht geladen werden.')
            : 'Die Dokumente konnten nicht geladen werden.';
        return { error: message };
      }

      return data as { documents: DocumentRecord[]; capabilities: Capabilities };
    } catch {
      return { error: 'Die Dokumente konnten nicht geladen werden.' };
    }
  }, [ownerType, ownerId, includeArchived]);

  const load = useCallback(async (): Promise<void> => {
    const result = await fetchDocuments();
    if ('error' in result) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setDocuments(result.documents);
    setCapabilities(result.capabilities);
    setError(null);
    setLoading(false);
  }, [fetchDocuments]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await fetchDocuments();
      if (cancelled) return;

      if ('error' in result) {
        setError(result.error);
      } else {
        setDocuments(result.documents);
        setCapabilities(result.capabilities);
        setError(null);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchDocuments]);

  async function upload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');

    setError(null);
    setMessages([]);

    if (!(file instanceof File) || file.size === 0) {
      setError('Bitte eine Datei auswählen.');
      return;
    }

    const read = (key: string): string | null => {
      const value = data.get(key);
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const payload = new FormData();
    payload.append('file', file);
    payload.append(
      'metadata',
      JSON.stringify({
        ownerType,
        ownerId,
        credentialType: read('credentialType') ?? 'other',
        title: read('title'),
        issuer: read('issuer'),
        documentNumber: read('documentNumber'),
        confidentiality: read('confidentiality') ?? 'confidential',
        validFrom: read('validFrom'),
        validUntil: read('validUntil'),
        note: read('note'),
      }),
    );

    setPending(true);
    setProgress('Datei wird übertragen …');
    try {
      const response = await fetch('/api/v1/documents', { method: 'POST', body: payload });
      const result: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof result === 'object' && result !== null && 'error' in result
            ? ((result as { error: { message?: string } }).error.message ??
              'Der Upload ist fehlgeschlagen.')
            : 'Der Upload ist fehlgeschlagen.';
        setError(message);
        return;
      }

      const parsed = result as { saved: boolean; messages?: string[] };
      if (!parsed.saved) {
        setMessages(parsed.messages ?? []);
        return;
      }

      setProgress('Hochgeladen.');
      form.reset();
      await load();
    } catch {
      setError('Der Upload ist fehlgeschlagen.');
    } finally {
      setPending(false);
      setTimeout(() => setProgress(null), 2500);
    }
  }

  async function download(id: string): Promise<void> {
    setError(null);
    try {
      const response = await fetch(`/api/v1/documents/${id}/download`, { method: 'POST' });
      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Der Download-Link konnte nicht erzeugt werden.')
            : 'Der Download-Link konnte nicht erzeugt werden.';
        setError(message);
        return;
      }

      const { download: link } = data as { download: { url: string } };
      // Opened immediately and never kept: the link expires within minutes.
      window.open(link.url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Der Download-Link konnte nicht erzeugt werden.');
    }
  }

  async function mutate(id: string, action: 'archive' | 'delete'): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const response =
        action === 'archive'
          ? await fetch(`/api/v1/documents/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'archive' }),
            })
          : await fetch(`/api/v1/documents/${id}`, { method: 'DELETE' });

      if (!response.ok) {
        const data: unknown = await response.json();
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Die Aktion ist fehlgeschlagen.')
            : 'Die Aktion ist fehlgeschlagen.';
        setError(message);
        return;
      }

      await load();
    } catch {
      setError('Die Aktion ist fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox
            label="Archivierte anzeigen"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          {canWrite && (
            <Button size="sm" variant="primary" onClick={() => setShowForm((open) => !open)}>
              {showForm ? 'Formular schließen' : 'Dokument hochladen'}
            </Button>
          )}
        </div>
      </div>

      {capabilities !== null && (
        <div className="rounded-lg border border-border-subtle bg-surface-sunken p-3.5">
          <p className="flex items-center gap-2 text-xs font-medium text-text-secondary">
            <Lock className="size-3.5" aria-hidden />
            Privat abgelegt
          </p>
          <p className="mt-1 text-[11px] leading-snug text-text-muted">{capabilities.note}</p>
          {!capabilities.malwareScanning && (
            <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-warning">
              <ShieldQuestion className="mt-0.5 size-3 shrink-0" aria-hidden />
              Es ist kein Malware-Scanner angebunden. Dokumente werden als
              &bdquo;nicht geprüft&ldquo; geführt &mdash; nicht als sicher.
            </p>
          )}
        </div>
      )}

      {showForm && canWrite && (
        <form
          onSubmit={upload}
          className="space-y-3 rounded-lg border border-border-subtle bg-surface-sunken p-4"
        >
          <p className="text-[11px] leading-snug text-text-muted">
            Erlaubt: {describeAllowedTypes()}. Höchstens{' '}
            {Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB. Keine ausführbaren Dateien.
          </p>

          <input
            type="file"
            name="file"
            required
            accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg"
            className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-surface-raised file:px-3 file:py-2 file:text-sm file:font-medium file:text-text-primary"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Dokumentart *" htmlFor="document-type">
              <Select
                id="document-type"
                name="credentialType"
                defaultValue="certificate"
                options={CREDENTIAL_TYPES.map((type) => ({
                  value: type,
                  label: CREDENTIAL_TYPE_LABELS[type],
                }))}
              />
            </Field>
            <Field label="Vertraulichkeit" htmlFor="document-confidentiality">
              <Select
                id="document-confidentiality"
                name="confidentiality"
                defaultValue="confidential"
                options={CONFIDENTIALITY_LEVELS.map((level) => ({
                  value: level,
                  label: CONFIDENTIALITY_LEVEL_LABELS[level],
                }))}
              />
            </Field>
            <Field label="Titel" htmlFor="document-title">
              <Input id="document-title" name="title" />
            </Field>
            <Field label="Aussteller" htmlFor="document-issuer">
              <Input id="document-issuer" name="issuer" />
            </Field>
            <Field label="Dokumentnummer" htmlFor="document-number">
              <Input id="document-number" name="documentNumber" />
            </Field>
            <Field label="Gültig von" htmlFor="document-from">
              <Input id="document-from" name="validFrom" type="date" />
            </Field>
            <Field
              label="Gültig bis"
              htmlFor="document-until"
              hint="Leer lassen, wenn kein Ablaufdatum bekannt ist — es wird keines geschätzt."
            >
              <Input id="document-until" name="validUntil" type="date" />
            </Field>
            <Field label="Notiz" htmlFor="document-note" className="sm:col-span-2">
              <Input id="document-note" name="note" />
            </Field>
          </div>

          {messages.length > 0 && (
            <ul className="space-y-1 text-[11px] text-danger">
              {messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" variant="primary" disabled={pending}>
              {pending ? 'Wird hochgeladen …' : 'Hochladen'}
            </Button>
            {progress !== null && (
              <span className="text-[11px] text-text-muted">{progress}</span>
            )}
          </div>
        </form>
      )}

      {error !== null && (
        <p
          role="alert"
          className="rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      <TableContainer>
        <Table className="min-w-[56rem]">
          <TableHead>
            <TableRow className="hover:bg-transparent">
              <TableHeaderCell className="min-w-[14rem]">Datei</TableHeaderCell>
              <TableHeaderCell>Art</TableHeaderCell>
              <TableHeaderCell>Vertraulichkeit</TableHeaderCell>
              <TableHeaderCell>Gültig bis</TableHeaderCell>
              <TableHeaderCell>Zustand</TableHeaderCell>
              <TableHeaderCell>Scan</TableHeaderCell>
              <TableHeaderCell align="right">Größe</TableHeaderCell>
              <TableHeaderCell>Aktionen</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableEmpty colSpan={8}>Dokumente werden geladen …</TableEmpty>
            ) : documents.length === 0 ? (
              <TableEmpty colSpan={8}>Keine Dokumente hinterlegt.</TableEmpty>
            ) : (
              documents.map((document) => {
                const state = classifyCredential({
                  credentialType: document.credentialType,
                  validUntil: document.validUntil,
                  reviewStatus: document.reviewStatus,
                });

                return (
                  <TableRow key={document.id}>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm text-text-primary">
                        <FileText className="size-3.5 shrink-0 text-text-muted" aria-hidden />
                        {document.originalFileName ?? document.fileName}
                      </span>
                      {document.title !== null && (
                        <span className="block text-[11px] text-text-muted">
                          {document.title}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {CREDENTIAL_TYPE_LABELS[document.credentialType]}
                    </TableCell>
                    <TableCell className="text-xs">
                      {CONFIDENTIALITY_LEVEL_LABELS[document.confidentiality]}
                    </TableCell>
                    <TableCell className="tabular text-xs whitespace-nowrap">
                      {formatDate(document.validUntil)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge
                          tone={
                            state === 'valid'
                              ? 'success'
                              : state === 'expiring'
                                ? 'warning'
                                : state === 'expired' || state === 'rejected'
                                  ? 'danger'
                                  : 'neutral'
                          }
                          title={CREDENTIAL_STATE_DESCRIPTIONS[state]}
                        >
                          {CREDENTIAL_STATE_LABELS[state]}
                        </Badge>
                        {document.lifecycle === 'archived' && (
                          <Badge tone={LIFECYCLE_TONE.archived}>Archiviert</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        tone={document.scanStatus === 'infected' ? 'danger' : 'neutral'}
                        title={SCAN_STATUS_LABELS[document.scanStatus]}
                      >
                        {document.scanStatus === 'not_scanned'
                          ? 'nicht verfügbar'
                          : SCAN_STATUS_LABELS[document.scanStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell align="right" className="tabular text-xs">
                      {formatSize(document.fileSize)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" onClick={() => void download(document.id)}>
                          <Download className="size-3.5" aria-hidden />
                          Herunterladen
                        </Button>
                        {canWrite && document.lifecycle === 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => void mutate(document.id, 'archive')}
                          >
                            Archivieren
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={pending}
                            onClick={() => void mutate(document.id, 'delete')}
                          >
                            Löschen
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-text-muted">
        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
        Downloads laufen über kurzlebige signierte Links. Es gibt keine dauerhafte
        öffentliche Adresse für eine dieser Dateien.
      </p>
    </div>
  );
}
