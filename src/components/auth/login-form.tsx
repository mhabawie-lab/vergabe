'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';

/**
 * Email and password sign-in against Supabase Auth.
 *
 * Only rendered when Supabase is configured; the page shows an explanatory
 * notice otherwise.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const client = getBrowserSupabaseClient();
    if (client === null) {
      setError('Supabase ist nicht konfiguriert.');
      return;
    }

    setPending(true);
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    setPending(false);

    if (signInError !== null) {
      // Deliberately generic: never reveal whether the address exists.
      setError('Anmeldung fehlgeschlagen. Bitte prüfen Sie Ihre Zugangsdaten.');
      return;
    }

    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="E-Mail-Adresse" htmlFor="email">
        <Input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <Field label="Passwort" htmlFor="password">
        <Input
          id="password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      {error !== null && (
        <p
          role="alert"
          className="rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? 'Anmeldung läuft …' : 'Anmelden'}
      </Button>
    </form>
  );
}
