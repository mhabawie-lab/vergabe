/**
 * The subcontracting chain.
 *
 * Our organisation engages a partner, that partner may engage another, and so
 * on. The point of recording it is transparency: when a client asks who is
 * actually standing at their gate, the answer has to be traceable.
 *
 * Two rules keep the structure sound, and both are enforced here *and* in the
 * database (`0012_partner_rls_audit.sql`) — a client-side-only rule would be
 * no rule at all:
 *
 *   * No cycles. A link that closes a loop makes the tree non-terminating.
 *   * A bounded depth. Beyond `MAX_CHAIN_DEPTH` a chain is almost always a
 *     data error, and walking an unbounded user-supplied structure is a way
 *     to hang the server.
 *
 * A blocked partner stays in a chain it is already part of. Removing them
 * would rewrite history: they *were* on that site, and the record of who was
 * there must not change because of a decision made later.
 */

import {
  MAX_CHAIN_DEPTH,
  type AssignmentTreeNode,
  type SubcontractorAssignment,
} from '@/types/partner';

export class ChainRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChainRuleError';
  }
}

export interface ChainValidationInput {
  /** Id of the assignment being created or edited; null when creating. */
  assignmentId: string | null;
  parentAssignmentId: string | null;
  /** Every assignment of the organisation, for walking the existing chain. */
  existing: readonly Pick<
    SubcontractorAssignment,
    'id' | 'parentAssignmentId' | 'chainLevel' | 'partnerCompanyId'
  >[];
}

export interface ChainValidationResult {
  /** Level the assignment will sit at. 1 = engaged directly by us. */
  chainLevel: number;
}

/**
 * Checks a parent link and computes the resulting level.
 *
 * @throws ChainRuleError when the link would close a cycle or exceed the depth.
 */
export function validateChainLink(
  input: ChainValidationInput,
): ChainValidationResult {
  if (input.parentAssignmentId === null) {
    return { chainLevel: 1 };
  }

  if (input.parentAssignmentId === input.assignmentId) {
    throw new ChainRuleError('Eine Zuordnung darf sich nicht selbst übergeordnet sein.');
  }

  const byId = new Map(input.existing.map((entry) => [entry.id, entry]));
  const parent = byId.get(input.parentAssignmentId);

  if (parent === undefined) {
    // Deliberately the same message a foreign id gets: the difference would
    // reveal that the id exists in another organisation.
    throw new ChainRuleError('Die übergeordnete Zuordnung existiert nicht.');
  }

  // Walk up from the parent. If we meet the assignment being edited, the link
  // would close a loop. Bounded so inconsistent stored data cannot spin here.
  let cursor: string | null = parent.id;
  let hops = 0;
  while (cursor !== null && hops <= MAX_CHAIN_DEPTH + 1) {
    if (input.assignmentId !== null && cursor === input.assignmentId) {
      throw new ChainRuleError(
        'Diese Zuordnung ist der übergeordneten bereits übergeordnet — das ergäbe einen Kreis.',
      );
    }
    cursor = byId.get(cursor)?.parentAssignmentId ?? null;
    hops += 1;
  }

  const chainLevel = parent.chainLevel + 1;
  if (chainLevel > MAX_CHAIN_DEPTH) {
    throw new ChainRuleError(
      `Die Nachunternehmerkette ist auf ${MAX_CHAIN_DEPTH} Ebenen begrenzt.`,
    );
  }

  return { chainLevel };
}

export interface ChainNodeInput {
  assignment: SubcontractorAssignment;
  companyName: string;
  companyIsBlocked: boolean;
}

/**
 * Builds the chain as a tree.
 *
 * Assignments whose parent is missing (deleted, or outside the set handed in)
 * are attached at the root rather than dropped: an orphan is still a fact
 * about who was on site, and silently hiding it would defeat the purpose.
 */
export function buildChainTree(
  nodes: readonly ChainNodeInput[],
): AssignmentTreeNode[] {
  const byId = new Map<string, AssignmentTreeNode>();

  for (const node of nodes) {
    byId.set(node.assignment.id, {
      assignment: node.assignment,
      companyName: node.companyName,
      companyIsBlocked: node.companyIsBlocked,
      children: [],
    });
  }

  const roots: AssignmentTreeNode[] = [];

  for (const node of nodes) {
    const current = byId.get(node.assignment.id);
    if (current === undefined) continue;

    const parentId = node.assignment.parentAssignmentId;
    const parent = parentId === null ? undefined : byId.get(parentId);

    if (parent === undefined) {
      roots.push(current);
    } else {
      parent.children.push(current);
    }
  }

  const sortNodes = (list: AssignmentTreeNode[]): void => {
    list.sort((a, b) => {
      const byStart = (a.assignment.startDate ?? '').localeCompare(
        b.assignment.startDate ?? '',
      );
      if (byStart !== 0) return byStart;
      return a.companyName.localeCompare(b.companyName, 'de');
    });
    for (const entry of list) sortNodes(entry.children);
  };
  sortNodes(roots);

  return roots;
}

/** Flattens the tree for a table, keeping the visual depth. */
export function flattenChain(
  roots: readonly AssignmentTreeNode[],
  depth = 0,
): Array<{ node: AssignmentTreeNode; depth: number }> {
  const out: Array<{ node: AssignmentTreeNode; depth: number }> = [];
  for (const node of roots) {
    out.push({ node, depth });
    out.push(...flattenChain(node.children, depth + 1));
  }
  return out;
}

/**
 * Whether a partner may engage a further subcontractor under this assignment.
 *
 * `unknown` is treated as "not established" and reported, not as permission.
 */
export function mayAddChildAssignment(
  parent: Pick<SubcontractorAssignment, 'furtherSubcontractingAllowed'>,
): { allowed: boolean; reason: string } {
  switch (parent.furtherSubcontractingAllowed) {
    case 'allowed':
      return { allowed: true, reason: 'Weitere Untervergabe ist erlaubt.' };
    case 'not_allowed':
      return {
        allowed: false,
        reason: 'Für diese Zuordnung ist weitere Untervergabe ausdrücklich untersagt.',
      };
    default:
      return {
        allowed: false,
        reason:
          'Ob weitere Untervergabe erlaubt ist, wurde nicht festgehalten. Bitte zuerst klären.',
      };
  }
}
