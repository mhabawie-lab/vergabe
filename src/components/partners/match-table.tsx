'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
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
import {
  MATCH_STATUSES,
  MATCH_STATUS_LABELS,
  type MatchComponent,
  type MatchStatus,
  type SubcontractorMatchListItem,
} from '@/types/partner';

/**
 * The match list for one need.
 *
 * Every score is shown with its components, so a user can see *why* a partner
 * ranks where it does and disagree with a specific line rather than with an
 * opaque number. Excluded partners stay in the list with their reason —
 * hiding them would leave people wondering where a company went.
 */
export function MatchTable({
  needId,
  matches,
  canEdit,
}: {
  needId: string;
  matches: readonly SubcontractorMatchListItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function recompute(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/v1/partners/needs/${needId}/matches`, {
        method: 'POST',
      });
      if (!response.ok) {
        setError('Die Matches konnten nicht berechnet werden.');
        return;
      }
      router.refresh();
    } catch {
      setError('Die Matches konnten nicht berechnet werden.');
    } finally {
      setPending(false);
    }
  }

  async function setStatus(matchId: string, status: MatchStatus): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/v1/partners/matches/${matchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Der Status konnte nicht gespeichert werden.')
            : 'Der Status konnte nicht gespeichert werden.';
        setError(message);
        return;
      }
      router.refresh();
    } catch {
      setError('Der Status konnte nicht gespeichert werden.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-3">
          <Button variant="primary" size="sm" disabled={pending} onClick={() => void recompute()}>
            {pending ? 'Wird berechnet …' : 'Matches neu berechnen'}
          </Button>
          <span className="text-[11px] text-text-muted">
            Deterministisch: gleiche Daten ergeben dasselbe Ergebnis.
          </span>
          {error !== null && <span className="text-[11px] text-danger">{error}</span>}
        </div>
      )}

      <TableContainer>
        <Table className="min-w-[56rem]">
          <TableHead>
            <TableRow className="hover:bg-transparent">
              <TableHeaderCell className="min-w-[16rem]">Partner</TableHeaderCell>
              <TableHeaderCell align="right">Score</TableHeaderCell>
              <TableHeaderCell>Bewertung</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              {canEdit && <TableHeaderCell>Entscheidung</TableHeaderCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {matches.length === 0 ? (
              <TableEmpty colSpan={canEdit ? 5 : 4}>
                Noch keine Matches berechnet.
              </TableEmpty>
            ) : (
              matches.map((match) => (
                <TableRow key={match.id}>
                  <TableCell>
                    <Link
                      href={`/subcontractors/${match.partnerCompanyId}`}
                      className="text-sm font-medium text-text-primary hover:text-accent hover:underline"
                    >
                      {match.companyName}
                    </Link>
                    {match.exclusionReason !== null && (
                      <p className="mt-1 text-[11px] text-danger">
                        Ausgeschlossen: {match.exclusionReason}
                      </p>
                    )}
                    {match.missingInformation.length > 0 && (
                      <p className="mt-1 text-[11px] text-warning">
                        {match.missingInformation.length} Angabe
                        {match.missingInformation.length === 1 ? '' : 'n'} fehlt
                      </p>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <span className="tabular text-sm font-semibold text-text-primary">
                      {match.exclusionReason === null ? `${match.totalScore} %` : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((current) => (current === match.id ? null : match.id))
                      }
                      className="text-xs text-accent hover:underline"
                    >
                      {expanded === match.id ? 'Begründung ausblenden' : 'Begründung anzeigen'}
                    </button>
                    {expanded === match.id && (
                      <ul className="mt-2 space-y-1.5">
                        {(match.reasoning as MatchComponent[]).map((component) => (
                          <li key={component.key} className="text-[11px]">
                            <span className="font-medium text-text-primary">
                              {component.label}
                            </span>{' '}
                            <span className="tabular text-text-secondary">
                              {component.points} / {component.weight}
                            </span>
                            <span className="block text-text-muted">
                              {component.reason}
                              {component.missingData && ' (Angabe fehlt)'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      tone={
                        match.status === 'shortlisted' || match.status === 'selected'
                          ? 'success'
                          : match.status === 'rejected'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {MATCH_STATUS_LABELS[match.status]}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Select
                        aria-label={`Status für ${match.companyName}`}
                        value={match.status}
                        disabled={pending}
                        onChange={(event) =>
                          void setStatus(match.id, event.target.value as MatchStatus)
                        }
                        options={MATCH_STATUSES.map((status) => ({
                          value: status,
                          label: MATCH_STATUS_LABELS[status],
                        }))}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
