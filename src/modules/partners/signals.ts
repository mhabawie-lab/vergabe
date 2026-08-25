/**
 * Signals — observations about a company.
 *
 * The governing rule: a signal is a *hint*, never an established fact. It
 * always carries where it came from and how confident we are, the screens
 * label it as an observation, and it never changes the company's stored
 * relationship direction on its own. A person decides that.
 */

import {
  DEMAND_SIGNAL_TYPES,
  type PartnerSignal,
  type RelationshipDirection,
  type SignalConfidence,
  type SignalStatus,
  type SignalType,
} from '@/types/partner';

export class SignalRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignalRuleError';
  }
}

/** Statuses at which a signal still needs attention. */
export const OPEN_SIGNAL_STATUSES: readonly SignalStatus[] = [
  'new',
  'reviewed',
  'relevant',
  'contacted',
];

export function isDemandSignal(type: SignalType): boolean {
  return DEMAND_SIGNAL_TYPES.includes(type);
}

/** True when the signal has passed its own validity date. */
export function isSignalExpired(
  signal: Pick<PartnerSignal, 'validUntil' | 'status'>,
  today: Date = new Date(),
): boolean {
  if (signal.status === 'expired') return true;
  if (signal.validUntil === null) return false;
  return signal.validUntil < today.toISOString().slice(0, 10);
}

/**
 * Whether a signal may be counted as current.
 *
 * An expired or discarded observation stays visible — it is still part of the
 * record — but it does not count towards "this company is currently looking
 * for a subcontractor".
 */
export function countsAsOpenDemand(
  signal: Pick<PartnerSignal, 'signalType' | 'status' | 'validUntil'>,
  today: Date = new Date(),
): boolean {
  if (!isDemandSignal(signal.signalType)) return false;
  if (!OPEN_SIGNAL_STATUSES.includes(signal.status)) return false;
  return !isSignalExpired(signal, today);
}

export const SIGNAL_ACTIONS = [
  'mark_reviewed',
  'mark_relevant',
  'mark_contacted',
  'mark_done',
  'discard',
  'mark_expired',
] as const;

export type SignalAction = (typeof SIGNAL_ACTIONS)[number];

export const SIGNAL_ACTION_LABELS: Record<SignalAction, string> = {
  mark_reviewed: 'Als geprüft markieren',
  mark_relevant: 'Als relevant markieren',
  mark_contacted: 'Kontaktaufnahme dokumentieren',
  mark_done: 'Als erledigt markieren',
  discard: 'Verwerfen',
  mark_expired: 'Als abgelaufen markieren',
};

const ACTION_TARGET: Record<SignalAction, SignalStatus> = {
  mark_reviewed: 'reviewed',
  mark_relevant: 'relevant',
  mark_contacted: 'contacted',
  mark_done: 'done',
  discard: 'discarded',
  mark_expired: 'expired',
};

export const SIGNAL_AUDIT_ACTIONS: Record<SignalAction, string> = {
  mark_reviewed: 'signal_reviewed',
  mark_relevant: 'signal_marked_relevant',
  mark_contacted: 'signal_contacted',
  mark_done: 'signal_done',
  discard: 'signal_discarded',
  mark_expired: 'signal_expired',
};

/**
 * Applies a decision to a signal.
 *
 * @throws SignalRuleError when the transition would lose information — a
 *         discarded signal is not re-opened by marking it reviewed; that would
 *         quietly overwrite somebody's judgement.
 */
export function applySignalAction(
  current: Pick<PartnerSignal, 'status'>,
  action: SignalAction,
): { status: SignalStatus } {
  if (current.status === 'discarded' && action !== 'mark_reviewed') {
    if (action === 'discard') {
      throw new SignalRuleError('Das Signal ist bereits verworfen.');
    }
  }

  if (current.status === 'done' && action === 'mark_reviewed') {
    throw new SignalRuleError(
      'Ein erledigtes Signal wird nicht auf „geprüft" zurückgesetzt.',
    );
  }

  return { status: ACTION_TARGET[action] };
}

/**
 * What the company's relationship direction *would* be if this signal were
 * taken at face value.
 *
 * Returned as a suggestion for the user to accept. It is never applied
 * automatically: a single observation — someone mentioned they were looking
 * for staff — is not enough to reclassify a company we may also work for.
 */
export function suggestDirectionFromSignal(
  signal: Pick<PartnerSignal, 'signalType'>,
  current: RelationshipDirection,
): { suggested: RelationshipDirection; changed: boolean; reason: string } {
  if (!isDemandSignal(signal.signalType)) {
    return {
      suggested: current,
      changed: false,
      reason: 'Das Signal sagt nichts über die Beziehungsrichtung aus.',
    };
  }

  if (current === 'may_hire_us' || current === 'both') {
    return {
      suggested: current,
      changed: false,
      reason: 'Die Richtung deckt bereits ab, dass das Unternehmen selbst vergibt.',
    };
  }

  const suggested: RelationshipDirection =
    current === 'can_work_for_us' ? 'both' : 'may_hire_us';

  return {
    suggested,
    changed: true,
    reason:
      'Das Signal deutet darauf hin, dass das Unternehmen selbst Subunternehmer sucht. Die Richtung wird nicht automatisch geändert — bitte bestätigen.',
  };
}

export interface SignalInputCheck {
  signalType: SignalType;
  sourceType: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  observedAt: string | null;
  confidence: SignalConfidence;
  partnerCompanyId: string | null;
  companyNameRaw: string | null;
}

export interface SignalValidationResult {
  valid: boolean;
  messages: Array<{ field: string; message: string }>;
}

/**
 * Validates a signal before it is stored.
 *
 * The source is mandatory. An observation without a stated origin cannot be
 * checked by anyone later, and an unverifiable claim about another company is
 * exactly what must not end up in this system.
 */
export function validateSignalInput(input: SignalInputCheck): SignalValidationResult {
  const messages: Array<{ field: string; message: string }> = [];

  if (input.sourceType === null || input.sourceType.trim().length === 0) {
    messages.push({
      field: 'sourceType',
      message:
        'Die Quelle ist ein Pflichtfeld. Ein Hinweis ohne Herkunft lässt sich später nicht prüfen.',
    });
  }

  // A URL or a named source — at least one, so the origin is retraceable.
  const hasNamedSource =
    (input.sourceName !== null && input.sourceName.trim().length > 0) ||
    (input.sourceUrl !== null && input.sourceUrl.trim().length > 0);
  if (!hasNamedSource) {
    messages.push({
      field: 'sourceName',
      message:
        'Bitte die Quelle benennen oder verlinken — etwa den Gesprächspartner oder die Fundstelle.',
    });
  }

  if (input.observedAt === null || !/^\d{4}-\d{2}-\d{2}$/.test(input.observedAt)) {
    messages.push({
      field: 'observedAt',
      message: 'Das Beobachtungsdatum ist ein Pflichtfeld.',
    });
  }

  if (input.partnerCompanyId === null && (input.companyNameRaw ?? '').trim().length === 0) {
    messages.push({
      field: 'companyNameRaw',
      message:
        'Bitte ein Unternehmen verknüpfen oder den Firmennamen erfassen — ein anonymes Signal ist nicht verwertbar.',
    });
  }

  if (input.confidence === 'high' && input.sourceUrl === null && input.sourceName === null) {
    messages.push({
      field: 'confidence',
      message:
        'Hohe Konfidenz setzt eine belegbare Quelle voraus. Bitte Quelle ergänzen oder Konfidenz senken.',
    });
  }

  return { valid: messages.length === 0, messages };
}

/** Standing note above the signal board. */
export const SIGNAL_DISCLAIMER =
  'Signale sind Beobachtungen, keine bestätigten Tatsachen. Jedes Signal nennt seine Quelle und eine Konfidenz; die Beziehungsrichtung eines Unternehmens wird dadurch nicht automatisch geändert.';
