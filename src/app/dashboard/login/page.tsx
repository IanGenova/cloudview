import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import {
  Activity,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { dashboardHomeForRole, getCurrentUser } from '@/lib/auth';
import { getFirstVisibleDashboardHref } from '@/lib/dashboard-permissions';
import { LoginForm } from './LoginForm';

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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    error?: string;
  }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = sanitizeNext(next);
  const currentError = errorMessage(error);
  const user = await getCurrentUser();

  if (user) {
    /**
     * Preserve the exact protected route that initiated authentication.
     * This is required for Xendit returns because the POS session and result
     * are carried in the sanitized `next` query string.
     */
    if (safeNext) {
      redirect(safeNext);
    }

    const firstVisibleHref = await getFirstVisibleDashboardHref(
      user.id,
      user.role
    );

    redirect(firstVisibleHref ?? dashboardHomeForRole(user.role));
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f4ecde] px-4 py-6 text-[#11100b] sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#fffaf0_0%,#f5ead8_38%,#e4c98e_100%)]" />
        <div className="absolute left-1/2 top-[32%] size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/75 blur-3xl sm:size-[48rem]" />
        <div className="absolute -right-24 top-20 size-72 rounded-full bg-[#c99c38]/24 blur-3xl sm:size-[34rem]" />
        <div className="absolute -bottom-20 -left-24 size-72 rounded-full bg-white/45 blur-3xl sm:size-[30rem]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_48%,rgba(80,54,18,0.11)_100%)]" />
      </div>

      <section className="relative z-10 w-full max-w-5xl">
        <div className="grid overflow-hidden rounded-[2.25rem] border border-[#c99c38]/20 bg-white/90 shadow-[0_35px_110px_rgba(60,42,15,0.22)] backdrop-blur-2xl lg:grid-cols-[0.95fr_1.05fr]">
          <aside className="relative hidden min-h-[640px] overflow-hidden bg-[#11100b] p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[#c99c38]/28 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-20 size-72 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.07),transparent_38%)]" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#e0b64f]">
                <Sparkles className="size-4" />
                CloudView
              </div>

              <h1 className="mt-8 max-w-sm font-serif text-5xl font-normal leading-[1.05] tracking-tight">
                Your hotel operations, securely managed.
              </h1>

              <p className="mt-5 max-w-sm text-sm font-semibold leading-7 text-white/55">
                Access orders, services, inventory, guest stays, NFC operations,
                and business intelligence from one protected workspace.
              </p>
            </div>

            <div className="relative z-10 space-y-3">
              <SecurityFeature
                icon={<ShieldCheck className="size-5" />}
                title="Role-based access"
                description="Each account sees only the tools assigned to its role."
              />

              <SecurityFeature
                icon={<LockKeyhole className="size-5" />}
                title="Protected sessions"
                description="Authenticated access is required for dashboard modules."
              />

              <SecurityFeature
                icon={<Activity className="size-5" />}
                title="Operational visibility"
                description="Manage daily hotel activity from one controlled portal."
              />
            </div>
          </aside>

          <div className="relative flex min-h-[620px] items-center px-6 py-9 sm:px-10 lg:px-14">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8">
                <div className="flex items-center gap-3 lg:hidden">
                  <span className="grid size-12 place-items-center rounded-2xl bg-[#11100b] text-[#e0b64f] shadow-lg">
                    <LockKeyhole className="size-5" />
                  </span>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#b88938]">
                      CloudView
                    </p>
                    <p className="mt-1 text-sm font-black text-neutral-800">
                      Secure Admin Access
                    </p>
                  </div>
                </div>

                <p className="hidden text-[10px] font-black uppercase tracking-[0.24em] text-[#b88938] lg:block">
                  Secure Admin Access
                </p>

                <h2 className="mt-5 font-serif text-4xl font-normal tracking-tight text-[#11100b] sm:text-[2.75rem]">
                  Welcome back
                </h2>

                <p className="mt-3 max-w-sm text-sm font-semibold leading-6 text-neutral-500">
                  Sign in with your authorized CloudView account.
                </p>
              </div>

              <LoginForm next={safeNext} initialError={currentError} />

              <p className="mt-7 text-center text-[11px] font-semibold leading-5 text-neutral-400">
                CloudView Hotel Management System
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function SecurityFeature({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#c99c38]/15 text-[#e0b64f]">
        {icon}
      </span>

      <div>
        <p className="text-sm font-black text-white">{title}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-white/45">
          {description}
        </p>
      </div>
    </div>
  );
}
