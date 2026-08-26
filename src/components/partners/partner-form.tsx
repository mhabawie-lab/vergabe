'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import {
  PARTNER_NAME_MAX_LENGTH,
  PARTNER_NOTES_MAX_LENGTH,
  validatePartnerInput,
  type ExistingPartner,
  type PartnerFormInput,
} from '@/modules/partners/validation';
import type { ValidationMessage } from '@/types/reference';
import {
  DATACENTER_EXPERIENCE_LABELS,
  DATACENTER_EXPERIENCE_STATUSES,
  FURTHER_SUBCONTRACTING_LABELS,
  FURTHER_SUBCONTRACTING_STATUSES,
  PARTNER_LEVELS,
  PARTNER_LEVEL_LABELS,
  PARTNER_STATUSES,
  PARTNER_STATUS_LABELS,
  RELATIONSHIP_DIRECTIONS,
  RELATIONSHIP_DIRECTION_DESCRIPTIONS,
  RELATIONSHIP_DIRECTION_LABELS,
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
  STAFF_MODELS,
  STAFF_MODEL_LABELS,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_DESCRIPTIONS,
  VERIFICATION_STATUS_LABELS,
} from '@/types/partner';

export interface PartnerFormInitialValues extends PartnerFormInput {
  id: string;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
}

/**
 * Create and edit form for a partner company.
 *
 * Two things drive the shape of this form. The relationship direction sits at
 * the very top because confusing "can work for us" with "is looking for a
 * subcontractor" is the expensive mistake in this domain. And a possible
 * duplicate is a question, not a verdict: the first save attempt comes back
 * with the warning and nothing written, and only an acknowledged second
 * attempt writes. Records are never merged automatically.
 */
export function PartnerForm({
  company,
  existing,
}: {
  company?: PartnerFormInitialValues;
  existing: readonly ExistingPartner[];
}) {
  const router = useRouter();
  const isEdit = company !== undefined;

  const [values, setValues] = useState<PartnerFormInput>(() => ({
    legalName: company?.legalName ?? '',
    tradeName: company?.tradeName ?? null,
    relationshipDirection: company?.relationshipDirection ?? 'can_work_for_us',
    partnerLevel: company?.partnerLevel ?? 'unknown',
    status: company?.status ?? 'prospect',
    verificationStatus: company?.verificationStatus ?? 'unverified',
    country: company?.country ?? 'DE',
    region: company?.region ?? null,
    city: company?.city ?? null,
    postalCode: company?.postalCode ?? null,
    address: company?.address ?? null,
    website: company?.website ?? null,
    email: company?.email ?? null,
    phone: company?.phone ?? null,
    registryName: company?.registryName ?? null,
    registryNumber: company?.registryNumber ?? null,
    vatId: company?.vatId ?? null,
    lei: company?.lei ?? null,
    staffModel: company?.staffModel ?? 'unknown',
    furtherSubcontractingStatus: company?.furtherSubcontractingStatus ?? 'unknown',
    datacenterExperienceStatus: company?.datacenterExperienceStatus ?? 'unknown',
    isPreferred: company?.isPreferred ?? false,
    isBlocked: company?.isBlocked ?? false,
    blockedReason: company?.blockedReason ?? null,
    internalRating: company?.internalRating ?? null,
    sourceType: company?.sourceType ?? null,
    sourceName: company?.sourceName ?? null,
    sourceUrl: company?.sourceUrl ?? null,
    internalNotes: company?.internalNotes ?? null,
  }));

  // Stored as a full timestamp once an activity has touched it; the form works
  // in dates, so it keeps only the date part — sending the timestamp back
  // would fail the date validation on the server.
  const [lastContactAt, setLastContactAt] = useState(
    (company?.lastContactAt ?? '').slice(0, 10),
  );
  const [nextFollowUpAt, setNextFollowUpAt] = useState(
    (company?.nextFollowUpAt ?? '').slice(0, 10),
  );
  const [messages, setMessages] = useState<ValidationMessage[]>([]);
  const [needsAcknowledgement, setNeedsAcknowledgement] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof PartnerFormInput>(
    key: K,
    value: PartnerFormInput[K],
  ): void => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const text = (key: keyof PartnerFormInput): string => {
    const value = values[key];
    return typeof value === 'string' ? value : '';
  };

  // Live preview so the duplicate rule is visible while typing, not hidden
  // in the server.
  const preview = useMemo(
    () => validatePartnerInput(values, existing, company?.id ?? null),
    [values, existing, company?.id],
  );

  const shown = messages.length > 0 ? messages : preview.messages;
  const errors = shown.filter((message) => message.severity === 'error');
  const warnings = shown.filter((message) => message.severity === 'warning');
  const errorFor = (field: string): ValidationMessage | undefined =>
    errors.find((message) => message.field === field);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setRequestError(null);
    setMessages([]);

    const local = validatePartnerInput(values, existing, company?.id ?? null);
    if (!local.valid) {
      setMessages(local.messages);
      return;
    }

    setPending(true);
    try {
      const response = await fetch(
        isEdit
          ? `/api/v1/partners/companies/${company.id}`
          : '/api/v1/partners/companies',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...values,
            lastContactAt: lastContactAt.length > 0 ? lastContactAt : null,
            nextFollowUpAt: nextFollowUpAt.length > 0 ? nextFollowUpAt : null,
            acknowledgeDuplicateWarning: acknowledged,
          }),
        },
      );

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Der Partner konnte nicht gespeichert werden.')
            : 'Der Partner konnte nicht gespeichert werden.';
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

      router.push(`/subcontractors/${result.id ?? company?.id ?? ''}`);
      router.refresh();
    } catch {
      setRequestError('Der Partner konnte nicht gespeichert werden.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* --- Direction first: the distinction that must not be muddled ---- */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-text-primary">
          Beziehungsrichtung
        </legend>
        <p className="text-xs text-text-secondary">
          {RELATIONSHIP_DIRECTION_DESCRIPTIONS[values.relationshipDirection]}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Richtung *" htmlFor="partner-direction">
            <Select
              id="partner-direction"
              value={values.relationshipDirection}
              onChange={(event) =>
                set(
                  'relationshipDirection',
                  event.target.value as PartnerFormInput['relationshipDirection'],
                )
              }
              options={RELATIONSHIP_DIRECTIONS.map((direction) => ({
                value: direction,
                label: RELATIONSHIP_DIRECTION_LABELS[direction],
              }))}
            />
          </Field>
          <Field label="Ebene in der Kette" htmlFor="partner-level">
            <Select
              id="partner-level"
              value={values.partnerLevel}
              onChange={(event) =>
                set('partnerLevel', event.target.value as PartnerFormInput['partnerLevel'])
              }
              options={PARTNER_LEVELS.map((level) => ({
                value: level,
                label: PARTNER_LEVEL_LABELS[level],
              }))}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-text-primary">Stammdaten</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Firmenname *"
            htmlFor="partner-name"
            hint={
              preview.normalized.normalizedName.length > 0
                ? `Vergleichsform: ${preview.normalized.normalizedName}`
                : 'Die Schreibweise bleibt unverändert erhalten.'
            }
            className="sm:col-span-2"
          >
            <Input
              id="partner-name"
              required
              maxLength={PARTNER_NAME_MAX_LENGTH}
              value={values.legalName}
              onChange={(event) => set('legalName', event.target.value)}
              aria-invalid={errorFor('legalName') !== undefined}
            />
            {errorFor('legalName') !== undefined && (
              <p className="mt-1 text-[11px] text-danger">
                {errorFor('legalName')?.message}
              </p>
            )}
          </Field>

          <Field label="Handelsname" htmlFor="partner-trade">
            <Input
              id="partner-trade"
              value={text('tradeName')}
              onChange={(event) => set('tradeName', event.target.value || null)}
            />
          </Field>

          <Field label="Land" htmlFor="partner-country" hint="Zweistelliger Ländercode.">
            <Input
              id="partner-country"
              maxLength={2}
              value={text('country')}
              onChange={(event) => set('country', event.target.value.toUpperCase() || null)}
              aria-invalid={errorFor('country') !== undefined}
            />
          </Field>

          <Field label="Region / Bundesland" htmlFor="partner-region">
            <Input
              id="partner-region"
              value={text('region')}
              onChange={(event) => set('region', event.target.value || null)}
            />
          </Field>

          <Field label="Ort" htmlFor="partner-city">
            <Input
              id="partner-city"
              value={text('city')}
              onChange={(event) => set('city', event.target.value || null)}
            />
          </Field>

          <Field label="PLZ" htmlFor="partner-postal">
            <Input
              id="partner-postal"
              value={text('postalCode')}
              onChange={(event) => set('postalCode', event.target.value || null)}
            />
          </Field>

          <Field label="Anschrift" htmlFor="partner-address">
            <Input
              id="partner-address"
              value={text('address')}
              onChange={(event) => set('address', event.target.value || null)}
            />
          </Field>

          <Field label="Website" htmlFor="partner-website" hint="Ohne https:// genügt.">
            <Input
              id="partner-website"
              value={text('website')}
              onChange={(event) => set('website', event.target.value || null)}
              aria-invalid={errorFor('website') !== undefined}
            />
            {errorFor('website') !== undefined && (
              <p className="mt-1 text-[11px] text-danger">{errorFor('website')?.message}</p>
            )}
          </Field>

          <Field label="E-Mail" htmlFor="partner-email">
            <Input
              id="partner-email"
              type="email"
              value={text('email')}
              onChange={(event) => set('email', event.target.value || null)}
              aria-invalid={errorFor('email') !== undefined}
            />
          </Field>

          <Field label="Telefon" htmlFor="partner-phone">
            <Input
              id="partner-phone"
              value={text('phone')}
              onChange={(event) => set('phone', event.target.value || null)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-text-primary">
          Öffentliche Kennungen
        </legend>
        <p className="text-xs text-text-secondary">
          Nur als Quellenhinweis gespeichert. Es findet keine automatische
          Anreicherung aus externen Datenbanken statt.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Registergericht" htmlFor="partner-registry-name">
            <Input
              id="partner-registry-name"
              value={text('registryName')}
              onChange={(event) => set('registryName', event.target.value || null)}
            />
          </Field>
          <Field label="Registernummer" htmlFor="partner-registry-number" hint="z. B. HRB 12345">
            <Input
              id="partner-registry-number"
              value={text('registryNumber')}
              onChange={(event) => set('registryNumber', event.target.value || null)}
              aria-invalid={errorFor('registryNumber') !== undefined}
            />
            {errorFor('registryNumber') !== undefined && (
              <p className="mt-1 text-[11px] text-danger">
                {errorFor('registryNumber')?.message}
              </p>
            )}
          </Field>
          <Field label="Umsatzsteuer-ID" htmlFor="partner-vat">
            <Input
              id="partner-vat"
              value={text('vatId')}
              onChange={(event) => set('vatId', event.target.value.toUpperCase() || null)}
              aria-invalid={errorFor('vatId') !== undefined}
            />
            {errorFor('vatId') !== undefined && (
              <p className="mt-1 text-[11px] text-danger">{errorFor('vatId')?.message}</p>
            )}
          </Field>
          <Field label="LEI" htmlFor="partner-lei">
            <Input
              id="partner-lei"
              value={text('lei')}
              onChange={(event) => set('lei', event.target.value.toUpperCase() || null)}
              aria-invalid={errorFor('lei') !== undefined}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-text-primary">Einordnung</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Partnerstatus" htmlFor="partner-status">
            <Select
              id="partner-status"
              value={values.status}
              onChange={(event) =>
                set('status', event.target.value as PartnerFormInput['status'])
              }
              options={PARTNER_STATUSES.map((status) => ({
                value: status,
                label: PARTNER_STATUS_LABELS[status],
              }))}
            />
          </Field>

          <Field
            label="Verifizierungsstatus"
            htmlFor="partner-verification"
            hint={VERIFICATION_STATUS_DESCRIPTIONS[values.verificationStatus]}
          >
            <Select
              id="partner-verification"
              value={values.verificationStatus}
              onChange={(event) =>
                set(
                  'verificationStatus',
                  event.target.value as PartnerFormInput['verificationStatus'],
                )
              }
              options={VERIFICATION_STATUSES.map((status) => ({
                value: status,
                label: VERIFICATION_STATUS_LABELS[status],
              }))}
            />
          </Field>

          <Field label="Mitarbeitermodell" htmlFor="partner-staff">
            <Select
              id="partner-staff"
              value={values.staffModel}
              onChange={(event) =>
                set('staffModel', event.target.value as PartnerFormInput['staffModel'])
              }
              options={STAFF_MODELS.map((model) => ({
                value: model,
                label: STAFF_MODEL_LABELS[model],
              }))}
            />
          </Field>

          <Field label="Weitere Untervergabe" htmlFor="partner-further">
            <Select
              id="partner-further"
              value={values.furtherSubcontractingStatus}
              onChange={(event) =>
                set(
                  'furtherSubcontractingStatus',
                  event.target.value as PartnerFormInput['furtherSubcontractingStatus'],
                )
              }
              options={FURTHER_SUBCONTRACTING_STATUSES.map((status) => ({
                value: status,
                label: FURTHER_SUBCONTRACTING_LABELS[status],
              }))}
            />
          </Field>

          <Field
            label="Datacenter-Erfahrung"
            htmlFor="partner-datacenter"
            hint={'„Belegt" nur, wenn ein Nachweis oder eine Referenz vorliegt.'}
          >
            <Select
              id="partner-datacenter"
              value={values.datacenterExperienceStatus}
              onChange={(event) =>
                set(
                  'datacenterExperienceStatus',
                  event.target.value as PartnerFormInput['datacenterExperienceStatus'],
                )
              }
              options={DATACENTER_EXPERIENCE_STATUSES.map((status) => ({
                value: status,
                label: DATACENTER_EXPERIENCE_LABELS[status],
              }))}
            />
          </Field>

          <Field
            label="Interne Bewertung"
            htmlFor="partner-rating"
            hint="Subjektiv, 1–5. Keine objektive Qualitätsaussage."
          >
            <Select
              id="partner-rating"
              value={values.internalRating === null ? '' : String(values.internalRating)}
              onChange={(event) =>
                set(
                  'internalRating',
                  event.target.value === '' ? null : Number(event.target.value),
                )
              }
              placeholder="Keine Bewertung"
              options={[1, 2, 3, 4, 5].map((value) => ({
                value: String(value),
                label: `${value} von 5`,
              }))}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-4">
          <Checkbox
            label="Bevorzugter Partner"
            checked={values.isPreferred}
            onChange={(event) => set('isPreferred', event.target.checked)}
          />
          <Checkbox
            label="Gesperrt"
            checked={values.isBlocked}
            onChange={(event) => set('isBlocked', event.target.checked)}
          />
        </div>

        {values.isBlocked && (
          <Field
            label="Grund der Sperrung *"
            htmlFor="partner-block-reason"
            hint="Eine Sperrung schließt das Unternehmen aus allen künftigen Matches aus und muss nachvollziehbar sein."
          >
            <Input
              id="partner-block-reason"
              value={text('blockedReason')}
              onChange={(event) => set('blockedReason', event.target.value || null)}
              aria-invalid={errorFor('blockedReason') !== undefined}
            />
            {errorFor('blockedReason') !== undefined && (
              <p className="mt-1 text-[11px] text-danger">
                {errorFor('blockedReason')?.message}
              </p>
            )}
          </Field>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-text-primary">
          Herkunft und Wiedervorlage
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Quelle" htmlFor="partner-source-type">
            <Select
              id="partner-source-type"
              value={values.sourceType ?? ''}
              onChange={(event) =>
                set(
                  'sourceType',
                  event.target.value === ''
                    ? null
                    : (event.target.value as PartnerFormInput['sourceType']),
                )
              }
              placeholder="Nicht angegeben"
              options={SOURCE_TYPES.map((type) => ({
                value: type,
                label: SOURCE_TYPE_LABELS[type],
              }))}
            />
          </Field>
          <Field label="Quellenbezeichnung" htmlFor="partner-source-name">
            <Input
              id="partner-source-name"
              value={text('sourceName')}
              onChange={(event) => set('sourceName', event.target.value || null)}
            />
          </Field>
          <Field label="Quellen-URL" htmlFor="partner-source-url">
            <Input
              id="partner-source-url"
              value={text('sourceUrl')}
              onChange={(event) => set('sourceUrl', event.target.value || null)}
            />
          </Field>
          <Field label="Letzter Kontakt" htmlFor="partner-last-contact">
            <Input
              id="partner-last-contact"
              type="date"
              value={lastContactAt}
              onChange={(event) => setLastContactAt(event.target.value)}
            />
          </Field>
          <Field label="Nächste Wiedervorlage" htmlFor="partner-follow-up">
            <Input
              id="partner-follow-up"
              type="date"
              value={nextFollowUpAt}
              onChange={(event) => setNextFollowUpAt(event.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Interne Notizen"
          htmlFor="partner-notes"
          hint={`Nur für Ihre Organisation sichtbar. Höchstens ${PARTNER_NOTES_MAX_LENGTH} Zeichen.`}
        >
          <textarea
            id="partner-notes"
            rows={4}
            maxLength={PARTNER_NOTES_MAX_LENGTH}
            value={text('internalNotes')}
            onChange={(event) => set('internalNotes', event.target.value || null)}
            className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-brand focus:outline-none"
          />
        </Field>
      </fieldset>

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
                label="Ich habe geprüft, dass es sich um ein anderes Unternehmen handelt."
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
              : 'Partner anlegen'}
        </Button>
        <LinkButton
          href={isEdit ? `/subcontractors/${company.id}` : '/subcontractors'}
        >
          Abbrechen
        </LinkButton>
      </div>
    </form>
  );
}
