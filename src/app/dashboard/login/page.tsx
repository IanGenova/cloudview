import { redirect } from 'next/navigation';
import {
  LockKeyhole,
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
        {/* One flat field behind the card; the three-stop gradient was the marketing page bleeding in. */}
        <div className="absolute inset-0 bg-[#f5ead8]" />
        <div className="absolute left-1/2 top-[32%] size-[34rem] -translate-x-1/2 -translate-y-1/2 bg-white/75 blur-3xl sm:size-[48rem]" />
        <div className="absolute -right-24 top-20 size-72 bg-[#c99c38]/24 blur-3xl sm:size-[34rem]" />
        <div className="absolute -bottom-20 -left-24 size-72 bg-white/45 blur-3xl sm:size-[30rem]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_48%,rgba(80,54,18,0.11)_100%)]" />
      </div>

      <section className="relative z-10 w-full max-w-5xl">
        <div className="grid overflow-hidden border border-[#c99c38]/20 bg-white/90 backdrop-blur-2xl lg:grid-cols-[0.95fr_1.05fr]">
          <aside className="relative hidden min-h-[640px] overflow-hidden bg-[#11100b] p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="pointer-events-none absolute -right-24 -top-24 size-72 bg-[#c99c38]/28 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-20 size-72 bg-emerald-500/10 blur-3xl" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.07),transparent_38%)]" />

            <div className="relative z-10">
              {/* The word CloudView, in a chip, with a sparkle on it, directly above the word CloudView. */}

              {/*
                CP-2. This half of the sign-in screen was marketing: a 48px
                slogan selling hotel operations software, a sentence listing
                the modules, and three tiles explaining role-based access and
                protected sessions — to someone who already works here and is
                holding their password. Nobody signing in needs to be sold the
                product. What is left is the mark and where you are.
              */}
              <h1 className="mt-8 max-w-sm font-serif text-5xl font-normal leading-[1.05] tracking-tight">
                CloudView
              </h1>

              <p className="mt-5 max-w-sm text-sm leading-7 text-white/55">
                Staff sign-in.
              </p>
            </div>
          </aside>

          <div className="relative flex min-h-[620px] items-center px-6 py-9 sm:px-10 lg:px-14">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8">
                <div className="flex items-center gap-3 lg:hidden">
                  <span className="grid size-12 place-items-center bg-[#11100b] text-[#e0b64f] shadow-lg">
                    <LockKeyhole className="size-5" />
                  </span>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#b88938]">
                      CloudView
                    </p>
                    <p className="mt-1 text-sm font-semibold text-neutral-800">
                      Secure Admin Access
                    </p>
                  </div>
                </div>

                {/*
                  "Welcome back" is the greeting the brief bans by name, and it
                  sat under an eyebrow that said the same thing a third way.
                  One heading, which is also the instruction.
                */}
                <h2 className="font-serif text-4xl font-normal tracking-tight text-[#11100b] sm:text-[2.75rem]">
                  Sign in
                </h2>

                <p className="mt-3 max-w-sm text-sm leading-6 text-neutral-500">
                  Use the account the hotel issued you.
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
