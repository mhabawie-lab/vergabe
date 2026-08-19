import type { Metadata } from 'next';
import { TenderTable } from '@/components/tenders/tender-table';
import { Card } from '@/components/ui/card';
import { PageHeader, PhasePlaceholder } from '@/components/ui/page';
import { requirePermission } from '@/lib/auth/session';
import { getTenderRepository } from '@/lib/db';
import { formatNumber } from '@/lib/utils/format';
import {
  scoreTender,
  TOP_MATCH_THRESHOLD,
  type MatchPreview,
} from '@/modules/matching/preview';
import { tenderSearchQuerySchema } from '@/modules/tenders/query';
import type { TenderListItem } from '@/types/tender';

export const metadata: Metadata = { title: 'Top Matches' };

/**
 * Ranking window.
 *
 * Phase 1 ranks in the application because the rule-based preview has no SQL
 * representation. Phase 3 persists match_scores per organisation and this
 * becomes an indexed ORDER BY, which is what makes it scale.
 */
const RANKING_WINDOW = 200;

export default async function MatchesPage() {
  await requirePermission('tenders:read');

  const repository = await getTenderRepository();
  const result = await repository.search(
    tenderSearchQuerySchema.parse({
      openOnly: 'true',
      sort: 'submission_deadline',
      direction: 'asc',
      pageSize: String(RANKING_WINDOW > 100 ? 100 : RANKING_WINDOW),
    }),
  );

  const ranked: Array<{ tender: TenderListItem; preview: MatchPreview }> = result.items
    .map((tender) => ({ tender, preview: scoreTender(tender) }))
    .filter((entry) => entry.preview.score >= TOP_MATCH_THRESHOLD)
    .sort((a, b) => b.preview.score - a.preview.score);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Top Matches"
        description={`Laufende Ausschreibungen mit einer vorläufigen Relevanz ab ${TOP_MATCH_THRESHOLD} %. Die Bewertung ist regelbasiert und berücksichtigt Branche, CPV-Code, Region und Auftragswert.`}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <p className="text-xs text-text-secondary">
            <span className="tabular font-semibold text-text-primary">
              {formatNumber(ranked.length)}
            </span>{' '}
            {ranked.length === 1 ? 'Treffer' : 'Treffer'} · geprüft wurden{' '}
            {formatNumber(result.items.length)} laufende Ausschreibungen
          </p>
        </div>

        <TenderTable
          tenders={ranked.map((entry) => entry.tender)}
          emptyMessage="Derzeit erreicht keine laufende Ausschreibung die Schwelle für einen Top Match."
        />
      </Card>

      <PhasePlaceholder phase={3} title="Vollständige Match-Engine">
        Die endgültige Bewertung kombiniert die regelbasierten Kriterien mit den
        per KI aus Leistungsbeschreibung und Anlagen extrahierten Anforderungen
        und gleicht sie gegen Zertifikate, Referenzen und
        Mitarbeiterqualifikationen des Unternehmensprofils ab. Bis dahin dient
        diese Liste als Vorfilter, nicht als Vergabeentscheidung.
      </PhasePlaceholder>
    </div>
  );
}
