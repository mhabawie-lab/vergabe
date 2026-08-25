'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { SHIFT_MEANING_NOTE } from '@/modules/references/shift-format';
import {
  REFERENCE_INVOICE_STATUS_LABELS,
  REFERENCE_INVOICE_STATUSES,
  REFERENCE_PROJECT_STATUS_LABELS,
  REFERENCE_PROJECT_STATUSES,
} from '@/types/reference';

/**
 * Manual entry of a single reference project.
 *
 * Runs through the same validation as the file import, so a hand-typed record
 * is held to the same standard — including the rule that a service is only
 * ever proposed, never asserted.
 */
export function ManualReferenceForm({
  clients,
}: {
  clients: ReadonlyArray<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setError(null);
    setSuccess(null);
    setPending(true);

    const read = (key: string): string | null => {
      const value = form.get(key);
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    try {
      const response = await fetch('/api/v1/references/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: read('clientName'),
          projectName: read('projectName'),
          externalObjectNumber: read('externalObjectNumber'),
          objectType: read('objectType'),
          city: read('city'),
          region: read('region'),
          postalCode: read('postalCode'),
          country: read('country'),
          startDate: read('startDate'),
          endDate: read('endDate'),
          shiftSummary: read('shiftSummary'),
          invoiceStatus: read('invoiceStatus') ?? 'unknown',
          projectStatus: read('projectStatus') ?? 'unknown',
          description: read('description'),
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Das Projekt konnte nicht gespeichert werden.')
            : 'Das Projekt konnte nicht gespeichert werden.';
        setError(message);
        return;
      }

      setSuccess('Referenzprojekt gespeichert.');
      event.currentTarget.reset();
      router.refresh();
    } catch {
      setError('Das Projekt konnte nicht gespeichert werden.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Kunde *" htmlFor="manual-client">
          <Input
            id="manual-client"
            name="clientName"
            required
            list="manual-client-options"
            placeholder="Kundenname"
          />
          <datalist id="manual-client-options">
            {clients.map((client) => (
              <option key={client.id} value={client.name} />
            ))}
          </datalist>
        </Field>

        <Field label="Objektname *" htmlFor="manual-project">
          <Input id="manual-project" name="projectName" required />
        </Field>

        <Field label="Objekt-Nr." htmlFor="manual-number">
          <Input id="manual-number" name="externalObjectNumber" />
        </Field>

        <Field
          label="Objektart"
          htmlFor="manual-object-type"
          hint="Art des Standorts, nicht die erbrachte Leistung."
        >
          <Input id="manual-object-type" name="objectType" placeholder="z. B. Datacenter" />
        </Field>

        <Field label="Ort *" htmlFor="manual-city">
          <Input id="manual-city" name="city" required />
        </Field>

        <Field label="PLZ" htmlFor="manual-postal">
          <Input id="manual-postal" name="postalCode" />
        </Field>

        <Field label="Region / Bundesland" htmlFor="manual-region">
          <Input id="manual-region" name="region" />
        </Field>

        <Field label="Land" htmlFor="manual-country">
          <Input id="manual-country" name="country" placeholder="DE" maxLength={2} />
        </Field>

        <Field
          label="Schichten"
          htmlFor="manual-shift"
          hint={SHIFT_MEANING_NOTE}
        >
          <Input id="manual-shift" name="shiftSummary" placeholder="z. B. 218/146/0" />
        </Field>

        <Field label="Projektbeginn" htmlFor="manual-start">
          <Input id="manual-start" name="startDate" type="date" />
        </Field>

        <Field label="Projektende" htmlFor="manual-end">
          <Input id="manual-end" name="endDate" type="date" />
        </Field>

        <Field label="Projektstatus" htmlFor="manual-status">
          <Select
            id="manual-status"
            name="projectStatus"
            defaultValue="unknown"
            options={REFERENCE_PROJECT_STATUSES.map((status) => ({
              value: status,
              label: REFERENCE_PROJECT_STATUS_LABELS[status],
            }))}
          />
        </Field>

        <Field label="Rechnungsstatus" htmlFor="manual-invoice">
          <Select
            id="manual-invoice"
            name="invoiceStatus"
            defaultValue="unknown"
            options={REFERENCE_INVOICE_STATUSES.map((status) => ({
              value: status,
              label: REFERENCE_INVOICE_STATUS_LABELS[status],
            }))}
          />
        </Field>

        <Field label="Beschreibung" htmlFor="manual-description" className="sm:col-span-2">
          <Input id="manual-description" name="description" />
        </Field>
      </div>

      {error !== null && (
        <p
          role="alert"
          className="rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {success !== null && (
        <p className="rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-xs text-success">
          {success}
        </p>
      )}

      <p className="text-[11px] leading-snug text-text-muted">
        Die Leistungsart wird nicht automatisch gesetzt. Enthält der Objektname
        keinen eindeutigen Begriff, bleibt sie „Nicht bestimmt&ldquo; und muss
        anschließend bestätigt werden.
      </p>

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? 'Wird gespeichert …' : 'Referenzprojekt anlegen'}
      </Button>
    </form>
  );
}
