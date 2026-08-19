import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardBody } from '@/components/ui/card';
import { getSessionContext } from '@/lib/auth/session';
import { hasSupabaseClientConfig } from '@/lib/env';

export const metadata: Metadata = { title: 'Anmelden' };

export default async function LoginPage() {
  // Demo mode has no sign-in step: getSessionContext always resolves.
  const session = await getSessionContext();
  if (session !== null) {
    redirect('/dashboard');
  }

  return (
    <Card>
      <CardBody className="space-y-5">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Anmelden</h1>
          <p className="mt-1 text-xs text-text-secondary">
            Melden Sie sich mit Ihrer geschäftlichen E-Mail-Adresse an.
          </p>
        </div>

        {hasSupabaseClientConfig() ? (
          <LoginForm />
        ) : (
          <p className="rounded-lg border border-warning/25 bg-warning-subtle px-3 py-2.5 text-xs text-warning">
            Supabase ist nicht konfiguriert. Die Anwendung läuft im lokalen
            DEMO-Modus ohne Anmeldung. Hinterlegen Sie
            NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY, um die
            Authentifizierung zu aktivieren.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
