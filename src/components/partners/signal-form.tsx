'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import {
  PARTNER_SERVICE_CATEGORIES,
  PARTNER_SERVICE_CATEGORY_LABELS,
  SIGNAL_CONFIDENCES,
  SIGNAL_CONFIDENCE_LABELS,
  SIGNAL_TYPES,
  SIGNAL_TYPE_LABELS,
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
} from '@/types/partner';

/**
 * Records an observation.
 *
 * The source fields are mandatory and the form says why: an observation
 * nobody can retrace will later be read as if it were established. The server
 * checks the same rule again.
 */
export function SignalForm({
  companies,
}: {
  companies: ReadonlyArray<{ id: string; legalName: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ field: string; message: string }>>([]);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (key: string): string | null => {
      const value = form.get(key);
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    setError(null);
    setMessages([]);
    setSuccess(false);
    setPending(true);

    try {
      const response = await fetch('/api/v1/partners/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerCompanyId: read('partnerCompanyId'),
          companyNameRaw: read('companyNameRaw'),
          signalType: read('signalType') ?? 'seeks_subcontractor',
          serviceCategory: read('serviceCategory'),
          projectName: read('projectName'),
          country: read('country'),
          region: read('region'),
          city: read('city'),
          description: read('description'),
          sourceType: read('sourceType') ?? 'other',
          sourceName: read('sourceName'),
          sourceUrl: read('sourceUrl'),
          observedAt: read('observedAt') ?? new Date().toISOString().slice(0, 10),
          validUntil: read('validUntil'),
          confidence: read('confidence') ?? 'low',
          status: 'new',
          nextAction: read('nextAction'),
          followUpAt: read('followUpAt'),
          internalNote: read('internalNote'),
        }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Das Signal konnte nicht gespeichert werden.')
            : 'Das Signal konnte nicht gespeichert werden.';
        setError(message);
        return;
      }

      const result = data as {
        saved: boolean;
        messages?: Array<{ field: string; message: string }>;
      };

      if (!result.saved) {
        setMessages(result.messages ?? []);
        return;
      }

      setSuccess(true);
      event.currentTarget.reset();
      router.refresh();
    } catch {
      setError('Das Signal konnte nicht gespeichert werden.');
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        Signal erfassen
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Signal erfassen"
        description="Eine Beobachtung über ein Unternehmen — mit Quelle und Konfidenz."
      />
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Unternehmen"
              htmlFor="signal-company"
              hint="Bereits erfasstes Unternehmen auswählen …"
            >
              <Select
                id="signal-company"
                name="partnerCompanyId"
                placeholder="Nicht verknüpft"
                options={companies.map((company) => ({
                  value: company.id,
                  label: company.legalName,
                }))}
              />
            </Field>

            <Field
              label="… oder Firmenname"
              htmlFor="signal-company-raw"
              hint="Falls das Unternehmen noch nicht erfasst ist."
            >
              <Input id="signal-company-raw" name="companyNameRaw" />
            </Field>

            <Field label="Signaltyp *" htmlFor="signal-type">
              <Select
                id="signal-type"
                name="signalType"
                defaultValue="seeks_subcontractor"
                options={SIGNAL_TYPES.map((type) => ({
                  value: type,
                  label: SIGNAL_TYPE_LABELS[type],
                }))}
              />
            </Field>

            <Field label="Leistung" htmlFor="signal-service">
              <Select
                id="signal-service"
                name="serviceCategory"
                placeholder="Nicht angegeben"
                options={PARTNER_SERVICE_CATEGORIES.map((category) => ({
                  value: category,
                  label: PARTNER_SERVICE_CATEGORY_LABELS[category],
                }))}
              />
            </Field>

            <Field label="Projekt" htmlFor="signal-project">
              <Input id="signal-project" name="projectName" />
            </Field>

            <Field label="Ort" htmlFor="signal-city">
              <Input id="signal-city" name="city" />
            </Field>

            <Field label="Quelle *" htmlFor="signal-source-type">
              <Select
                id="signal-source-type"
                name="sourceType"
                defaultValue="phone_call"
                options={SOURCE_TYPES.map((type) => ({
                  value: type,
                  label: SOURCE_TYPE_LABELS[type],
                }))}
              />
            </Field>

            <Field
              label="Quelle benennen *"
              htmlFor="signal-source-name"
              hint="Gesprächspartner, Medium oder Fundstelle."
            >
              <Input id="signal-source-name" name="sourceName" />
            </Field>

            <Field label="Quellen-URL" htmlFor="signal-source-url">
              <Input id="signal-source-url" name="sourceUrl" />
            </Field>

            <Field label="Beobachtet am *" htmlFor="signal-observed">
              <Input
                id="signal-observed"
                name="observedAt"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </Field>

            <Field
              label="Gültig bis"
              htmlFor="signal-valid"
              hint="Danach gilt der Hinweis nicht mehr als aktuell."
            >
              <Input id="signal-valid" name="validUntil" type="date" />
            </Field>

            <Field
              label="Konfidenz"
              htmlFor="signal-confidence"
              hint="Hohe Konfidenz setzt eine belegbare Quelle voraus."
            >
              <Select
                id="signal-confidence"
                name="confidence"
                defaultValue="low"
                options={SIGNAL_CONFIDENCES.map((confidence) => ({
                  value: confidence,
                  label: SIGNAL_CONFIDENCE_LABELS[confidence],
                }))}
              />
            </Field>

            <Field label="Nächste Aktion" htmlFor="signal-next">
              <Input id="signal-next" name="nextAction" />
            </Field>

            <Field label="Wiedervorlage" htmlFor="signal-followup">
              <Input id="signal-followup" name="followUpAt" type="date" />
            </Field>
          </div>

          <Field label="Beschreibung" htmlFor="signal-description">
            <textarea
              id="signal-description"
              name="description"
              rows={3}
              className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary transition-colors focus:border-brand focus:outline-none"
            />
          </Field>

          {messages.length > 0 && (
            <div className="rounded-xl border border-danger/25 bg-danger-subtle px-4 py-3">
              <ul className="space-y-1 text-xs text-danger">
                {messages.map((message) => (
                  <li key={message.field}>{message.message}</li>
                ))}
              </ul>
            </div>
          )}

          {error !== null && (
            <p className="rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          {success && (
            <p className="rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-xs text-success">
              Signal gespeichert.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Wird gespeichert …' : 'Signal speichern'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Schließen
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
