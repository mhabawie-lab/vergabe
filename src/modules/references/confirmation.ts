/**
 * Confirming a service classification.
 *
 * An automatic proposal never becomes a fact on its own. This module holds the
 * five decisions a person can take and the state each produces — in one place,
 * so the API route, both storage adapters and the UI cannot drift apart on
 * what "confirmed" means.
 *
 * Only `confirmed` and `manual` count as evidence. `rejected` and `unknown`
 * are deliberate statements too, but they say the opposite, and the difference
 * between them and an untouched `proposed` row matters: it records that
 * somebody looked.
 */

import type {
  ReferenceServiceCategory,
  ServiceConfirmationStatus,
} from '@/types/reference';

export const CONFIRMATION_ACTIONS = [
  'confirm',
  'change_and_confirm',
  'mark_unknown',
  'reject',
  'reset',
] as const;

export type ConfirmationAction = (typeof CONFIRMATION_ACTIONS)[number];

export const CONFIRMATION_ACTION_LABELS: Record<ConfirmationAction, string> = {
  confirm: 'Vorschlag bestätigen',
  change_and_confirm: 'Kategorie ändern und bestätigen',
  mark_unknown: 'Als unbekannt markieren',
  reject: 'Vorschlag verwerfen',
  reset: 'Bestätigung zurücksetzen',
};

/** Audit action names, matching those the database trigger writes. */
export const CONFIRMATION_AUDIT_ACTIONS: Record<ConfirmationAction, string> = {
  confirm: 'service_confirmed',
  change_and_confirm: 'service_category_changed',
  mark_unknown: 'service_marked_unknown',
  reject: 'service_rejected',
  reset: 'service_confirmation_reset',
};

/** The state a service is in before a decision is applied. */
export interface ServiceConfirmationState {
  serviceCategory: ReferenceServiceCategory;
  confirmationStatus: ServiceConfirmationStatus;
  confirmedByUser: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
}

/** The state a decision produces. */
export interface ServiceConfirmationTransition {
  serviceCategory: ReferenceServiceCategory;
  confirmationStatus: ServiceConfirmationStatus;
  confirmedByUser: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
}

export class ConfirmationRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfirmationRuleError';
  }
}

/**
 * Applies a decision to a service.
 *
 * @param targetCategory required for `change_and_confirm`, ignored otherwise.
 * @throws ConfirmationRuleError when the decision is not permitted.
 */
export function applyConfirmationAction(
  current: ServiceConfirmationState,
  action: ConfirmationAction,
  userId: string | null,
  targetCategory: ReferenceServiceCategory | null,
  now: Date = new Date(),
): ServiceConfirmationTransition {
  const timestamp = now.toISOString();

  switch (action) {
    case 'confirm': {
      // Confirming `unknown` would assert "we established there is no
      // service", which is what mark_unknown is for. Keeping them apart stops
      // an accidental click from turning an open question into a finding.
      if (current.serviceCategory === 'unknown') {
        throw new ConfirmationRuleError(
          'Eine unbestimmte Leistungsart kann nicht bestätigt werden. Wählen Sie eine Kategorie oder markieren Sie sie ausdrücklich als unbekannt.',
        );
      }

      return {
        serviceCategory: current.serviceCategory,
        confirmationStatus: 'confirmed',
        confirmedByUser: true,
        confirmedAt: timestamp,
        confirmedBy: userId,
      };
    }

    case 'change_and_confirm': {
      if (targetCategory === null) {
        throw new ConfirmationRuleError('Es wurde keine Kategorie ausgewählt.');
      }

      // Choosing `unknown` here is the same statement as mark_unknown, so it
      // is routed to that state rather than stored as a confirmed service.
      if (targetCategory === 'unknown') {
        return {
          serviceCategory: 'unknown',
          confirmationStatus: 'unknown',
          confirmedByUser: false,
          confirmedAt: timestamp,
          confirmedBy: userId,
        };
      }

      return {
        serviceCategory: targetCategory,
        confirmationStatus: 'manual',
        confirmedByUser: true,
        confirmedAt: timestamp,
        confirmedBy: userId,
      };
    }

    case 'mark_unknown':
      return {
        serviceCategory: 'unknown',
        confirmationStatus: 'unknown',
        confirmedByUser: false,
        confirmedAt: timestamp,
        confirmedBy: userId,
      };

    case 'reject':
      // The category is kept so the record still shows what was proposed and
      // turned down — that is the point of recording a rejection.
      return {
        serviceCategory: current.serviceCategory,
        confirmationStatus: 'rejected',
        confirmedByUser: false,
        confirmedAt: timestamp,
        confirmedBy: userId,
      };

    case 'reset':
      return {
        serviceCategory: current.serviceCategory,
        confirmationStatus: 'proposed',
        confirmedByUser: false,
        confirmedAt: null,
        confirmedBy: null,
      };

    default: {
      const exhaustive: never = action;
      throw new ConfirmationRuleError(`Unbekannte Aktion: ${String(exhaustive)}`);
    }
  }
}

/** True when this state counts as evidence of a delivered service. */
export function countsAsEvidence(status: ServiceConfirmationStatus): boolean {
  return status === 'confirmed' || status === 'manual';
}

/**
 * Whether a set of services may be confirmed in bulk.
 *
 * Bulk confirmation is the one place where a single click asserts something
 * about several customer references at once, so it is restricted hard:
 * every entry must still be an untouched proposal of the *same* category, and
 * `unknown` is excluded entirely — a project whose name yielded nothing must
 * be decided individually.
 */
export function canBulkConfirm(
  services: ReadonlyArray<{
    serviceCategory: ReferenceServiceCategory;
    confirmationStatus: ServiceConfirmationStatus;
  }>,
): { allowed: boolean; reason: string | null } {
  if (services.length === 0) {
    return { allowed: false, reason: 'Es wurde nichts ausgewählt.' };
  }

  if (services.some((service) => service.confirmationStatus !== 'proposed')) {
    return {
      allowed: false,
      reason: 'Die Auswahl enthält bereits entschiedene Einträge.',
    };
  }

  if (services.some((service) => service.serviceCategory === 'unknown')) {
    return {
      allowed: false,
      reason:
        'Unbestimmte Leistungsarten lassen sich nicht sammelbestätigen. Objekte ohne eindeutigen Namen müssen einzeln entschieden werden.',
    };
  }

  const categories = new Set(services.map((service) => service.serviceCategory));
  if (categories.size > 1) {
    return {
      allowed: false,
      reason:
        'Die Auswahl enthält unterschiedliche Kategorien. Sammelbestätigung ist nur für eine einheitliche Kategorie möglich.',
    };
  }

  return { allowed: true, reason: null };
}

/** Standing note shown above the bulk confirmation control. */
export const BULK_CONFIRM_NOTE =
  'Sammelbestätigung ist nur für offene Vorschläge derselben Kategorie möglich. Unbestimmte Leistungsarten sind ausgenommen und müssen einzeln entschieden werden.';
