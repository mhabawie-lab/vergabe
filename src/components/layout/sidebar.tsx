'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, X } from 'lucide-react';
import { NAV_SECTIONS, type NavItem } from '@/config/navigation';
import { ROLE_LABELS, type Permission, type Role } from '@/config/roles';
import { cn } from '@/lib/utils/cn';
import { NavIcon } from './nav-icons';
import { useAppNav } from './nav-context';
import { ThemeToggle } from './theme-toggle';

interface SidebarProps {
  /** Permissions of the current session; entries without them are hidden. */
  permissions: readonly Permission[];
  role: Role;
  organizationName: string;
  userName: string;
  isDemoEnvironment: boolean;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
        active
          ? 'bg-brand-subtle font-medium text-brand'
          : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute top-1.5 bottom-1.5 -left-2 w-0.5 rounded-full bg-brand"
        />
      )}
      <NavIcon name={item.icon} className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {item.phase !== undefined && (
        <span
          title={`Vollständige Funktion ab Phase ${item.phase}`}
          className="ml-auto shrink-0 rounded bg-surface-sunken px-1 py-0.5 text-[10px] font-medium text-text-muted ring-1 ring-inset ring-border-subtle"
        >
          P{item.phase}
        </span>
      )}
    </Link>
  );
}

/**
 * The navigation column.
 *
 * Renders the permanent desktop column and, below `lg`, an off-canvas drawer.
 * Must be a sibling of the topbar, never a child — see nav-context.tsx.
 */
export function Sidebar({
  permissions,
  role,
  organizationName,
  userName,
  isDemoEnvironment,
}: SidebarProps) {
  const pathname = usePathname();
  const { open, closeDrawer } = useAppNav();

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.permission === undefined || permissions.includes(item.permission),
    ),
  })).filter((section) => section.items.length > 0);

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border-subtle px-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
          <ShieldCheck className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold tracking-tight text-text-primary">
            SicherVergabe
          </span>
          <span className="block truncate text-[11px] text-text-muted">
            Vergabe-Intelligence
          </span>
        </span>
        <button
          type="button"
          onClick={closeDrawer}
          className="ml-auto rounded-md p-1 text-text-muted hover:bg-surface-sunken lg:hidden"
          aria-label="Navigation schließen"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <nav
        aria-label="Hauptnavigation"
        className="scrollbar-slim flex-1 space-y-5 overflow-y-auto px-4 py-4"
      >
        {sections.map((section) => (
          <div key={section.label}>
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-wider text-text-muted uppercase">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={closeDrawer}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border-subtle p-4">
        {isDemoEnvironment && (
          <div className="mb-3 rounded-lg border border-demo-border bg-demo-subtle px-2.5 py-2">
            <p className="text-[11px] leading-snug font-semibold text-demo uppercase">
              Demo-Umgebung
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-demo">
              Alle Ausschreibungen sind Beispieldaten. Keine Live-Quellen
              angebunden.
            </p>
          </div>
        )}

        <div className="mb-3 min-w-0">
          <p className="truncate text-xs font-medium text-text-primary">{userName}</p>
          <p className="truncate text-[11px] text-text-muted">
            {organizationName} · {ROLE_LABELS[role]}
          </p>
        </div>

        <ThemeToggle />
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: permanent column. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border-subtle bg-surface-raised lg:block">
        {content}
      </aside>

      {/* Below lg: off-canvas drawer. */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Navigation schließen"
            onClick={closeDrawer}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border-subtle bg-surface-raised shadow-overlay">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
