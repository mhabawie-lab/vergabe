'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  ASSIGNMENT_ROLES,
  ASSIGNMENT_ROLE_LABELS,
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STATUS_LABELS,
  AVAILABILITY_STATUSES,
  AVAILABILITY_STATUS_LABELS,
  CONTACT_CHANNELS,
  CONTACT_CHANNEL_LABELS,
  CREDENTIAL_REVIEW_STATUSES,
  CREDENTIAL_REVIEW_STATUS_LABELS,
  CREDENTIAL_TYPES,
  CREDENTIAL_TYPE_LABELS,
  FURTHER_SUBCONTRACTING_LABELS,
  FURTHER_SUBCONTRACTING_STATUSES,
  PARTNER_SERVICE_CATEGORIES,
  PARTNER_SERVICE_CATEGORY_LABELS,
  PARTNER_SERVICE_CONFIRMATIONS,
  PARTNER_SERVICE_CONFIRMATION_LABELS,
  SERVICE_DELIVERY_MODES,
  SERVICE_DELIVERY_MODE_LABELS,
  SHIFT_MODELS,
  SHIFT_MODEL_LABELS,
} from '@/types/partner';

/**
 * The small capture forms on the partner detail tabs.
 *
 * They share one submit helper because the difference between them is only
 * the endpoint and the fields; the error handling, the disabled state and the
 * refresh afterwards must behave identically everywhere.
 */
function useSubmit(endpoint: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(payload: Record<string, unknown>, form: HTMLFormElement): Promise<void> {
    setError(null);
    setDone(false);
    setPending(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Der Eintrag konnte nicht gespeichert werden.')
            : 'Der Eintrag konnte nicht gespeichert werden.';
        setError(message);
        return;
      }
      setDone(true);
      form.reset();
      router.refresh();
    } catch {
      setError('Der Eintrag konnte nicht gespeichert werden.');
    } finally {
      setPending(false);
    }
  }

  return { submit, pending, error, done };
}

function FormShell({
  title,
  hint,
  pending,
  error,
  done,
  children,
  onSubmit,
}: {
  title: string;
  hint?: string;
  pending: boolean;
  error: string | null;
  done: boolean;
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-border-subtle bg-surface-sunken p-4"
    >
      <p className="text-xs font-semibold text-text-primary">{title}</p>
      {hint !== undefined && (
        <p className="text-[11px] leading-snug text-text-muted">{hint}</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      {error !== null && <p className="text-[11px] text-danger">{error}</p>}
      {done && <p className="text-[11px] text-success">Gespeichert.</p>}
      <Button type="submit" size="sm" variant="primary" disabled={pending}>
        {pending ? 'Wird gespeichert …' : 'Speichern'}
      </Button>
    </form>
  );
}

function readText(form: FormData, key: string): string | null {
  const value = form.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readInt(form: FormData, key: string): number | null {
  const value = readText(form, key);
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ContactForm({ companyId }: { companyId: string }) {
  const { submit, pending, error, done } = useSubmit('/api/v1/partners/contacts');

  return (
    <FormShell
      title="Ansprechpartner erfassen"
      hint="Nur geschäftliche Kontaktdaten. Private Nummern gehören nicht hierher."
      pending={pending}
      error={error}
      done={done}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void submit(
          {
            partnerCompanyId: companyId,
            firstName: readText(form, 'firstName'),
            lastName: readText(form, 'lastName') ?? '',
            role: readText(form, 'role'),
            businessEmail: readText(form, 'businessEmail'),
            businessPhone: readText(form, 'businessPhone'),
            preferredChannel: readText(form, 'preferredChannel') ?? 'unknown',
            sourceType: null,
            internalNote: readText(form, 'internalNote'),
            isActive: true,
          },
          event.currentTarget,
        );
      }}
    >
      <Field label="Vorname" htmlFor="contact-first">
        <Input id="contact-first" name="firstName" />
      </Field>
      <Field label="Nachname *" htmlFor="contact-last">
        <Input id="contact-last" name="lastName" required />
      </Field>
      <Field label="Funktion" htmlFor="contact-role">
        <Input id="contact-role" name="role" />
      </Field>
      <Field label="Geschäftliche E-Mail" htmlFor="contact-email">
        <Input id="contact-email" name="businessEmail" type="email" />
      </Field>
      <Field label="Geschäftliches Telefon" htmlFor="contact-phone">
        <Input id="contact-phone" name="businessPhone" />
      </Field>
      <Field label="Bevorzugter Weg" htmlFor="contact-channel">
        <Select
          id="contact-channel"
          name="preferredChannel"
          defaultValue="unknown"
          options={CONTACT_CHANNELS.map((channel) => ({
            value: channel,
            label: CONTACT_CHANNEL_LABELS[channel],
          }))}
        />
      </Field>
    </FormShell>
  );
}

export function ServiceForm({ companyId }: { companyId: string }) {
  const { submit, pending, error, done } = useSubmit('/api/v1/partners/services');

  return (
    <FormShell
      title="Leistung erfassen"
      hint={'„Bestätigt" nur wählen, wenn die Leistung belegt ist — nur bestätigte Leistungen zählen in einem Match.'}
      pending={pending}
      error={error}
      done={done}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void submit(
          {
            partnerCompanyId: companyId,
            serviceCategory: readText(form, 'serviceCategory') ?? 'unknown',
            serviceLabel: readText(form, 'serviceLabel'),
            confirmation: readText(form, 'confirmation') ?? 'self_declared',
            confirmationSource: 'manual',
            capacityNote: readText(form, 'capacityNote'),
            availableStaff: readInt(form, 'availableStaff'),
            deliveryMode: readText(form, 'deliveryMode') ?? 'unknown',
            note: null,
          },
          event.currentTarget,
        );
      }}
    >
      <Field label="Leistungsart *" htmlFor="service-category">
        <Select
          id="service-category"
          name="serviceCategory"
          defaultValue="security"
          options={PARTNER_SERVICE_CATEGORIES.map((category) => ({
            value: category,
            label: PARTNER_SERVICE_CATEGORY_LABELS[category],
          }))}
        />
      </Field>
      <Field label="Zustand" htmlFor="service-confirmation">
        <Select
          id="service-confirmation"
          name="confirmation"
          defaultValue="self_declared"
          options={PARTNER_SERVICE_CONFIRMATIONS.map((confirmation) => ({
            value: confirmation,
            label: PARTNER_SERVICE_CONFIRMATION_LABELS[confirmation],
          }))}
        />
      </Field>
      <Field label="Erbringung" htmlFor="service-delivery">
        <Select
          id="service-delivery"
          name="deliveryMode"
          defaultValue="unknown"
          options={SERVICE_DELIVERY_MODES.map((mode) => ({
            value: mode,
            label: SERVICE_DELIVERY_MODE_LABELS[mode],
          }))}
        />
      </Field>
      <Field label="Verfügbare Mitarbeiter" htmlFor="service-staff">
        <Input id="service-staff" name="availableStaff" type="number" min={0} />
      </Field>
      <Field label="Kapazitätshinweis" htmlFor="service-capacity">
        <Input id="service-capacity" name="capacityNote" />
      </Field>
      <Field label="Anzeigename" htmlFor="service-label">
        <Input id="service-label" name="serviceLabel" />
      </Field>
    </FormShell>
  );
}

export function RegionForm({ companyId }: { companyId: string }) {
  const { submit, pending, error, done } = useSubmit('/api/v1/partners/regions');

  return (
    <FormShell
      title="Einsatzgebiet erfassen"
      hint="Es werden keine Entfernungen aus Adressen berechnet — es zählt, was das Unternehmen angibt."
      pending={pending}
      error={error}
      done={done}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void submit(
          {
            partnerCompanyId: companyId,
            country: readText(form, 'country'),
            region: readText(form, 'region'),
            city: readText(form, 'city'),
            radiusKm: readInt(form, 'radiusKm'),
            nationwide: form.get('nationwide') === 'on',
            willingToTravel: form.get('willingToTravel') === 'on',
            isConfirmed: form.get('isConfirmed') === 'on',
            note: null,
          },
          event.currentTarget,
        );
      }}
    >
      <Field label="Land" htmlFor="region-country">
        <Input id="region-country" name="country" maxLength={2} defaultValue="DE" />
      </Field>
      <Field label="Region" htmlFor="region-region">
        <Input id="region-region" name="region" />
      </Field>
      <Field label="Ort" htmlFor="region-city">
        <Input id="region-city" name="city" />
      </Field>
      <Field label="Radius (km)" htmlFor="region-radius">
        <Input id="region-radius" name="radiusKm" type="number" min={0} />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Checkbox label="Bundesweit tätig" name="nationwide" />
        <Checkbox label="Reisebereitschaft" name="willingToTravel" />
        <Checkbox label="Angabe ist bestätigt" name="isConfirmed" />
      </div>
    </FormShell>
  );
}

export function AvailabilityForm({ companyId }: { companyId: string }) {
  const { submit, pending, error, done } = useSubmit('/api/v1/partners/availability');

  return (
    <FormShell
      title="Verfügbarkeit erfassen"
      hint={'„Soeben bestätigt" nur ankreuzen, wenn die Angabe gerade mit dem Unternehmen abgeglichen wurde — davon hängt ab, ob sie als aktuell gilt.'}
      pending={pending}
      error={error}
      done={done}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void submit(
          {
            partnerCompanyId: companyId,
            serviceCategory: readText(form, 'serviceCategory'),
            availableFrom: readText(form, 'availableFrom'),
            availableUntil: readText(form, 'availableUntil'),
            status: readText(form, 'status') ?? 'unknown',
            availableStaff: readInt(form, 'availableStaff'),
            shiftModel: readText(form, 'shiftModel') ?? 'unknown',
            nightShift: form.get('nightShift') === 'on',
            weekend: form.get('weekend') === 'on',
            aroundTheClock: form.get('aroundTheClock') === 'on',
            shortNotice: form.get('shortNotice') === 'on',
            note: readText(form, 'note'),
            confirmNow: form.get('confirmNow') === 'on',
          },
          event.currentTarget,
        );
      }}
    >
      <Field label="Leistung" htmlFor="availability-service">
        <Select
          id="availability-service"
          name="serviceCategory"
          placeholder="Alle Leistungen"
          options={PARTNER_SERVICE_CATEGORIES.map((category) => ({
            value: category,
            label: PARTNER_SERVICE_CATEGORY_LABELS[category],
          }))}
        />
      </Field>
      <Field label="Status" htmlFor="availability-status">
        <Select
          id="availability-status"
          name="status"
          defaultValue="available"
          options={AVAILABILITY_STATUSES.map((status) => ({
            value: status,
            label: AVAILABILITY_STATUS_LABELS[status],
          }))}
        />
      </Field>
      <Field label="Verfügbare Mitarbeiter" htmlFor="availability-staff">
        <Input id="availability-staff" name="availableStaff" type="number" min={0} />
      </Field>
      <Field label="Verfügbar ab" htmlFor="availability-from">
        <Input id="availability-from" name="availableFrom" type="date" />
      </Field>
      <Field label="Verfügbar bis" htmlFor="availability-until">
        <Input id="availability-until" name="availableUntil" type="date" />
      </Field>
      <Field label="Schichtmodell" htmlFor="availability-shift">
        <Select
          id="availability-shift"
          name="shiftModel"
          defaultValue="unknown"
          options={SHIFT_MODELS.map((model) => ({
            value: model,
            label: SHIFT_MODEL_LABELS[model],
          }))}
        />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
        <Checkbox label="Nachtbetrieb möglich" name="nightShift" />
        <Checkbox label="Wochenendbetrieb möglich" name="weekend" />
        <Checkbox label="24/7 möglich" name="aroundTheClock" />
        <Checkbox label="Kurzfristig verfügbar" name="shortNotice" />
        <Checkbox label="Soeben mit dem Unternehmen bestätigt" name="confirmNow" />
      </div>
    </FormShell>
  );
}

export function QualificationForm({ companyId }: { companyId: string }) {
  const { submit, pending, error, done } = useSubmit('/api/v1/partners/qualifications');

  return (
    <FormShell
      title="Nachweis erfassen"
      hint="Das Ablaufdatum wird nie geschätzt. Ohne Datum gilt der Nachweis als nicht datiert; ungeprüft gilt er nicht als Nachweis."
      pending={pending}
      error={error}
      done={done}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void submit(
          {
            partnerCompanyId: companyId,
            credentialType: readText(form, 'credentialType') ?? 'other',
            title: readText(form, 'title'),
            issuer: readText(form, 'issuer'),
            documentNumber: readText(form, 'documentNumber'),
            validFrom: readText(form, 'validFrom'),
            validUntil: readText(form, 'validUntil'),
            reviewStatus: readText(form, 'reviewStatus') ?? 'pending',
            note: null,
          },
          event.currentTarget,
        );
      }}
    >
      <Field label="Art *" htmlFor="qualification-type">
        <Select
          id="qualification-type"
          name="credentialType"
          defaultValue="guard_permit"
          options={CREDENTIAL_TYPES.map((type) => ({
            value: type,
            label: CREDENTIAL_TYPE_LABELS[type],
          }))}
        />
      </Field>
      <Field label="Aussteller" htmlFor="qualification-issuer">
        <Input id="qualification-issuer" name="issuer" />
      </Field>
      <Field label="Dokumentnummer" htmlFor="qualification-number">
        <Input id="qualification-number" name="documentNumber" />
      </Field>
      <Field label="Gültig von" htmlFor="qualification-from">
        <Input id="qualification-from" name="validFrom" type="date" />
      </Field>
      <Field label="Gültig bis" htmlFor="qualification-until">
        <Input id="qualification-until" name="validUntil" type="date" />
      </Field>
      <Field label="Prüfstatus" htmlFor="qualification-review">
        <Select
          id="qualification-review"
          name="reviewStatus"
          defaultValue="pending"
          options={CREDENTIAL_REVIEW_STATUSES.map((status) => ({
            value: status,
            label: CREDENTIAL_REVIEW_STATUS_LABELS[status],
          }))}
        />
      </Field>
    </FormShell>
  );
}

export function ActivityForm({ companyId }: { companyId: string }) {
  const { submit, pending, error, done } = useSubmit('/api/v1/partners/activities');

  return (
    <FormShell
      title="Aktivität erfassen"
      hint="Der Notiztext bleibt am Datensatz; im Audit-Log steht nur, dass eine Aktivität stattgefunden hat."
      pending={pending}
      error={error}
      done={done}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const occurred = readText(form, 'occurredAt');
        void submit(
          {
            partnerCompanyId: companyId,
            partnerContactId: null,
            activityType: readText(form, 'activityType') ?? 'call',
            occurredAt:
              occurred === null ? new Date().toISOString() : `${occurred}T09:00:00.000Z`,
            summary: readText(form, 'summary'),
            outcome: readText(form, 'outcome'),
            nextAction: readText(form, 'nextAction'),
            followUpAt: readText(form, 'followUpAt'),
          },
          event.currentTarget,
        );
      }}
    >
      <Field label="Art *" htmlFor="activity-type">
        <Select
          id="activity-type"
          name="activityType"
          defaultValue="call"
          options={ACTIVITY_TYPES.map((type) => ({
            value: type,
            label: ACTIVITY_TYPE_LABELS[type],
          }))}
        />
      </Field>
      <Field label="Zeitpunkt" htmlFor="activity-date">
        <Input
          id="activity-date"
          name="occurredAt"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
        />
      </Field>
      <Field label="Wiedervorlage" htmlFor="activity-followup">
        <Input id="activity-followup" name="followUpAt" type="date" />
      </Field>
      <Field label="Zusammenfassung" htmlFor="activity-summary" className="sm:col-span-2">
        <Input id="activity-summary" name="summary" />
      </Field>
      <Field label="Ergebnis" htmlFor="activity-outcome">
        <Input id="activity-outcome" name="outcome" />
      </Field>
      <Field label="Nächste Aktion" htmlFor="activity-next" className="sm:col-span-2">
        <Input id="activity-next" name="nextAction" />
      </Field>
    </FormShell>
  );
}

export function AssignmentForm({
  companyId,
  parents,
}: {
  companyId: string;
  parents: ReadonlyArray<{ id: string; label: string }>;
}) {
  const { submit, pending, error, done } = useSubmit('/api/v1/partners/assignments');

  return (
    <FormShell
      title="Projektzuordnung erfassen"
      hint="Ohne übergeordnete Zuordnung wird der Partner direkt von uns beauftragt. Eine weitere Ebene ist nur möglich, wenn die übergeordnete Zuordnung Untervergabe ausdrücklich erlaubt."
      pending={pending}
      error={error}
      done={done}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void submit(
          {
            partnerCompanyId: companyId,
            referenceProjectId: null,
            needId: null,
            role: readText(form, 'role') ?? 'subcontractor',
            parentAssignmentId: readText(form, 'parentAssignmentId'),
            contractPartnerCompanyId: null,
            scope: readText(form, 'scope'),
            staffCount: readInt(form, 'staffCount'),
            startDate: readText(form, 'startDate'),
            endDate: readText(form, 'endDate'),
            furtherSubcontractingAllowed:
              readText(form, 'furtherSubcontractingAllowed') ?? 'unknown',
            status: readText(form, 'status') ?? 'planned',
            internalRating: null,
            note: null,
          },
          event.currentTarget,
        );
      }}
    >
      <Field label="Rolle" htmlFor="assignment-role">
        <Select
          id="assignment-role"
          name="role"
          defaultValue="subcontractor"
          options={ASSIGNMENT_ROLES.map((role) => ({
            value: role,
            label: ASSIGNMENT_ROLE_LABELS[role],
          }))}
        />
      </Field>
      <Field label="Übergeordnete Zuordnung" htmlFor="assignment-parent">
        <Select
          id="assignment-parent"
          name="parentAssignmentId"
          placeholder="Direkt von uns beauftragt"
          options={parents.map((parent) => ({ value: parent.id, label: parent.label }))}
        />
      </Field>
      <Field label="Status" htmlFor="assignment-status">
        <Select
          id="assignment-status"
          name="status"
          defaultValue="planned"
          options={ASSIGNMENT_STATUSES.map((status) => ({
            value: status,
            label: ASSIGNMENT_STATUS_LABELS[status],
          }))}
        />
      </Field>
      <Field label="Leistungsumfang" htmlFor="assignment-scope" className="sm:col-span-2">
        <Input id="assignment-scope" name="scope" />
      </Field>
      <Field label="Mitarbeiterzahl" htmlFor="assignment-staff">
        <Input id="assignment-staff" name="staffCount" type="number" min={0} />
      </Field>
      <Field label="Beginn" htmlFor="assignment-start">
        <Input id="assignment-start" name="startDate" type="date" />
      </Field>
      <Field label="Ende" htmlFor="assignment-end">
        <Input id="assignment-end" name="endDate" type="date" />
      </Field>
      <Field label="Weitere Untervergabe" htmlFor="assignment-further">
        <Select
          id="assignment-further"
          name="furtherSubcontractingAllowed"
          defaultValue="unknown"
          options={FURTHER_SUBCONTRACTING_STATUSES.map((status) => ({
            value: status,
            label: FURTHER_SUBCONTRACTING_LABELS[status],
          }))}
        />
      </Field>
    </FormShell>
  );
}
