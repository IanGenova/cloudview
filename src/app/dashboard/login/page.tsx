import { redirect } from 'next/navigation';
import { dashboardHomeForRole, getCurrentUser } from '@/lib/auth';
import { getFirstVisibleDashboardHref } from '@/lib/dashboard-permissions';
import { loginDirectAction } from './actions';

function sanitizeNext(value?: string) {
  const next = String(value ?? '').trim();

  if (!next || next === '/dashboard/login') {
    return '';
  }

  if (!next.startsWith('/dashboard')) {
    return '';
  }

  if (next.startsWith('//') || next.includes('://')) {
    return '';
  }

  return next;
}

function errorMessage(value?: string) {
  const message = String(value ?? '').trim();

  if (!message) {
    return '';
  }

  return message.slice(0, 240);
}

const inputClass =
  'h-11 w-full rounded-2xl border border-neutral-200 bg-white/95 px-4 text-sm font-bold text-neutral-950 shadow-sm outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/15';

const demoAccounts = [
  {
    label: 'Super Admin',
    email: 'admin@cloudview.test',
  },
  {
    label: 'Hotel Admin',
    email: 'hoteladmin@cloudview.test',
  },
  {
    label: 'Staff',
    email: 'staff@cloudview.test',
  },
  {
    label: 'Kitchen',
    email: 'kitchen@cloudview.test',
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    error?: string;
  }>;
}) {
  const { next, error } = await searchParams;
  const user = await getCurrentUser();

  if (user) {
    const firstVisibleHref = await getFirstVisibleDashboardHref(
      user.id,
      user.role
    );

    redirect(firstVisibleHref ?? dashboardHomeForRole(user.role));
  }

  const safeNext = sanitizeNext(next);
  const currentError = errorMessage(error);

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f7efe2] px-5 py-10 text-ink">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#fffaf0_0%,#f7ead6_34%,#e7c98f_100%)]" />
        <div className="absolute left-1/2 top-[38%] h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-white/75 blur-3xl" />
        <div className="absolute right-[-12rem] top-[8rem] h-[36rem] w-[36rem] animate-pulse rounded-full bg-[#c99c38]/25 blur-3xl" />
        <div className="absolute left-[-14rem] bottom-[-10rem] h-[34rem] w-[34rem] animate-pulse rounded-full bg-[#f5d996]/35 blur-3xl" />
        <div className="absolute bottom-[-18rem] left-[-8rem] h-[34rem] w-[120vw] rotate-[-8deg] rounded-[100%] bg-white/35 blur-2xl" />
        <div className="absolute bottom-[-20rem] right-[-10rem] h-[32rem] w-[90vw] rotate-[10deg] rounded-[100%] bg-[#fff6df]/45 blur-2xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_45%,rgba(80,54,18,0.10)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.28)_42%,transparent_50%,rgba(255,255,255,0.18)_62%,transparent_78%)]" />
        <div className="absolute left-[8%] top-[14%] size-2 rounded-full bg-[#c99c38]/50 shadow-[0_0_24px_rgba(201,156,56,0.8)]" />
        <div className="absolute right-[15%] top-[24%] size-1.5 rounded-full bg-white/80 shadow-[0_0_22px_rgba(255,255,255,0.9)]" />
        <div className="absolute bottom-[18%] left-[22%] size-1.5 rounded-full bg-[#c99c38]/60 shadow-[0_0_22px_rgba(201,156,56,0.9)]" />
      </div>

      <section className="relative z-10 w-full max-w-3xl">
        <div className="relative overflow-hidden rounded-[2rem] border border-[#c99c38]/25 bg-white/82 shadow-[0_30px_90px_rgba(60,42,15,0.18)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.78),transparent_42%)]" />
          <div className="relative h-1.5 overflow-hidden bg-[#f4e2bd]">
            <div className="absolute inset-y-0 left-1/2 w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#c99c38] to-transparent" />
          </div>

          <div className="relative px-6 py-8 sm:px-10">
            <div className="mx-auto max-w-xl">
              <div className="text-center">
                <p className="text-xs font-black uppercase tracking-[0.45em] text-[#b88938]">
                  Cloud View
                </p>

                <h1 className="mt-4 font-serif text-3xl font-black tracking-tight text-ink sm:text-4xl">
                  CloudView Admin Portal
                </h1>

                <p className="mt-3 text-sm font-medium leading-6 text-neutral-500">
                  Sign in to manage orders, services, inventory, NFC tags, and POS.
                </p>
              </div>

              {currentError ? (
                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  {currentError}
                </div>
              ) : null}

              <form action={loginDirectAction} className="mt-7 space-y-4">
                <input type="hidden" name="next" value={safeNext} />

                <label className="grid gap-2">
                  <span className="text-sm font-black text-ink">Email</span>
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="Enter user email"
                    className={inputClass}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-black text-ink">Password</span>
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="Example: 12345 or abcde"
                    className={inputClass}
                  />
                  <span className="text-xs font-semibold text-neutral-500">
                    Simple temporary passwords are allowed, such as{' '}
                    <b className="text-[#8a641d]">12345</b> or{' '}
                    <b className="text-[#8a641d]">abcde</b>.
                  </span>
                </label>

                <button
                  type="submit"
                  className="h-11 w-full rounded-2xl bg-ink text-sm font-black text-white shadow-[0_14px_30px_rgba(11,31,58,0.20)] transition hover:bg-black"
                >
                  Sign in
                </button>

                <div className="pt-2">
                  <div className="flex items-center gap-4">
                    <span className="h-px flex-1 bg-neutral-200" />
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold">
                      Demo Accounts
                    </p>
                    <span className="h-px flex-1 bg-neutral-200" />
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {demoAccounts.map((account) => (
                      <button
                        key={account.email}
                        type="submit"
                        name="demoAccount"
                        value={account.email}
                        className="rounded-2xl border border-white/70 bg-white/50 px-3 py-2.5 text-left text-xs font-black text-neutral-700 transition hover:border-[#c99c38]/40 hover:bg-white/85"
                      >
                        <span className="block truncate">{account.label}</span>
                        <span className="block truncate text-[11px] font-semibold text-neutral-500">
                          {account.email}
                        </span>
                      </button>
                    ))}
                  </div>

                  <p className="mt-3 text-center text-[11px] font-semibold leading-5 text-neutral-500">
                    Demo buttons submit password as <b>12345</b>. Reset the
                    account password first if that value does not match the saved
                    password.
                  </p>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
