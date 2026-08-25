/**
 * Status vocabulary of the Subunternehmer-Radar.
 *
 * The colours carry meaning and are used consistently: green only ever means
 * "established", amber "stated but unverified", red "blocked or expired",
 * grey "unknown". A viewer must be able to tell a fact from a claim at a
 * glance, because that difference decides whether a partner can be offered to
 * a client.
 */

import { AlertTriangle, BadgeCheck, CircleHelp, ShieldOff } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import {
  DATACENTER_EXPERIENCE_LABELS,
  PARTNER_SERVICE_CATEGORY_LABELS,
  PARTNER_STATUS_LABELS,
  RELATIONSHIP_DIRECTION_DESCRIPTIONS,
  RELATIONSHIP_DIRECTION_LABELS,
  SIGNAL_CONFIDENCE_LABELS,
  SIGNAL_STATUS_LABELS,
  SIGNAL_TYPE_LABELS,
  VERIFICATION_STATUS_DESCRIPTIONS,
  VERIFICATION_STATUS_LABELS,
  type CredentialSummary,
  type DatacenterExperienceStatus,
  type PartnerServiceCategory,
  type PartnerStatus,
  type RelationshipDirection,
  type SignalConfidence,
  type SignalStatus,
  type SignalType,
  type VerificationStatus,
} from '@/types/partner';

const STATUS_TONES: Record<PartnerStatus, BadgeTone> = {
  prospect: 'neutral',
  contacted: 'info',
  in_review: 'warning',
  qualified: 'success',
  preferred: 'brand',
  blocked: 'danger',
  inactive: 'neutral',
  archived: 'neutral',
};

export function PartnerStatusBadge({ status }: { status: PartnerStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{PARTNER_STATUS_LABELS[status]}</Badge>;
}

const DIRECTION_TONES: Record<RelationshipDirection, BadgeTone> = {
  can_work_for_us: 'info',
  may_hire_us: 'brand',
  both: 'success',
  unknown: 'neutral',
};

export function DirectionBadge({ direction }: { direction: RelationshipDirection }) {
  return (
    <Badge
      tone={DIRECTION_TONES[direction]}
      title={RELATIONSHIP_DIRECTION_DESCRIPTIONS[direction]}
    >
      {RELATIONSHIP_DIRECTION_LABELS[direction]}
    </Badge>
  );
}

const VERIFICATION_TONES: Record<VerificationStatus, BadgeTone> = {
  unverified: 'neutral',
  // Amber, not green: the company said so, nobody checked.
  self_declared: 'warning',
  documents_reviewed: 'info',
  verified: 'success',
  expired: 'danger',
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <Badge tone={VERIFICATION_TONES[status]} title={VERIFICATION_STATUS_DESCRIPTIONS[status]}>
      {VERIFICATION_STATUS_LABELS[status]}
    </Badge>
  );
}

const DATACENTER_TONES: Record<DatacenterExperienceStatus, BadgeTone> = {
  confirmed: 'success',
  claimed: 'warning',
  none: 'neutral',
  unknown: 'neutral',
};

export function DatacenterBadge({ status }: { status: DatacenterExperienceStatus }) {
  return (
    <Badge tone={DATACENTER_TONES[status]}>{DATACENTER_EXPERIENCE_LABELS[status]}</Badge>
  );
}

/**
 * Services a partner offers.
 *
 * Confirmed and self-declared are rendered differently on purpose — a
 * self-declared service does not count towards a match and must not look as
 * if it does.
 */
export function ServiceBadges({
  confirmed,
  declared,
  limit = 4,
}: {
  confirmed: readonly PartnerServiceCategory[];
  declared?: readonly PartnerServiceCategory[];
  limit?: number;
}) {
  const shown = confirmed.slice(0, limit);
  const hidden = confirmed.length - shown.length;
  const declaredOnly = (declared ?? []).filter(
    (category) => !confirmed.includes(category),
  );

  if (shown.length === 0 && declaredOnly.length === 0) {
    return <span className="text-xs text-text-muted">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((category) => (
        <Badge key={category} tone="success" title="Bestätigte Leistung">
          {PARTNER_SERVICE_CATEGORY_LABELS[category]}
        </Badge>
      ))}
      {hidden > 0 && <span className="text-[11px] text-text-muted">+{hidden}</span>}
      {declaredOnly.slice(0, 2).map((category) => (
        <Badge
          key={category}
          tone="warning"
          title="Selbst angegeben — zählt nicht als Nachweis"
        >
          {PARTNER_SERVICE_CATEGORY_LABELS[category]} (angegeben)
        </Badge>
      ))}
    </div>
  );
}

/** Compact credential state for the list column. */
export function CredentialBadge({ summary }: { summary: CredentialSummary }) {
  if (summary.expired > 0) {
    return (
      <Badge tone="danger" title={`${summary.expired} abgelaufen`}>
        <AlertTriangle className="size-3" aria-hidden />
        {summary.expired} abgelaufen
      </Badge>
    );
  }

  if (summary.missingRequired.length > 0) {
    return (
      <Badge
        tone="warning"
        title={`Fehlende Pflichtnachweise: ${summary.missingRequired.length}`}
      >
        {summary.missingRequired.length} Pflichtnachweis
        {summary.missingRequired.length === 1 ? '' : 'e'} offen
      </Badge>
    );
  }

  if (summary.expiringSoon > 0) {
    return <Badge tone="warning">{summary.expiringSoon} läuft bald ab</Badge>;
  }

  if (summary.pendingReview > 0) {
    return <Badge tone="info">{summary.pendingReview} ungeprüft</Badge>;
  }

  if (summary.valid > 0) {
    return (
      <Badge tone="success">
        <BadgeCheck className="size-3" aria-hidden />
        {summary.valid} gültig
      </Badge>
    );
  }

  return (
    <Badge tone="neutral">
      <CircleHelp className="size-3" aria-hidden />
      Keine Nachweise
    </Badge>
  );
}

export function BlockedBadge({ reason }: { reason: string | null }) {
  return (
    <Badge tone="danger" title={reason ?? 'Gesperrt'}>
      <ShieldOff className="size-3" aria-hidden />
      Gesperrt
    </Badge>
  );
}

const SIGNAL_STATUS_TONES: Record<SignalStatus, BadgeTone> = {
  new: 'brand',
  reviewed: 'info',
  relevant: 'success',
  contacted: 'info',
  done: 'neutral',
  discarded: 'neutral',
  expired: 'neutral',
};

export function SignalStatusBadge({ status }: { status: SignalStatus }) {
  return <Badge tone={SIGNAL_STATUS_TONES[status]}>{SIGNAL_STATUS_LABELS[status]}</Badge>;
}

export function SignalTypeBadge({ type }: { type: SignalType }) {
  return <Badge tone="neutral">{SIGNAL_TYPE_LABELS[type]}</Badge>;
}

const CONFIDENCE_TONES: Record<SignalConfidence, BadgeTone> = {
  low: 'neutral',
  medium: 'warning',
  high: 'info',
};

/**
 * Confidence in an observation.
 *
 * Never green: a signal is a hint even at its most credible, and green would
 * read as confirmation.
 */
export function ConfidenceBadge({ confidence }: { confidence: SignalConfidence }) {
  return (
    <Badge tone={CONFIDENCE_TONES[confidence]} title={SIGNAL_CONFIDENCE_LABELS[confidence]}>
      Konfidenz: {confidence === 'low' ? 'gering' : confidence === 'medium' ? 'mittel' : 'hoch'}
    </Badge>
  );
}
