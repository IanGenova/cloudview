import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { MobileNav } from '@/components/dashboard/MobileNav';
import { RealtimeDashboardNotifications } from '@/components/dashboard/RealtimeDashboardNotifications';
import { getVisibleDashboardNavItems } from '@/lib/dashboard-permissions';
import { ThemeToggle } from '@/components/dashboard/ThemeToggle';

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
    <div className="cloudview-dashboard-shell flex min-h-screen bg-neutral-50 text-neutral-950 transition-colors duration-300 dark:bg-[#050505] dark:text-neutral-100">
      <Sidebar hotelName={hotel?.name ?? undefined} navItems={navItems} />

      <div className="min-w-0 flex-1">
        <MobileNav navItems={navItems} />

       <header className="sticky top-0 z-40 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-5 py-4 shadow-sm backdrop-blur-xl transition-colors duration-300 dark:border-neutral-800 dark:bg-[#111111]/90 lg:px-8">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
              Signed in as
            </p>

            <p className="truncate font-black text-neutral-950 dark:text-white">
              {user.name}{' '}
              <span className="rounded-full bg-gold/15 px-2 py-1 text-xs font-black text-gold">
                {user.role.replaceAll('_', ' ')}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
        

            <ThemeToggle compact />

            <a
              href="/dashboard/logout"
              className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-neutral-800 transition hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
            >
              Logout
            </a>
          </div>
        </header>

       <main className="min-h-[calc(100dvh-73px)] bg-neutral-50 p-5 transition-colors duration-300 dark:bg-neutral-950 lg:p-8">
          {children}
        </main>

        <RealtimeDashboardNotifications />
      </div>
    </div>
  );
}