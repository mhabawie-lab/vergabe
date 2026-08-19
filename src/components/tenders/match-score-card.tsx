import { cn } from '@/lib/utils/cn';
import { RecommendationBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import type { MatchPreview } from '@/modules/matching/preview';

/**
 * Match score panel.
 *
 * Phase 1 shows the rule-based preview and says so explicitly. The panel is
 * the slot the phase-3 match engine fills — the layout does not change, only
 * the inputs behind it (CLAUDE.md § KI-Integration).
 */

function scoreToneClass(score: number): string {
  if (score >= 70) return 'text-success';
  if (score >= 40) return 'text-warning';
  return 'text-danger';
}

function barToneClass(score: number): string {
  if (score >= 70) return 'bg-success';
  if (score >= 40) return 'bg-warning';
  return 'bg-danger';
}

export function MatchScoreCard({ preview }: { preview: MatchPreview }) {
  return (
    <Card>
      <CardHeader
        title="Match Score"
        description="Vorläufig, regelbasiert"
        action={<RecommendationBadge recommendation={preview.recommendation} />}
      />
      <CardBody className="space-y-4">
        <div className="flex items-end gap-2">
          <span
            className={cn(
              'tabular text-4xl leading-none font-semibold tracking-tight',
              scoreToneClass(preview.score),
            )}
          >
            {preview.score}
          </span>
          <span className="pb-1 text-sm text-text-muted">/ 100 %</span>
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={preview.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Match Score"
        >
          <div
            className={cn('h-full rounded-full', barToneClass(preview.score))}
            style={{ width: `${preview.score}%` }}
          />
        </div>

        <ul className="space-y-2.5">
          {preview.criteria.map((criterion) => (
            <li key={criterion.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-medium text-text-primary">
                  {criterion.label}
                </span>
                <span className="tabular shrink-0 text-[11px] text-text-muted">
                  {criterion.points} / {criterion.maxPoints}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
                {criterion.detail}
              </p>
            </li>
          ))}
        </ul>

        <p className="rounded-lg border border-info/20 bg-info-subtle px-3 py-2 text-[11px] leading-snug text-info">
          Diese Bewertung beruht ausschließlich auf strukturierten Feldern
          (Branche, CPV, Region, Auftragswert). Die inhaltliche KI-Analyse der
          Leistungsbeschreibung und der Vergabeunterlagen — inklusive Erkennung
          fehlender Nachweise — folgt in Phase 3.
        </p>
      </CardBody>
    </Card>
  );
}
