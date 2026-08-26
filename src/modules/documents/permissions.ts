/**
 * Which permission a document requires, by owner.
 *
 * Kept in one place because the answer has to be identical in the route
 * handler, in the page that decides whether to render an upload form, and in
 * the tests. Three copies of this mapping would drift, and the drift would be
 * invisible until somebody saw a document they should not have.
 */

import type { Permission } from '@/config/roles';
import type { DocumentOwnerType } from './storage';

export interface DocumentPermissions {
  read: Permission;
  write: Permission;
  /** Deleting the file itself, not archiving it. */
  destroy: Permission;
}

export function permissionsFor(ownerType: DocumentOwnerType): DocumentPermissions {
  switch (ownerType) {
    case 'partner_company':
      // Partner paperwork is a third party's; its own permission gates it.
      return {
        read: 'subcontractors:documents',
        write: 'subcontractors:documents',
        destroy: 'subcontractors:admin',
      };
    case 'organization':
      // Our own certificates: administered by the organisation's admins.
      return { read: 'company:read', write: 'company:write', destroy: 'company:write' };
    default:
      return {
        read: 'references:read',
        write: 'references:write',
        destroy: 'clients:write',
      };
  }
}

/**
 * Whether a role may see the *file*, as opposed to the metadata row.
 *
 * A viewer may know that a certificate exists and when it expires — that is
 * what the expiry monitor is for — without being able to open a third party's
 * insurance policy.
 */
export function canDownload(
  ownerType: DocumentOwnerType,
  permissions: readonly Permission[],
): boolean {
  return permissions.includes(permissionsFor(ownerType).read);
}
