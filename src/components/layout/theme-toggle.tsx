'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Theme switch: light, dark or follow the operating system.
 *
 * localStorage is an external store, so it is read through
 * `useSyncExternalStore` rather than mirrored into component state. That
 * keeps the server render ("system") and the client's real preference in
 * step without an effect, and lets several toggles stay in sync.
 *
 * The stored value is applied before first paint by THEME_INIT_SCRIPT, so
 * there is no flash of the wrong theme.
 */

export const THEME_STORAGE_KEY = 'sichervergabe-theme';

type ThemeChoice = 'light' | 'dark' | 'system';

const OPTIONS: ReadonlyArray<{
  value: ThemeChoice;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: 'light', label: 'Hell', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dunkel', Icon: Moon },
];

function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

function applyTheme(choice: ThemeChoice): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = choice === 'dark' || (choice === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', isDark);
}

const listeners = new Set<() => void>();

/**
 * Cached snapshot. `useSyncExternalStore` requires getSnapshot to return a
 * referentially stable value between notifications, so the read is memoised
 * and invalidated only when the store actually changes.
 */
let snapshot: ThemeChoice | null = null;

function getSnapshot(): ThemeChoice {
  if (snapshot === null) {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      snapshot = isThemeChoice(stored) ? stored : 'system';
    } catch {
      // Storage can be blocked; following the OS is the safe default.
      snapshot = 'system';
    }
  }
  return snapshot;
}

/** The server cannot know the preference, so it renders the default. */
function getServerSnapshot(): ThemeChoice {
  return 'system';
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  // Keep following the OS while "system" is selected, and pick up changes
  // made in another tab.
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onMediaChange = () => {
    if (getSnapshot() === 'system') applyTheme('system');
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    snapshot = isThemeChoice(event.newValue) ? event.newValue : 'system';
    applyTheme(snapshot);
    for (const listener of listeners) listener();
  };

  media.addEventListener('change', onMediaChange);
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(onStoreChange);
    media.removeEventListener('change', onMediaChange);
    window.removeEventListener('storage', onStorage);
  };
}

function setThemeChoice(choice: ThemeChoice): void {
  snapshot = choice;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Persisting is best-effort; the theme still applies for this session.
  }
  applyTheme(choice);
  for (const listener of listeners) listener();
}

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label="Farbschema"
      className="inline-flex items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5 ring-1 ring-inset ring-border-subtle"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setThemeChoice(value)}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-md transition-colors',
              active
                ? 'bg-surface-raised text-text-primary shadow-card'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Inline script applying the stored theme before first paint.
 *
 * Must stay dependency-free and synchronous — it runs in <head>.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = stored === 'dark' || ((stored === null || stored === 'system') && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
  } catch (e) {
    /* Storage can be blocked; the light theme is a safe default. */
  }
})();
`;
