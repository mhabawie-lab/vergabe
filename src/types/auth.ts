/**
 * Identity, organisation and membership types.
 *
 * SicherVergabe is multi-tenant: every business record belongs to an
 * organisation, and a user reaches it through an `OrganizationMembership`.
 */

import type { Permission, Role } from '@/config/roles';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  /** Legal form, e.g. "GmbH". */
  legalForm: string | null;
  city: string | null;
  countryCode: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Application-level user record, keyed by the Supabase auth user id. */
export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  jobTitle: string | null;
  phone: string | null;
  /** True only for platform staff; grants the `super_admin` role. */
  isPlatformAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  createdAt: string;
}

/**
 * Everything server components and route handlers need to authorise a
 * request: who the user is, which organisation they act for, and what
 * they may do.
 */
export interface SessionContext {
  profile: Profile;
  organization: Organization;
  membership: OrganizationMembership;
  role: Role;
  permissions: readonly Permission[];
}
