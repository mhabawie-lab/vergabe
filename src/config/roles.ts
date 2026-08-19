/**
 * Roles and permissions.
 *
 * Authorisation is enforced twice: Supabase RLS guards data access, these
 * permissions guard actions in server code (CLAUDE.md § Sicherheit).
 * Roles are a named bundle of permissions so the matrix can grow without
 * touching call sites.
 */

export const ROLES = ['super_admin', 'org_admin', 'bid_manager', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super-Admin',
  org_admin: 'Organisations-Admin',
  bid_manager: 'Bid Manager',
  viewer: 'Betrachter',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin:
    'Plattformweite Administration: alle Organisationen, Datenquellen und Systemeinstellungen.',
  org_admin:
    'Verwaltet die eigene Organisation: Mitglieder, Rollen und Unternehmensprofil.',
  bid_manager:
    'Voller fachlicher Zugriff auf Ausschreibungen, Fristen, Kalkulation und Angebote.',
  viewer: 'Lesender Zugriff auf Ausschreibungen, Dashboard und Auswertungen.',
};

export const PERMISSIONS = [
  'tenders:read',
  'tenders:export',
  'favorites:write',
  'search_profiles:write',
  'company:read',
  'company:write',
  'calculation:read',
  'calculation:write',
  'documents:read',
  'members:read',
  'members:write',
  'sources:read',
  'sources:write',
  'admin:platform',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER_PERMISSIONS: readonly Permission[] = [
  'tenders:read',
  'company:read',
  'documents:read',
  'members:read',
];

const BID_MANAGER_PERMISSIONS: readonly Permission[] = [
  ...VIEWER_PERMISSIONS,
  'tenders:export',
  'favorites:write',
  'search_profiles:write',
  'calculation:read',
  'calculation:write',
  'sources:read',
];

const ORG_ADMIN_PERMISSIONS: readonly Permission[] = [
  ...BID_MANAGER_PERMISSIONS,
  'company:write',
  'members:write',
];

const SUPER_ADMIN_PERMISSIONS: readonly Permission[] = [
  ...ORG_ADMIN_PERMISSIONS,
  'sources:write',
  'admin:platform',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  viewer: VIEWER_PERMISSIONS,
  bid_manager: BID_MANAGER_PERMISSIONS,
  org_admin: ORG_ADMIN_PERMISSIONS,
  super_admin: SUPER_ADMIN_PERMISSIONS,
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
