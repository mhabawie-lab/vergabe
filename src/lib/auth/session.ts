/**
 * Session resolution and authorisation.
 *
 * Pages and route handlers ask for a `SessionContext` and check permissions
 * against it. This is the second of the two enforcement layers — Supabase RLS
 * is the first (CLAUDE.md § Sicherheit & Secrets).
 *
 * Server-only.
 */

import 'server-only';

import { redirect } from 'next/navigation';
import { resolveBackend } from '@/lib/env';
import { ForbiddenError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  isRole,
  ROLE_PERMISSIONS,
  type Permission,
  type Role,
} from '@/config/roles';
import type {
  Organization,
  OrganizationMembership,
  Profile,
  SessionContext,
} from '@/types/auth';

/**
 * The session used when Supabase is not configured.
 *
 * Local demo mode only: it lets the application be reviewed end to end
 * without credentials. Everything it exposes is demo data, which the UI
 * labels as such. It is unreachable as soon as Supabase is configured.
 */
const DEMO_ORGANIZATION: Organization = {
  id: '00000000-0000-4000-8000-0000000000d1',
  name: 'DEMO Sicherheitsdienste GmbH',
  slug: 'demo',
  legalForm: 'GmbH',
  city: 'Musterstadt',
  countryCode: 'DE',
  isDemo: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const DEMO_PROFILE: Profile = {
  id: '00000000-0000-4000-8000-0000000000d2',
  email: 'demo@sichervergabe.invalid',
  fullName: 'Demo-Benutzer',
  jobTitle: 'Bid Manager',
  phone: null,
  isPlatformAdmin: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const DEMO_MEMBERSHIP: OrganizationMembership = {
  id: '00000000-0000-4000-8000-0000000000d3',
  organizationId: DEMO_ORGANIZATION.id,
  userId: DEMO_PROFILE.id,
  role: 'super_admin',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const DEMO_SESSION: SessionContext = {
  profile: DEMO_PROFILE,
  organization: DEMO_ORGANIZATION,
  membership: DEMO_MEMBERSHIP,
  role: 'super_admin',
  permissions: ROLE_PERMISSIONS.super_admin,
};

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  job_title: string | null;
  phone: string | null;
  is_platform_admin: boolean;
  created_at: string;
  updated_at: string;
}

interface MembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  created_at: string;
  organizations: {
    id: string;
    name: string;
    slug: string;
    legal_form: string | null;
    city: string | null;
    country_code: string | null;
    is_demo: boolean;
    created_at: string;
    updated_at: string;
  } | null;
}

/**
 * What the request knows about the caller.
 *
 * Three states, not two. A signed-in user without an organisation used to be
 * indistinguishable from an anonymous one, which sent them back to the login
 * screen they had just passed. `onboarding` is that missing state.
 */
export type AuthState =
  | { kind: 'anonymous' }
  | { kind: 'onboarding'; profile: Profile }
  | { kind: 'session'; session: SessionContext };

/**
 * Resolves the current session, or null when nobody is signed in.
 *
 * A signed-in user without an organisation membership also yields null: the
 * application is tenant-scoped, so there is nothing they could act on. Use
 * `getAuthState()` where that difference matters.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const state = await getAuthState();
  return state.kind === 'session' ? state.session : null;
}

/** Resolves the full three-state view of the caller. */
export async function getAuthState(): Promise<AuthState> {
  // Follows the resolved backend rather than "is Supabase configured": with
  // DATA_BACKEND=memory the app is deliberately offline, and with
  // DATA_BACKEND=supabase a missing configuration must raise, not hand out a
  // super-admin session.
  if (resolveBackend().backend === 'memory') {
    return { kind: 'session', session: DEMO_SESSION };
  }

  const client = await createServerSupabaseClient();
  const { data: userData, error: userError } = await client.auth.getUser();

  if (userError !== null || userData.user === null) {
    return { kind: 'anonymous' };
  }

  const [profileResult, membershipResult] = await Promise.all([
    client.from('profiles').select('*').eq('id', userData.user.id).maybeSingle(),
    client
      .from('organization_members')
      .select('*, organizations ( * )')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const profileRow = (profileResult.data ?? null) as ProfileRow | null;
  const membershipRow = (membershipResult.data ?? null) as MembershipRow | null;

  if (profileRow === null) {
    // A profile is created by a trigger on auth.users, so its absence is a
    // fault, not a state to onboard out of.
    logger.warn('Angemeldeter Benutzer ohne Profil', {
      scope: 'auth',
      userId: userData.user.id,
    });
    return { kind: 'anonymous' };
  }

  const profile: Profile = {
    id: profileRow.id,
    email: profileRow.email,
    fullName: profileRow.full_name,
    jobTitle: profileRow.job_title,
    phone: profileRow.phone,
    isPlatformAdmin: profileRow.is_platform_admin,
    createdAt: profileRow.created_at,
    updatedAt: profileRow.updated_at,
  };

  if (membershipRow === null || membershipRow.organizations === null) {
    // Signed in, but belongs nowhere yet: the one state onboarding exists for.
    return { kind: 'onboarding', profile };
  }

  // Platform staff always act as super_admin, whatever the membership says.
  const membershipRole: Role = isRole(membershipRow.role)
    ? membershipRow.role
    : 'viewer';
  const role: Role = profileRow.is_platform_admin ? 'super_admin' : membershipRole;

  const organizationRow = membershipRow.organizations;

  const session: SessionContext = {
    profile,
    organization: {
      id: organizationRow.id,
      name: organizationRow.name,
      slug: organizationRow.slug,
      legalForm: organizationRow.legal_form,
      city: organizationRow.city,
      countryCode: organizationRow.country_code,
      isDemo: organizationRow.is_demo,
      createdAt: organizationRow.created_at,
      updatedAt: organizationRow.updated_at,
    },
    membership: {
      id: membershipRow.id,
      organizationId: membershipRow.organization_id,
      userId: membershipRow.user_id,
      role: membershipRole,
      createdAt: membershipRow.created_at,
    },
    role,
    permissions: ROLE_PERMISSIONS[role],
  };

  return { kind: 'session', session };
}

/**
 * Resolves the session, or redirects.
 *
 * Anonymous callers go to the login screen, signed-in callers without an
 * organisation to onboarding — never back to a screen they just passed.
 */
export async function requireSession(): Promise<SessionContext> {
  const state = await getAuthState();
  if (state.kind === 'anonymous') {
    redirect('/login');
  }
  if (state.kind === 'onboarding') {
    redirect('/onboarding');
  }
  return state.session;
}

export function hasPermission(
  session: SessionContext,
  permission: Permission,
): boolean {
  return session.permissions.includes(permission);
}

/**
 * Resolves the session and asserts a permission.
 *
 * @throws ForbiddenError when the role lacks the permission.
 */
export async function requirePermission(
  permission: Permission,
): Promise<SessionContext> {
  const session = await requireSession();

  if (!hasPermission(session, permission)) {
    logger.warn('Zugriff ohne ausreichende Berechtigung abgewiesen', {
      scope: 'auth',
      permission,
      role: session.role,
    });
    throw new ForbiddenError(
      `Die Rolle "${session.role}" besitzt die Berechtigung "${permission}" nicht.`,
    );
  }

  return session;
}

/** True when the session is the built-in demo session. */
export function isDemoSession(session: SessionContext): boolean {
  return session.profile.id === DEMO_PROFILE.id;
}
