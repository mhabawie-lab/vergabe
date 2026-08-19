'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Shared state for the mobile navigation drawer.
 *
 * The trigger lives in the topbar while the drawer and the desktop column
 * live outside it. They must not be nested: the topbar uses a backdrop
 * filter, which establishes a containing block and would make the sidebar's
 * `position: fixed` resolve against the header instead of the viewport.
 * Sharing state through context keeps them siblings in the DOM.
 */

interface AppNavState {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const AppNavContext = createContext<AppNavState | null>(null);

export function AppNavProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // The drawer remembers the route it was opened on, so navigating closes it
  // as derived state rather than through an effect.
  const [openedOnPath, setOpenedOnPath] = useState<string | null>(null);

  const value = useMemo<AppNavState>(
    () => ({
      open: openedOnPath === pathname,
      openDrawer: () => setOpenedOnPath(pathname),
      closeDrawer: () => setOpenedOnPath(null),
    }),
    [openedOnPath, pathname],
  );

  return <AppNavContext.Provider value={value}>{children}</AppNavContext.Provider>;
}

export function useAppNav(): AppNavState {
  const context = useContext(AppNavContext);
  if (context === null) {
    throw new Error('useAppNav muss innerhalb von AppNavProvider verwendet werden.');
  }
  return context;
}
