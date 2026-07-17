import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { MobileNav } from '@/components/dashboard/MobileNav';
import { RealtimeDashboardNotifications } from '@/components/dashboard/RealtimeDashboardNotifications';
import { getVisibleDashboardNavItems } from '@/lib/dashboard-permissions';
import { ThemeToggle } from '@/components/dashboard/ThemeToggle';
import { ThemePaletteProvider } from '@/components/dashboard/ThemePaletteProvider';
import { ThemePaletteSelector } from '@/components/dashboard/ThemePaletteSelector';
import { LogOut } from 'lucide-react';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // When no user exists, render login/logout pages without dashboard shell.
  if (!user) return <>{children}</>;

  const [navItems, hotel] = await Promise.all([
    getVisibleDashboardNavItems(user.id, user.role),

    user.hotelId
      ? db.hotel.findUnique({
          where: {
            id: user.hotelId,
          },
          select: {
            name: true,
          },
        })
      : Promise.resolve(null),
  ]);

  return (
    <ThemePaletteProvider>
      <div className="cloudview-dashboard-shell flex min-h-dvh overflow-x-clip bg-[var(--cv-bg)] text-[var(--cv-text)] transition-colors duration-300 dark:bg-[#050505] dark:text-neutral-100">
        <Sidebar hotelName={hotel?.name ?? undefined} navItems={navItems} />

        <div className="min-w-0 flex-1 overflow-x-clip">
          <div className="sticky top-0 z-40 lg:contents">
            <MobileNav navItems={navItems} />

            <header className="relative z-40 flex min-h-[68px] items-center justify-between gap-2 border-b border-[var(--cv-border)] bg-[var(--cv-card)]/90 px-3 py-3 shadow-sm backdrop-blur-xl transition-colors duration-300 dark:border-neutral-800 dark:bg-[#111111]/90 sm:gap-4 sm:px-5 sm:py-4 lg:sticky lg:top-0 lg:px-8">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[var(--cv-muted)] dark:text-neutral-400 sm:text-sm">
                  Signed in as
                </p>

                <p className="flex min-w-0 items-center gap-2 truncate text-sm font-black text-[var(--cv-text)] dark:text-white sm:text-base">
                  {user.name}{' '}
                  <span className="hidden shrink-0 rounded-full bg-[var(--cv-accent-soft)] px-2 py-1 text-xs font-black text-[var(--cv-accent-strong)] sm:inline-flex">
                    {user.role.replaceAll('_', ' ')}
                  </span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                <RealtimeDashboardNotifications />
                <ThemeToggle compact />

                <a
                  href="/dashboard/logout"
                  aria-label="Logout"
                  title="Logout"
                  className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card)] text-[var(--cv-text)] transition hover:bg-[var(--cv-card-muted)] dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800 sm:flex sm:w-auto sm:gap-2 sm:rounded-2xl sm:px-4 sm:text-sm sm:font-black"
                >
                  <LogOut className="size-4" />
                  <span className="hidden sm:inline">Logout</span>
                </a>
              </div>
            </header>
          </div>

          <main className="min-h-[calc(100dvh-132px)] min-w-0 overflow-x-clip bg-[var(--cv-bg)] p-3 transition-colors duration-300 dark:bg-neutral-950 sm:p-5 lg:min-h-[calc(100dvh-73px)] lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </ThemePaletteProvider>
  );
}
