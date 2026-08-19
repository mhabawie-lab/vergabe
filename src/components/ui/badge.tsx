import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import {
  TENDER_STATUS_LABELS,
  type DocumentDownloadStatus,
  type TenderStatus,
  DOCUMENT_DOWNLOAD_STATUS_LABELS,
} from '@/types/tender';
import {
  MATCH_RECOMMENDATION_LABELS,
  type MatchRecommendation,
} from '@/modules/matching/preview';
import type { ConnectorRunStatus } from '@/types/source';
import { CONNECTOR_RUN_STATUS_LABELS } from '@/types/source';

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'demo';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral:
    'bg-surface-sunken text-text-secondary ring-1 ring-inset ring-border-subtle',
  brand: 'bg-brand-subtle text-brand ring-1 ring-inset ring-brand/20',
  success: 'bg-success-subtle text-success ring-1 ring-inset ring-success/20',
  warning: 'bg-warning-subtle text-warning ring-1 ring-inset ring-warning/25',
  danger: 'bg-danger-subtle text-danger ring-1 ring-inset ring-danger/20',
  info: 'bg-info-subtle text-info ring-1 ring-inset ring-info/20',
  demo: 'bg-demo-subtle text-demo ring-1 ring-inset ring-demo-border',
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
}

export function Badge({
  children,
  tone = 'neutral',
  className,
  title,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The DEMO marker.
 *
 * Required on every record originating from a demo source — a hard rule, not
 * a styling choice (CLAUDE.md § Daten-Integrität).
 */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge
      tone="demo"
      className={cn('font-semibold tracking-wide uppercase', className)}
      title="Beispieldatensatz — keine echte Ausschreibung"
    >
      Demo
    </Badge>
  );
}

const STATUS_TONES: Record<TenderStatus, BadgeTone> = {
  published: 'success',
  amended: 'info',
  closed: 'neutral',
  awarded: 'brand',
  cancelled: 'danger',
};

export function TenderStatusBadge({ status }: { status: TenderStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{TENDER_STATUS_LABELS[status]}</Badge>;
}

const RECOMMENDATION_TONES: Record<MatchRecommendation, BadgeTone> = {
  go: 'success',
  review: 'warning',
  no_go: 'danger',
};

export function RecommendationBadge({
  recommendation,
  className,
}: {
  recommendation: MatchRecommendation;
  className?: string;
}) {
  return (
    <Badge
      tone={RECOMMENDATION_TONES[recommendation]}
      className={cn('font-semibold', className)}
      title="Vorläufige regelbasierte Bewertung — die KI-Analyse folgt in Phase 3."
    >
      {MATCH_RECOMMENDATION_LABELS[recommendation]}
    </Badge>
  );
}

const RUN_STATUS_TONES: Record<ConnectorRunStatus, BadgeTone> = {
  running: 'info',
  success: 'success',
  partial: 'warning',
  failed: 'danger',
};

export function ConnectorRunStatusBadge({ status }: { status: ConnectorRunStatus }) {
  return (
    <Badge tone={RUN_STATUS_TONES[status]}>
      {CONNECTOR_RUN_STATUS_LABELS[status]}
    </Badge>
  );
}

const DOCUMENT_STATUS_TONES: Record<DocumentDownloadStatus, BadgeTone> = {
  pending: 'neutral',
  downloaded: 'success',
  failed: 'danger',
  unavailable: 'warning',
};

export function DocumentStatusBadge({
  status,
}: {
  status: DocumentDownloadStatus;
}) {
  return (
    <Badge tone={DOCUMENT_STATUS_TONES[status]}>
      {DOCUMENT_DOWNLOAD_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Marks a screen whose full functionality arrives in a later phase. */
export function PhaseBadge({ phase }: { phase: number }) {
  return (
    <Badge tone="info" title={`Vollständige Funktion ab Phase ${phase}`}>
      Phase {phase}
    </Badge>
  );
}
