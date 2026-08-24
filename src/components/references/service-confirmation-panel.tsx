'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, HelpCircle, RotateCcw, X } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { cn } from '@/lib/utils/cn';
import { formatDateTime } from '@/lib/utils/format';
import {
  CONFIRMATION_ACTION_LABELS,
  type ConfirmationAction,
} from '@/modules/references/confirmation';
import {
  CLASSIFICATION_SOURCE_LABELS,
  REFERENCE_SERVICE_CATEGORIES,
  REFERENCE_SERVICE_CATEGORY_LABELS,
  SERVICE_CONFIRMATION_STATUS_DESCRIPTIONS,
  SERVICE_CONFIRMATION_STATUS_LABELS,
  type ReferenceProjectService,
  type ReferenceServiceCategory,
  type ServiceConfirmationStatus,
} from '@/types/reference';

/**
 * Deciding on a service classification.
 *
 * Every automatic proposal passes through here before it counts as evidence.
 * The five actions mirror the five states a service can be in; the panel shows
 * the full provenance — source, confidence, who decided and when — so the
 * decision is made with the same information an auditor would later see.
 *
 * A read-only user sees the same information and no controls.
 */

const STATUS_TONES: Record<ServiceConfirmationStatus, BadgeTone> = {
  proposed: 'warning',
  confirmed: 'success',
  manual: 'success',
  rejected: 'danger',
  unknown: 'neutral',
};

interface ServiceConfirmationPanelProps {
  services: readonly ReferenceProjectService[];
  /** False for viewers: the panel then renders without controls. */
  canEdit: boolean;
}

export function ServiceConfirmationPanel({
  services,
  canEdit,
}: ServiceConfirmationPanelProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [targetCategory, setTargetCategory] =
    useState<ReferenceServiceCategory>('security');

  async function decide(
    serviceId: string,
    action: ConfirmationAction,
    category: ReferenceServiceCategory | null = null,
  ): Promise<void> {
    setError(null);
    setPendingId(serviceId);

    try {
      const response = await fetch(`/api/v1/references/services/${serviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetCategory: category }),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? ((data as { error: { message?: string } }).error.message ??
              'Die Entscheidung konnte nicht gespeichert werden.')
            : 'Die Entscheidung konnte nicht gespeichert werden.';
        setError(message);
        return;
      }

      setChangingId(null);
      router.refresh();
    } catch {
      setError('Die Entscheidung konnte nicht gespeichert werden.');
    } finally {
      setPendingId(null);
    }
  }

  if (services.length === 0) {
    return <p className="text-sm text-text-muted">Keine Leistungsart erfasst.</p>;
  }

  return (
    <div className="space-y-3">
      {error !== null && (
        <p
          role="alert"
          className="rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {services.map((service) => {
          const busy = pendingId === service.id;
          const isChanging = changingId === service.id;
          const decided = service.confirmationStatus !== 'proposed';

          return (
            <li
              key={service.id}
              className={cn(
                'rounded-lg border p-3.5',
                service.confirmationStatus === 'proposed'
                  ? 'border-warning/30 bg-warning-subtle/30'
                  : 'border-border-subtle',
              )}
            >
              {/* --- Header ------------------------------------------------ */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-text-primary">
                  {REFERENCE_SERVICE_CATEGORY_LABELS[service.serviceCategory]}
                </span>
                <Badge
                  tone={STATUS_TONES[service.confirmationStatus]}
                  title={
                    SERVICE_CONFIRMATION_STATUS_DESCRIPTIONS[service.confirmationStatus]
                  }
                >
                  {SERVICE_CONFIRMATION_STATUS_LABELS[service.confirmationStatus]}
                </Badge>
                {service.confirmedByUser && (
                  <Badge tone="brand" title="Zählt als Nachweis">
                    Nachweis
                  </Badge>
                )}
              </div>

              {/* --- Provenance -------------------------------------------- */}
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
                {service.serviceLabel !== null && (
                  <div className="flex gap-1.5">
                    <dt className="text-text-muted">Anzeigename:</dt>
                    <dd className="text-text-secondary">{service.serviceLabel}</dd>
                  </div>
                )}
                <div className="flex gap-1.5">
                  <dt className="text-text-muted">Erkennungsquelle:</dt>
                  <dd className="text-text-secondary">
                    {CLASSIFICATION_SOURCE_LABELS[service.classificationSource]}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-text-muted">Konfidenz:</dt>
                  <dd className="tabular text-text-secondary">
                    {service.classificationConfidence === null
                      ? '—'
                      : `${Math.round(service.classificationConfidence * 100)} %`}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-text-muted">Entschieden am:</dt>
                  <dd className="tabular text-text-secondary">
                    {service.confirmedAt === null
                      ? '—'
                      : formatDateTime(service.confirmedAt)}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-text-muted">Entschieden von:</dt>
                  <dd className="text-text-secondary">
                    {service.confirmedByName ?? (service.confirmedBy === null ? '—' : '—')}
                  </dd>
                </div>
              </dl>

              {service.notes !== null && (
                <p className="mt-2 text-[11px] leading-snug text-text-muted">
                  {service.notes}
                </p>
              )}

              {/* --- Actions ----------------------------------------------- */}
              {canEdit && (
                <div className="mt-3 border-t border-border-subtle pt-3">
                  {isChanging ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[14rem] flex-1">
                        <label
                          htmlFor={`category-${service.id}`}
                          className="mb-1 block text-[11px] font-medium text-text-secondary"
                        >
                          Neue Kategorie
                        </label>
                        <Select
                          id={`category-${service.id}`}
                          value={targetCategory}
                          onChange={(event) =>
                            setTargetCategory(
                              event.target.value as ReferenceServiceCategory,
                            )
                          }
                          options={REFERENCE_SERVICE_CATEGORIES.map((category) => ({
                            value: category,
                            label: REFERENCE_SERVICE_CATEGORY_LABELS[category],
                          }))}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy}
                        onClick={() =>
                          void decide(service.id, 'change_and_confirm', targetCategory)
                        }
                      >
                        Übernehmen und bestätigen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setChangingId(null)}
                      >
                        Abbrechen
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Confirming an undetermined category would assert a
                          finding that was never made — mark_unknown is the
                          honest action there, so confirm is hidden. */}
                      {!decided && service.serviceCategory !== 'unknown' && (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busy}
                          onClick={() => void decide(service.id, 'confirm')}
                        >
                          <Check className="size-3.5" aria-hidden />
                          {CONFIRMATION_ACTION_LABELS.confirm}
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setTargetCategory(
                            service.serviceCategory === 'unknown'
                              ? 'security'
                              : service.serviceCategory,
                          );
                          setChangingId(service.id);
                        }}
                      >
                        {CONFIRMATION_ACTION_LABELS.change_and_confirm}
                      </Button>

                      {service.confirmationStatus !== 'unknown' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void decide(service.id, 'mark_unknown')}
                        >
                          <HelpCircle className="size-3.5" aria-hidden />
                          {CONFIRMATION_ACTION_LABELS.mark_unknown}
                        </Button>
                      )}

                      {!decided && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void decide(service.id, 'reject')}
                        >
                          <X className="size-3.5" aria-hidden />
                          {CONFIRMATION_ACTION_LABELS.reject}
                        </Button>
                      )}

                      {decided && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void decide(service.id, 'reset')}
                        >
                          <RotateCcw className="size-3.5" aria-hidden />
                          {CONFIRMATION_ACTION_LABELS.reset}
                        </Button>
                      )}

                      {busy && (
                        <span className="text-[11px] text-text-muted">
                          Wird gespeichert …
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!canEdit && (
        <p className="text-[11px] leading-snug text-text-muted">
          Ihre Rolle erlaubt nur das Lesen. Das Bestätigen und Ändern von
          Leistungsarten ist Bid Managern und Organisations-Admins vorbehalten.
        </p>
      )}
    </div>
  );
}
