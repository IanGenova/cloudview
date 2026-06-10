import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { MobileNav } from '@/components/dashboard/MobileNav';
import { RealtimeDashboardNotifications } from '@/components/dashboard/RealtimeDashboardNotifications';
import { getVisibleDashboardNavItems } from '@/lib/dashboard-permissions';

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
    <div className="flex min-h-screen bg-neutral-50">
      <Sidebar
        hotelName={hotel?.name ?? undefined}
        navItems={navItems}
      />

      <div className="min-w-0 flex-1">
        <MobileNav navItems={navItems} />

        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4 lg:px-8">
          <div>
            <p className="text-sm font-semibold text-neutral-500">
              Signed in as
            </p>

            <p className="font-black">
              {user.name}{' '}
              <span className="text-xs font-bold text-gold">
                {user.role.replaceAll('_', ' ')}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <RealtimeDashboardNotifications />

            <a
              href="/dashboard/logout"
              className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-bold hover:bg-neutral-100"
            >
              Logout
            </a>
          </div>
        </header>

        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}