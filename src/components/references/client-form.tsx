'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/form';
import {
  CLIENT_NAME_MAX_LENGTH,
  CLIENT_NOTES_MAX_LENGTH,
  validateClientInput,
  type ExistingClient,
} from '@/modules/references/client-validation';
import type { ValidationMessage } from '@/types/reference';

export interface ClientFormInitialValues {
  id: string;
  name: string;
  country: string | null;
  website: string | null;
  notes: string | null;
  isActive: boolean;
}

interface ClientFormProps {
  /** Present when editing, absent when creating. */
  client?: ClientFormInitialValues;
  /**
   * All clients of the organisation, name and comparison key only. Lets the
   * duplicate check run while typing; the server checks again before writing.
   */
  existingClients: readonly ExistingClient[];
}

/**
 * Create and edit form for a business client.
 *
 * The duplicate rule is the reason this is not a plain form post: a similar
 * name is a question, not a verdict. The first save attempt comes back with
 * the warning and nothing written; only a second, acknowledged attempt writes.
 * Merging customer records on a guess is not something a user can undo.
 */
export function ClientForm({ client, existingClients }: ClientFormProps) {
  const router = useRouter();
  const isEdit = client !== undefined;

  const [name, setName] = useState(client?.name ?? '');
  const [country, setCountry] = useState(client?.country ?? '');
  const [website, setWebsite] = useState(client?.website ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [isActive, setIsActive] = useState(client?.isActive ?? true);

  const [messages, setMessages] = useState<ValidationMessage[]>([]);
  const [needsAcknowledgement, setNeedsAcknowledgement] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const draft = useMemo(
    () => ({
      name,
      country: country.length > 0 ? country : null,
      website: website.length > 0 ? website : null,
      notes: notes.length > 0 ? notes : null,
      isActive,
    }),
    [name, country, website, notes, isActive],
  );

  // Live preview of the comparison form. Shown so the user can see why two
  // records count as the same customer — the rule is not hidden in the server.
  const preview = useMemo(
    () => validateClientInput(draft, existingClients, client?.id ?? null),
    [draft, existingClients, client?.id],
  );

  const shownMessages = messages.length > 0 ? messages : preview.messages;
  const errors = shownMessages.filter((message) => message.severity === 'error');
  const warnings = shownMessages.filter((message) => message.severity === 'warning');

  const messageFor = (field: string): ValidationMessage | undefined =>
    errors.find((message) => message.field === field);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setRequestError(null);
    setMessages([]);

    const local = validateClientInput(draft, existingClients, client?.id ?? null);
    if (!local.valid) {
      setMessages(local.messages);
      return;
    }

    setPending(true);
    try {
      const response = await fetch(
        isEdit ? `/api/v1/references/clients/${client.id}` : '/api/v1/references/clients',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...draft, acknowledgeDuplicateWarning: acknowledged }),
        },
      );

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Der Kunde konnte nicht gespeichert werden.')
            : 'Der Kunde konnte nicht gespeichert werden.';
        setRequestError(message);
        return;
      }

      const result = data as {
        saved: boolean;
        id?: string;
        requiresAcknowledgement?: boolean;
        messages?: ValidationMessage[];
      };

      if (!result.saved) {
        setMessages(result.messages ?? []);
        setNeedsAcknowledgement(result.requiresAcknowledgement === true);
        return;
      }

      router.push(`/customers/${result.id ?? client?.id ?? ''}`);
      router.refresh();
    } catch {
      setRequestError('Der Kunde konnte nicht gespeichert werden.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Firmenname *"
          htmlFor="client-name"
          hint={
            preview.normalized.normalizedName.length > 0
              ? `Vergleichsform: ${preview.normalized.normalizedName}`
              : 'Die Schreibweise bleibt unverändert erhalten.'
          }
          className="sm:col-span-2"
        >
          <Input
            id="client-name"
            name="name"
            required
            maxLength={CLIENT_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={messageFor('name') !== undefined}
          />
          {messageFor('name') !== undefined && (
            <p className="mt-1 text-[11px] text-danger">{messageFor('name')?.message}</p>
          )}
        </Field>

        <Field
          label="Land"
          htmlFor="client-country"
          hint="Zweistelliger Ländercode, z. B. DE. Wird nicht automatisch ergänzt."
        >
          <Input
            id="client-country"
            name="country"
            maxLength={2}
            value={country}
            onChange={(event) => setCountry(event.target.value.toUpperCase())}
            placeholder="DE"
            aria-invalid={messageFor('country') !== undefined}
          />
          {messageFor('country') !== undefined && (
            <p className="mt-1 text-[11px] text-danger">
              {messageFor('country')?.message}
            </p>
          )}
        </Field>

        <Field label="Website" htmlFor="client-website" hint="Ohne https:// genügt.">
          <Input
            id="client-website"
            name="website"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="beispiel.de"
            aria-invalid={messageFor('website') !== undefined}
          />
          {messageFor('website') !== undefined && (
            <p className="mt-1 text-[11px] text-danger">
              {messageFor('website')?.message}
            </p>
          )}
        </Field>

        <Field
          label="Interne Notizen"
          htmlFor="client-notes"
          hint={`Nur für Ihre Organisation sichtbar. Höchstens ${CLIENT_NOTES_MAX_LENGTH} Zeichen.`}
          className="sm:col-span-2"
        >
          <textarea
            id="client-notes"
            name="notes"
            rows={4}
            maxLength={CLIENT_NOTES_MAX_LENGTH}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-brand focus:outline-none"
          />
          {messageFor('notes') !== undefined && (
            <p className="mt-1 text-[11px] text-danger">{messageFor('notes')?.message}</p>
          )}
        </Field>

        <div className="sm:col-span-2">
          <Checkbox
            label="Kunde ist aktiv"
            name="isActive"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning-subtle px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="size-4" aria-hidden />
            Bitte prüfen
          </p>
          <ul className="mt-1 space-y-1 text-xs text-warning">
            {warnings.map((message) => (
              <li key={`${message.code}-${message.field ?? ''}`}>{message.message}</li>
            ))}
          </ul>
          {needsAcknowledgement && (
            <div className="mt-2">
              <Checkbox
                label="Ich habe geprüft, dass es sich um einen anderen Kunden handelt."
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
            </div>
          )}
        </div>
      )}

      {errors.length > 0 && messages.length > 0 && (
        <div className="rounded-xl border border-danger/25 bg-danger-subtle px-4 py-3">
          <ul className="space-y-1 text-xs text-danger">
            {errors.map((message) => (
              <li key={`${message.code}-${message.field ?? ''}`}>{message.message}</li>
            ))}
          </ul>
        </div>
      )}

      {requestError !== null && (
        <div className="rounded-xl border border-danger/25 bg-danger-subtle px-4 py-3 text-xs text-danger">
          {requestError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={pending || (needsAcknowledgement && !acknowledged)}
        >
          {pending
            ? 'Wird gespeichert …'
            : isEdit
              ? 'Änderungen speichern'
              : 'Kunde anlegen'}
        </Button>
        <LinkButton href={isEdit ? `/customers/${client.id}` : '/customers'}>
          Abbrechen
        </LinkButton>
      </div>
    </form>
  );
}
