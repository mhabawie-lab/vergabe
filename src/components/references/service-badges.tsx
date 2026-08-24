import { Badge, type BadgeTone } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import {
  REFERENCE_SERVICE_CATEGORY_LABELS,
  type ReferenceServiceCategory,
} from '@/types/reference';

/**
 * Colour per service category.
 *
 * `unknown` is deliberately the neutral tone: it is a real, honest state — the
 * service was not determined — and must not look like a warning or a defect.
 */
const SERVICE_TONES: Record<ReferenceServiceCategory, BadgeTone> = {
  security: 'brand',
  paramedic: 'danger',
  cleaning: 'info',
  warehouse: 'neutral',
  construction_support: 'warning',
  facility_management: 'success',
  other: 'neutral',
  unknown: 'neutral',
};

export function ServiceBadge({
  category,
  confirmed,
  className,
}: {
  category: ReferenceServiceCategory;
  /** Unconfirmed entries are marked as proposals. */
  confirmed: boolean;
  className?: string;
}) {
  return (
    <Badge
      tone={SERVICE_TONES[category]}
      className={cn(!confirmed && 'opacity-80', className)}
      title={
        confirmed
          ? 'Bestätigte Leistungsart'
          : 'Vorschlag — noch nicht bestätigt und daher ohne Nachweiswirkung'
      }
    >
      {REFERENCE_SERVICE_CATEGORY_LABELS[category]}
      {!confirmed && <span aria-hidden> ?</span>}
      {!confirmed && <span className="sr-only"> (Vorschlag)</span>}
    </Badge>
  );
}

/** Compact list of categories for a table cell. */
export function ServiceBadgeList({
  categories,
  hasUnconfirmed,
  limit = 3,
}: {
  categories: readonly ReferenceServiceCategory[];
  hasUnconfirmed: boolean;
  limit?: number;
}) {
  if (categories.length === 0) {
    return <span className="text-xs text-text-muted">—</span>;
  }

  const shown = categories.slice(0, limit);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((category) => (
        <ServiceBadge key={category} category={category} confirmed={!hasUnconfirmed} />
      ))}
      {categories.length > limit && (
        <span className="text-[11px] text-text-muted">
          +{categories.length - limit}
        </span>
      )}
    </div>
  );
}
