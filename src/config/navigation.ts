/**
 * Sidebar navigation.
 *
 * `permission` gates an entry: it is hidden when the current role lacks it.
 * `phase` marks screens whose full functionality lands in a later phase —
 * they are reachable today but state plainly what is not built yet.
 */

import type { Permission } from '@/config/roles';

export interface NavItem {
  label: string;
  href: string;
  /** Lucide icon name, resolved in the sidebar component. */
  icon: NavIconName;
  permission?: Permission;
  /** Development phase in which the screen becomes fully functional. */
  phase?: 2 | 3 | 4 | 5;
}

export type NavIconName =
  | 'dashboard'
  | 'customers'
  | 'references'
  | 'imports'
  | 'tenders'
  | 'matches'
  | 'deadlines'
  | 'authorities'
  | 'awards'
  | 'documents'
  | 'searchProfiles'
  | 'company'
  | 'ai'
  | 'sources'
  | 'admin';

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: 'Übersicht',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
      { label: 'Ausschreibungen', href: '/tenders', icon: 'tenders' },
      { label: 'Top Matches', href: '/matches', icon: 'matches' },
      { label: 'Fristen', href: '/deadlines', icon: 'deadlines' },
    ],
  },
  {
    label: 'Markt',
    items: [
      { label: 'Auftraggeber', href: '/authorities', icon: 'authorities' },
      { label: 'Zuschläge', href: '/awards', icon: 'awards' },
    ],
  },
  {
    label: 'Eigene Daten',
    items: [
      {
        label: 'Kunden',
        href: '/customers',
        icon: 'customers',
        permission: 'clients:read',
      },
      {
        label: 'Referenzen',
        href: '/references',
        icon: 'references',
        permission: 'references:read',
      },
      {
        label: 'Datenimport',
        href: '/imports/references',
        icon: 'imports',
        permission: 'references:import',
      },
    ],
  },
  {
    label: 'Arbeitsbereich',
    items: [
      {
        label: 'Dokumente',
        href: '/documents',
        icon: 'documents',
        permission: 'documents:read',
        phase: 3,
      },
      {
        label: 'Suchprofile',
        href: '/search-profiles',
        icon: 'searchProfiles',
        phase: 2,
      },
      {
        label: 'Unternehmensprofil',
        href: '/company',
        icon: 'company',
        permission: 'company:read',
        phase: 4,
      },
      { label: 'KI-Analyse', href: '/ai-analysis', icon: 'ai', phase: 3 },
    ],
  },
  {
    label: 'System',
    items: [
      {
        label: 'Datenquellen',
        href: '/sources',
        icon: 'sources',
        permission: 'sources:read',
      },
      {
        label: 'Administration',
        href: '/admin',
        icon: 'admin',
        permission: 'members:read',
      },
    ],
  },
] as const;

/** Flat list, used for breadcrumb and active-route resolution. */
export const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap(
  (section) => section.items,
);

export function findNavItem(pathname: string): NavItem | undefined {
  // Longest match wins so /tenders/[id] resolves to the Ausschreibungen entry.
  return [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
