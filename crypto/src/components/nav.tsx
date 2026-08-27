'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/', label: 'Radar', hint: 'Rangliste' },
  { href: '/social', label: 'Stimmung', hint: 'Beiträge' },
  { href: '/depot', label: 'Depot', hint: 'Papierhandel' },
  { href: '/quellen', label: 'Quellen', hint: 'Status' },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Hauptnavigation" className="flex gap-px lg:flex-col">
      {ITEMS.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex flex-1 flex-col border-l-2 px-3 py-2 transition-colors lg:flex-none',
              active
                ? 'border-accent bg-surface text-ink'
                : 'border-transparent text-ink-soft hover:border-rule-strong hover:text-ink',
            )}
          >
            <span className="font-display text-sm font-medium tracking-tight">{item.label}</span>
            <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
              {item.hint}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
