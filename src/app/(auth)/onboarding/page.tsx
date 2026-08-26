import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/auth/onboarding-form';
import { Card, CardBody } from '@/components/ui/card';
import { getAuthState } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Organisation anlegen' };

// Depends on the session, so it must never be prerendered: a build-time
// render has no request and would either bake in a wrong answer or, in
// production, fail on the deliberate "no Supabase configured" error.
export const dynamic = 'force-dynamic';

/**
 * The one screen a signed-in user without an organisation can reach.
 *
 * Not a public sign-up: an anonymous visitor is sent to the login screen, and
 * a user who already belongs to an organisation is sent to the dashboard.
 * External partner firms never reach this page — they have no account
 * (CLAUDE.md § 11).
 */
export default async function OnboardingPage() {
  const state = await getAuthState();

  if (state.kind === 'anonymous') {
    redirect('/login');
  }

  if (state.kind === 'session') {
    redirect('/dashboard');
  }

  return (
    <Card>
      <CardBody className="space-y-5">
        <div>
          <h1 className="text-base font-semibold text-text-primary">
            Organisation anlegen
          </h1>
          <p className="mt-1 text-xs text-text-secondary">
            Ihr Konto ({state.profile.email}) gehört noch zu keiner
            Organisation. Legen Sie sie jetzt an — Sie werden dabei
            Organisations-Admin.
          </p>
        </div>

        <OnboardingForm />

        <p className="text-[11px] text-text-muted">
          Alle Geschäftsdaten gehören ausschließlich dieser Organisation.
          Weitere Mitglieder laden Sie später in der Verwaltung ein.
        </p>
      </CardBody>
    </Card>
  );
}
