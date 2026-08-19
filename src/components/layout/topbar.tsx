'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { DemoBadge } from '@/components/ui/badge';
import { findNavItem } from '@/config/navigation';
import { useAppNav } from './nav-context';

export function Topbar({ isDemoEnvironment }: { isDemoEnvironment: boolean }) {
  const pathname = usePathname();
  const { open, openDrawer } = useAppNav();
  const title = findNavItem(pathname)?.label ?? 'SicherVergabe';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border-subtle bg-surface-raised/95 px-4 backdrop-blur-sm sm:px-6">
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Navigation öffnen"
        aria-expanded={open}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-sunken lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <h2 className="truncate text-sm font-semibold text-text-primary">{title}</h2>

      {isDemoEnvironment && <DemoBadge className="hidden sm:inline-flex" />}

      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/tenders"
          className="inline-flex h-8 items-center gap-2 rounded-lg bg-surface-sunken px-2.5 text-xs text-text-muted ring-1 ring-inset ring-border-subtle transition-colors hover:text-text-secondary"
        >
          <Search className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Ausschreibungen durchsuchen</span>
          <span className="sm:hidden">Suche</span>
        </Link>
      </div>
    </header>
  );
}
