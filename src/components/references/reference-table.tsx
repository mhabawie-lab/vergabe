import Link from 'next/link';
import { ServiceBadgeList } from './service-badges';
import { Badge, type BadgeTone } from '@/components/ui/badge';
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
import { formatShiftSummary } from '@/modules/references/shift-format';
import {
  REFERENCE_PROJECT_STATUS_LABELS,
  type ReferenceProjectListItem,
  type ReferenceProjectStatus,
} from '@/types/reference';

const STATUS_TONES: Record<ReferenceProjectStatus, BadgeTone> = {
  planned: 'info',
  active: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  unknown: 'neutral',
};

/**
 * Shared table for reference projects.
 *
 * The shift column shows the source value verbatim — no derived figure, since
 * the meaning of its numbers is unconfirmed.
 */
export function ReferenceTable({
  projects,
  emptyMessage = 'Keine Referenzen gefunden.',
  showClient = true,
}: {
  projects: readonly ReferenceProjectListItem[];
  emptyMessage?: string;
  showClient?: boolean;
}) {
  const columnCount = showClient ? 9 : 8;

  return (
    <TableContainer>
      <Table className="min-w-[62rem]">
        <TableHead>
          <TableRow className="hover:bg-transparent">
            <TableHeaderCell>Objekt-Nr.</TableHeaderCell>
            <TableHeaderCell className="min-w-[16rem]">Projektname</TableHeaderCell>
            {showClient && <TableHeaderCell>Kunde</TableHeaderCell>}
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
            projects.map((project) => (
              <TableRow key={project.id}>
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
                {showClient && (
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
                )}
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
                  {project.hasUnconfirmedServices ? (
                    <Badge tone="warning" title="Mindestens eine Leistungsart ist noch ein Vorschlag">
                      Prüfung offen
                    </Badge>
                  ) : (
                    <Badge tone="success">Bestätigt</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
