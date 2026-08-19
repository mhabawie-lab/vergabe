import { AppNavProvider } from '@/components/layout/nav-context';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { isUsingDemoStore } from '@/lib/db';
import { requireSession } from '@/lib/auth/session';

/**
 * Every authenticated screen depends on the session and on live data, so
 * nothing below this segment may be prerendered at build time.
 */
export const dynamic = 'force-dynamic';

/**
 * Shell for every authenticated screen.
 *
 * The sidebar and the topbar are siblings — the topbar's backdrop filter
 * would otherwise become the containing block for the sidebar's fixed
 * positioning. They share the drawer state through AppNavProvider.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const demoEnvironment = isUsingDemoStore() || session.organization.isDemo;

  return (
    <AppNavProvider>
      <Sidebar
        permissions={session.permissions}
        role={session.role}
        organizationName={session.organization.name}
        userName={session.profile.fullName ?? session.profile.email}
        isDemoEnvironment={demoEnvironment}
      />

      <div className="min-h-screen lg:pl-64">
        <Topbar isDemoEnvironment={demoEnvironment} />

        <main className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </AppNavProvider>
  );
}
