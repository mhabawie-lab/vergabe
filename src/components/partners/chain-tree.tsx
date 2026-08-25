import Link from 'next/link';
import { CornerDownRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/format';
import { flattenChain } from '@/modules/partners/chain';
import {
  ASSIGNMENT_ROLE_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  type AssignmentTreeNode,
} from '@/types/partner';

/**
 * The subcontracting chain as an indented tree.
 *
 * Level 1 is engaged by us; each further level is engaged by the one above.
 * A blocked partner is shown as blocked but is never removed: the record of
 * who was on a site must not change because of a decision made afterwards.
 */
export function ChainTree({
  nodes,
  emptyMessage,
}: {
  nodes: readonly AssignmentTreeNode[];
  emptyMessage: string;
}) {
  const rows = flattenChain(nodes);

  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">{emptyMessage}</p>;
  }

  return (
    <ol className="space-y-1.5">
      <li className="text-xs font-medium text-text-secondary">Unser Unternehmen</li>
      {rows.map(({ node, depth }) => (
        <li
          key={node.assignment.id}
          className="flex items-start gap-2 rounded-lg border border-border-subtle p-3"
          style={{ marginLeft: `${(depth + 1) * 1.25}rem` }}
        >
          <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/subcontractors/${node.assignment.partnerCompanyId}`}
                className="text-sm font-medium text-text-primary hover:text-accent hover:underline"
              >
                {node.companyName}
              </Link>
              <Badge tone="neutral">
                {ASSIGNMENT_ROLE_LABELS[node.assignment.role]}
              </Badge>
              <Badge tone={node.assignment.status === 'active' ? 'success' : 'neutral'}>
                {ASSIGNMENT_STATUS_LABELS[node.assignment.status]}
              </Badge>
              {node.companyIsBlocked && (
                <Badge tone="danger" title="Inzwischen gesperrt — bleibt historisch sichtbar">
                  Gesperrt
                </Badge>
              )}
              <span className="text-[11px] text-text-muted">
                Ebene {node.assignment.chainLevel}
              </span>
            </div>
            <p className="tabular mt-1 text-[11px] text-text-muted">
              {formatDate(node.assignment.startDate)} – {formatDate(node.assignment.endDate)}
              {node.assignment.staffCount !== null &&
                ` · ${node.assignment.staffCount} Mitarbeiter`}
            </p>
            {node.assignment.scope !== null && (
              <p className="mt-1 text-xs text-text-secondary">{node.assignment.scope}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
