import { getCurrentUser } from '@/lib/auth';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { MobileNav } from '@/components/dashboard/MobileNav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // When no user exists, render login/logout pages without dashboard shell.
  if (!user) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <Sidebar role={user.role} hotelName={user.hotel?.name} />

      <div className="min-w-0 flex-1">
        <MobileNav />

        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4 lg:px-8">
          <div>
            <p className="text-sm font-semibold text-neutral-500">Signed in as</p>
            <p className="font-black">
              {user.name}{' '}
              <span className="text-xs font-bold text-gold">
                {user.role.replaceAll('_', ' ')}
              </span>
            </p>
          </div>

          <a
            href="/dashboard/logout"
            className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-bold hover:bg-neutral-100"
          >
            Logout
          </a>
        </header>

        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}