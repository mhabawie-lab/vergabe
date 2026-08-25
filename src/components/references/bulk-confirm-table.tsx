'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ServiceBadgeList } from './service-badges';
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
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';
import { formatShiftSummary } from '@/modules/references/shift-format';
import {
  BULK_CONFIRM_NOTE,
  SERVICE_NOTE_MAX_LENGTH,
  canBulkConfirm,
} from '@/modules/references/confirmation';
import {
  REFERENCE_PROJECT_STATUS_LABELS,
  REFERENCE_SERVICE_CATEGORY_LABELS,
  type ReferenceProjectListItem,
  type ReferenceProjectStatus,
  type ReferenceServiceCategory,
} from '@/types/reference';

/**
 * Reference list with optional bulk confirmation.
 *
 * Selecting rows asserts something about several customer references at once,
 * so the control only unlocks when the selection is genuinely unambiguous: one
 * open proposal per project, all of the same category, never `unknown`. The
 * same rule runs again on the server — this is convenience, not the guard.
 */

const STATUS_TONES: Record<ReferenceProjectStatus, BadgeTone> = {
  planned: 'info',
  active: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  unknown: 'neutral',
};

interface BulkConfirmTableProps {
  projects: readonly ReferenceProjectListItem[];
  canEdit: boolean;
  emptyMessage?: string;
}

export function BulkConfirmTable({
  projects,
  canEdit,
  emptyMessage = 'Keine Referenzen gefunden.',
}: BulkConfirmTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);
  /** One note for the whole selection; stored on each confirmed entry. */
  const [note, setNote] = useState('');

  /**
   * Only projects with exactly one open proposal are selectable. A project
   * with several open proposals needs an individual decision per service —
   * one checkbox cannot express that.
   */
  const selectable = useMemo(() => {
    const map = new Map<
      string,
      { serviceId: string; serviceCategory: ReferenceServiceCategory }
    >();
    for (const project of projects) {
      const [proposal] = project.openProposals;
      if (project.openProposals.length !== 1 || proposal === undefined) continue;
      if (proposal.serviceCategory === 'unknown') continue;
      map.set(project.id, proposal);
    }
    return map;
  }, [projects]);

  const selectedServices = useMemo(
    () =>
      [...selected]
        .map((projectId) => selectable.get(projectId))
        .filter(
          (
            entry,
          ): entry is { serviceId: string; serviceCategory: ReferenceServiceCategory } =>
            entry !== undefined,
        )
        .map((entry) => ({
          serviceCategory: entry.serviceCategory,
          confirmationStatus: 'proposed' as const,
          serviceId: entry.serviceId,
        })),
    [selected, selectable],
  );

  const check = canBulkConfirm(selectedServices);
  const selectedCategory = selectedServices[0]?.serviceCategory ?? null;

  function toggle(projectId: string): void {
    setConfirmedCount(null);
    setError(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  async function confirmSelection(): Promise<void> {
    if (!check.allowed) return;

    setError(null);
    setPending(true);

    try {
      const response = await fetch('/api/v1/references/services/bulk-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceIds: selectedServices.map((entry) => entry.serviceId),
          confirmed: true,
          note: note.trim().length > 0 ? note.trim() : null,
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Die Sammelbestätigung ist fehlgeschlagen.')
            : 'Die Sammelbestätigung ist fehlgeschlagen.';
        setError(message);
        return;
      }

      const result = data as { confirmed: number };
      setConfirmedCount(result.confirmed);
      setSelected(new Set());
      setNote('');
      router.refresh();
    } catch {
      setError('Die Sammelbestätigung ist fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }

  const showSelection = canEdit && selectable.size > 0;
  const columnCount = showSelection ? 10 : 9;

  return (
    <div>
      {/* Outside the selection block on purpose: confirming the last open
          proposal removes that block, and the user would be left without any
          confirmation that anything happened. */}
      {(error !== null || confirmedCount !== null) && (
        <div className="flex flex-col gap-2 border-b border-border-subtle px-4 py-3">
          {error !== null && (
            <p
              role="alert"
              className="rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-xs text-danger"
            >
              {error}
            </p>
          )}
          {confirmedCount !== null && (
            <p className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-xs text-success">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {confirmedCount === 1
                ? '1 Leistungsart bestätigt.'
                : `${confirmedCount} Leistungsarten bestätigt.`}
            </p>
          )}
        </div>
      )}

      {showSelection && (
        <div className="flex flex-col gap-2 border-b border-border-subtle px-4 py-3">
          <p className="text-[11px] leading-snug text-text-muted">
            {BULK_CONFIRM_NOTE}
          </p>

          {selected.size > 0 && (
            <div className="flex flex-col gap-2">
              <div className="max-w-2xl">
                <label
                  htmlFor="bulk-confirm-note"
                  className="mb-1 block text-[11px] font-medium text-text-secondary"
                >
                  Interne Notiz für alle ausgewählten Einträge (optional)
                </label>
                <textarea
                  id="bulk-confirm-note"
                  rows={2}
                  maxLength={SERVICE_NOTE_MAX_LENGTH}
                  value={note}
                  disabled={pending}
                  placeholder="Warum werden diese Vorschläge bestätigt?"
                  onChange={(event) => setNote(event.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-xs text-text-primary placeholder:text-text-muted transition-colors focus:border-brand focus:outline-none disabled:opacity-60"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-text-secondary">
                  {selected.size} ausgewählt
                  {selectedCategory !== null &&
                    ` · ${REFERENCE_SERVICE_CATEGORY_LABELS[selectedCategory]}`}
                </span>
                {check.allowed ? (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={pending}
                    onClick={() => void confirmSelection()}
                  >
                    {pending
                      ? 'Wird bestätigt …'
                      : `${selected.size} Vorschläge verbindlich bestätigen`}
                  </Button>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-warning">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    {check.reason}
                  </span>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Auswahl aufheben
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <TableContainer>
        <Table className="min-w-[66rem]">
          <TableHead>
            <TableRow className="hover:bg-transparent">
              {showSelection && <TableHeaderCell className="w-10">Wahl</TableHeaderCell>}
              <TableHeaderCell>Objekt-Nr.</TableHeaderCell>
              <TableHeaderCell className="min-w-[16rem]">Projektname</TableHeaderCell>
              <TableHeaderCell>Kunde</TableHeaderCell>
              <TableHeaderCell>Objektart</TableHeaderCell>
              <TableHeaderCell>Standort</TableHeaderCell>
              <TableHeaderCell>Leistungsarten</TableHeaderCell>
              <TableHeaderCell>Schichten</TableHeaderCell>
              <TableHeaderCell>Projektstatus</TableHeaderCell>
              <TableHeaderCell>Referenzstatus</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.length === 0 ? (
              <TableEmpty colSpan={columnCount}>{emptyMessage}</TableEmpty>
            ) : (
              projects.map((project) => {
                const proposal = selectable.get(project.id);
                const isSelected = selected.has(project.id);

                return (
                  <TableRow
                    key={project.id}
                    className={cn(isSelected && 'bg-brand-subtle/40')}
                  >
                    {showSelection && (
                      <TableCell>
                        {proposal === undefined ? (
                          <span
                            className="text-text-muted"
                            title="Nicht sammelbestätigbar: kein einzelner eindeutiger Vorschlag"
                            aria-label="Nicht sammelbestätigbar"
                          >
                            —
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            className="size-4 rounded border-border-strong accent-[var(--brand)]"
                            checked={isSelected}
                            onChange={() => toggle(project.id)}
                            aria-label={`${project.projectName} auswählen`}
                          />
                        )}
                      </TableCell>
                    )}

                    <TableCell className="tabular text-xs whitespace-nowrap">
                      {project.externalObjectNumber ?? '—'}
                    </TableCell>

                    <TableCell className="max-w-[24rem]">
                      <Link
                        href={`/references/${project.id}`}
                        className="text-sm font-medium text-text-primary hover:text-accent hover:underline"
                      >
                        {project.projectName}
                      </Link>
                      {(project.startDate !== null || project.endDate !== null) && (
                        <span className="tabular mt-0.5 block text-[11px] text-text-muted">
                          {formatDate(project.startDate)} – {formatDate(project.endDate)}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="max-w-[14rem]">
                      {project.businessClientId === null ? (
                        <span className="text-xs text-text-muted">—</span>
                      ) : (
                        <Link
                          href={`/customers/${project.businessClientId}`}
                          className="line-clamp-2 text-xs hover:text-accent hover:underline"
                        >
                          {project.businessClientName ?? '—'}
                        </Link>
                      )}
                    </TableCell>

                    <TableCell className="text-xs">{project.objectType ?? '—'}</TableCell>

                    <TableCell className="text-xs whitespace-nowrap">
                      {project.city ?? '—'}
                      {project.region !== null && (
                        <span className="block text-[11px] text-text-muted">
                          {project.region}
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <ServiceBadgeList
                        categories={project.serviceCategories}
                        hasUnconfirmed={project.hasUnconfirmedServices}
                      />
                    </TableCell>

                    <TableCell
                      className="tabular text-xs whitespace-nowrap"
                      title="Originalwert aus der Quelle. Die Bedeutung der Zahlen ist nicht bestätigt."
                    >
                      {formatShiftSummary(project.shiftSummaryRaw)}
                    </TableCell>

                    <TableCell>
                      <Badge tone={STATUS_TONES[project.projectStatus]}>
                        {REFERENCE_PROJECT_STATUS_LABELS[project.projectStatus]}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {project.confirmedServiceCategories.length > 0 ? (
                        <Badge tone="success" title="Mindestens eine bestätigte Leistung">
                          Bestätigt
                        </Badge>
                      ) : project.hasOnlyProposals ? (
                        <Badge
                          tone="warning"
                          title="Nur unbestätigte Vorschläge — zählt noch nicht als Nachweis"
                        >
                          Nur Vorschläge
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Ohne Nachweis</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
