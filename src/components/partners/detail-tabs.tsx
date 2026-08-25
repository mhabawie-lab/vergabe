import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

export const PARTNER_TABS = [
  'overview',
  'contacts',
  'services',
  'regions',
  'availability',
  'qualifications',
  'documents',
  'rates',
  'projects',
  'signals',
  'activities',
  'chain',
  'audit',
] as const;

export type PartnerTab = (typeof PARTNER_TABS)[number];

export const PARTNER_TAB_LABELS: Record<PartnerTab, string> = {
  overview: 'Übersicht',
  contacts: 'Kontakte',
  services: 'Leistungen',
  regions: 'Regionen',
  availability: 'Verfügbarkeit',
  qualifications: 'Qualifikationen',
  documents: 'Nachweise',
  rates: 'Konditionen',
  projects: 'Projekte',
  signals: 'Signale',
  activities: 'Aktivitäten',
  chain: 'Nachunternehmerkette',
  audit: 'Audit-Historie',
};

export function isPartnerTab(value: string | undefined): value is PartnerTab {
  return value !== undefined && (PARTNER_TABS as readonly string[]).includes(value);
}

/**
 * Tabs as links rather than local state.
 *
 * The active tab lives in the URL, so a colleague can be sent straight to the
 * credentials of a partner instead of "open X, then click the fourth tab".
 * `visible` hides the tabs a role may not see at all — rates need their own
 * permission.
 */
export function DetailTabs({
  companyId,
  active,
  visible,
}: {
  companyId: string;
  active: PartnerTab;
  visible: readonly PartnerTab[];
}) {
  return (
    <div className="overflow-x-auto border-b border-border-subtle">
      <nav className="flex min-w-max gap-1 px-2" aria-label="Bereiche">
        {visible.map((tab) => (
          <Link
            key={tab}
            href={`/subcontractors/${companyId}?tab=${tab}`}
            aria-current={tab === active ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors',
              tab === active
                ? 'border-brand text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {PARTNER_TAB_LABELS[tab]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
