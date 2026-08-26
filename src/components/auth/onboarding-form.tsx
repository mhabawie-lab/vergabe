'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  suggestOrganizationSlug,
  validateOnboardingInput,
  type OnboardingIssue,
} from '@/modules/organizations/onboarding';

/**
 * Creates the first organisation for a newly signed-up user.
 *
 * The slug is proposed from the name while the user has not edited it — a
 * proposal, not a correction: once they touch the field, nothing overwrites
 * their value (CLAUDE.md § 10).
 */
export function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [legalForm, setLegalForm] = useState('');
  const [city, setCity] = useState('');
  const [issues, setIssues] = useState<OnboardingIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleNameChange(value: string): void {
    setName(value);
    if (!slugEdited) {
      setSlug(suggestOrganizationSlug(value));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const found = validateOnboardingInput({ name, slug });
    setIssues(found);
    if (found.length > 0) {
      return;
    }

    setPending(true);
    const response = await fetch('/api/v1/onboarding/organization', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        legalForm: legalForm.trim() === '' ? null : legalForm.trim(),
        city: city.trim() === '' ? null : city.trim(),
        countryCode: 'DE',
      }),
    });
    setPending(false);

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const message =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof (body as { error: { message?: unknown } }).error.message === 'string'
          ? (body as { error: { message: string } }).error.message
          : 'Die Organisation konnte nicht angelegt werden.';
      setError(message);
      return;
    }

    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Name der Organisation" htmlFor="organization-name">
        <Input
          id="organization-name"
          name="organization-name"
          required
          maxLength={ORGANIZATION_NAME_MAX_LENGTH}
          autoComplete="organization"
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
        />
      </Field>

      <Field
        label="Kennung"
        htmlFor="organization-slug"
        hint="Kleinbuchstaben, Ziffern und Bindestriche. Später nicht mehr änderbar."
      >
        <Input
          id="organization-slug"
          name="organization-slug"
          required
          value={slug}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value);
          }}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rechtsform (optional)" htmlFor="organization-legal-form">
          <Input
            id="organization-legal-form"
            name="organization-legal-form"
            value={legalForm}
            onChange={(event) => setLegalForm(event.target.value)}
          />
        </Field>

        <Field label="Ort (optional)" htmlFor="organization-city">
          <Input
            id="organization-city"
            name="organization-city"
            autoComplete="address-level2"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </Field>
      </div>

      {issues.length > 0 && (
        <ul
          role="alert"
          className="space-y-1 rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-xs text-danger"
        >
          {issues.map((issue) => (
            <li key={issue.field}>{issue.message}</li>
          ))}
        </ul>
      )}

      {error !== null && (
        <p
          role="alert"
          className="rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? 'Organisation wird angelegt …' : 'Organisation anlegen'}
      </Button>
    </form>
  );
}
