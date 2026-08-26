'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, LinkButton } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import {
  CREDENTIAL_TYPES,
  CREDENTIAL_TYPE_LABELS,
  FURTHER_SUBCONTRACTING_LABELS,
  FURTHER_SUBCONTRACTING_STATUSES,
  NEED_STATUSES,
  NEED_STATUS_LABELS,
  PARTNER_SERVICE_CATEGORIES,
  PARTNER_SERVICE_CATEGORY_LABELS,
  SHIFT_MODELS,
  SHIFT_MODEL_LABELS,
} from '@/types/partner';

/** Our own demand for a subcontractor. Never published anywhere. */
export function NeedForm({
  need,
}: {
  need?: {
    id: string;
    title: string;
    serviceCategory: string;
    city: string | null;
    region: string | null;
    country: string | null;
    startDate: string | null;
    endDate: string | null;
    requiredStaff: number | null;
    shiftModel: string;
    aroundTheClock: boolean;
    nightWork: boolean;
    weekendWork: boolean;
    requiredCredentials: string[];
    furtherSubcontractingAllowed: string;
    status: string;
    internalNote: string | null;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<string[]>(
    need?.requiredCredentials ?? [],
  );

  function toggleCredential(type: string): void {
    setCredentials((current) =>
      current.includes(type)
        ? current.filter((entry) => entry !== type)
        : [...current, type],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (key: string): string | null => {
      const value = form.get(key);
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };
    const readNumber = (key: string): number | null => {
      const value = read(key);
      if (value === null) return null;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : null;
    };

    setError(null);
    setPending(true);

    try {
      const response = await fetch('/api/v1/partners/needs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(need === undefined ? {} : { id: need.id }),
          title: read('title') ?? '',
          projectType: read('projectType'),
          serviceCategory: read('serviceCategory') ?? 'unknown',
          country: read('country'),
          region: read('region'),
          city: read('city'),
          siteAddress: read('siteAddress'),
          radiusKm: readNumber('radiusKm'),
          startDate: read('startDate'),
          endDate: read('endDate'),
          requiredStaff: readNumber('requiredStaff'),
          shiftModel: read('shiftModel') ?? 'unknown',
          aroundTheClock: form.get('aroundTheClock') === 'on',
          nightWork: form.get('nightWork') === 'on',
          weekendWork: form.get('weekendWork') === 'on',
          requiredQualifications: [],
          requiredCredentials: credentials,
          furtherSubcontractingAllowed: read('furtherSubcontractingAllowed') ?? 'unknown',
          targetBudget: null,
          currency: 'EUR',
          confidentiality: 'confidential',
          status: read('status') ?? 'draft',
          internalNote: read('internalNote'),
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Der Bedarf konnte nicht gespeichert werden.')
            : 'Der Bedarf konnte nicht gespeichert werden.';
        setError(message);
        return;
      }

      const result = data as { id?: string };
      router.push(`/subcontractors/needs/${result.id ?? need?.id ?? ''}`);
      router.refresh();
    } catch {
      setError('Der Bedarf konnte nicht gespeichert werden.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Titel *" htmlFor="need-title" className="sm:col-span-2">
          <Input id="need-title" name="title" required defaultValue={need?.title ?? ''} />
        </Field>

        <Field label="Benötigte Leistung *" htmlFor="need-service">
          <Select
            id="need-service"
            name="serviceCategory"
            defaultValue={need?.serviceCategory ?? 'security'}
            options={PARTNER_SERVICE_CATEGORIES.filter(
              (category) => category !== 'unknown',
            ).map((category) => ({
              value: category,
              label: PARTNER_SERVICE_CATEGORY_LABELS[category],
            }))}
          />
        </Field>

        <Field label="Projektart" htmlFor="need-project-type">
          <Input id="need-project-type" name="projectType" />
        </Field>

        <Field label="Land" htmlFor="need-country">
          <Input id="need-country" name="country" maxLength={2} defaultValue={need?.country ?? 'DE'} />
        </Field>

        <Field label="Region" htmlFor="need-region">
          <Input id="need-region" name="region" defaultValue={need?.region ?? ''} />
        </Field>

        <Field label="Ort" htmlFor="need-city">
          <Input id="need-city" name="city" defaultValue={need?.city ?? ''} />
        </Field>

        <Field label="Einsatzadresse" htmlFor="need-address">
          <Input id="need-address" name="siteAddress" />
        </Field>

        <Field label="Einsatzradius (km)" htmlFor="need-radius">
          <Input id="need-radius" name="radiusKm" type="number" min={0} />
        </Field>

        <Field label="Beginn" htmlFor="need-start">
          <Input id="need-start" name="startDate" type="date" defaultValue={need?.startDate ?? ''} />
        </Field>

        <Field label="Ende" htmlFor="need-end">
          <Input id="need-end" name="endDate" type="date" defaultValue={need?.endDate ?? ''} />
        </Field>

        <Field label="Benötigte Mitarbeiter" htmlFor="need-staff">
          <Input
            id="need-staff"
            name="requiredStaff"
            type="number"
            min={0}
            defaultValue={need?.requiredStaff ?? ''}
          />
        </Field>

        <Field label="Schichtmodell" htmlFor="need-shift">
          <Select
            id="need-shift"
            name="shiftModel"
            defaultValue={need?.shiftModel ?? 'unknown'}
            options={SHIFT_MODELS.map((model) => ({
              value: model,
              label: SHIFT_MODEL_LABELS[model],
            }))}
          />
        </Field>

        <Field label="Weitere Untervergabe" htmlFor="need-further">
          <Select
            id="need-further"
            name="furtherSubcontractingAllowed"
            defaultValue={need?.furtherSubcontractingAllowed ?? 'unknown'}
            options={FURTHER_SUBCONTRACTING_STATUSES.map((status) => ({
              value: status,
              label: FURTHER_SUBCONTRACTING_LABELS[status],
            }))}
          />
        </Field>

        <Field label="Status" htmlFor="need-status">
          <Select
            id="need-status"
            name="status"
            defaultValue={need?.status ?? 'active'}
            options={NEED_STATUSES.map((status) => ({
              value: status,
              label: NEED_STATUS_LABELS[status],
            }))}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-4">
        <Checkbox label="Rund um die Uhr" name="aroundTheClock" defaultChecked={need?.aroundTheClock} />
        <Checkbox label="Nachtarbeit" name="nightWork" defaultChecked={need?.nightWork} />
        <Checkbox label="Wochenendarbeit" name="weekendWork" defaultChecked={need?.weekendWork} />
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-text-secondary">
          Erforderliche Nachweise
        </legend>
        <p className="mb-2 text-[11px] text-text-muted">
          Ein abgelaufener oder ungeprüfter Nachweis gilt im Match nicht als erfüllt.
        </p>
        <div className="flex flex-wrap gap-3">
          {CREDENTIAL_TYPES.map((type) => (
            <Checkbox
              key={type}
              label={CREDENTIAL_TYPE_LABELS[type]}
              checked={credentials.includes(type)}
              onChange={() => toggleCredential(type)}
            />
          ))}
        </div>
      </fieldset>

      <Field label="Interne Notiz" htmlFor="need-note">
        <textarea
          id="need-note"
          name="internalNote"
          rows={3}
          defaultValue={need?.internalNote ?? ''}
          className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary transition-colors focus:border-brand focus:outline-none"
        />
      </Field>

      {error !== null && (
        <p className="rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Wird gespeichert …' : 'Bedarf speichern'}
        </Button>
        <LinkButton href="/subcontractors/needs">Abbrechen</LinkButton>
      </div>
    </form>
  );
}
