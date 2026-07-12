import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import {
  Activity,
  ChevronRight,
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
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#d9c097] px-4 py-6 text-[#17140f] sm:px-6 sm:py-10 lg:px-10">
      {/* Luxury ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,#d8c29e_0%,#f1e5d2_34%,#e5ca9a_67%,#c4a06d_100%)]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.88)_0%,rgba(255,255,255,0.48)_26%,rgba(255,255,255,0)_62%)]" />

        <div className="absolute -left-20 top-[-8rem] h-[38rem] w-[24rem] rotate-[8deg] rounded-[50%] bg-[#6d3f19]/15 blur-[90px]" />

        <div className="absolute left-[3%] top-[8%] hidden h-72 w-24 rounded-full bg-[#ffd68a]/35 blur-3xl lg:block" />

        <div className="absolute left-[8%] top-[22%] hidden size-20 rounded-full bg-[#fff3ce]/80 blur-2xl lg:block" />

        <div className="absolute right-[-5rem] top-[-3rem] hidden h-[115%] w-[34rem] bg-[repeating-linear-gradient(90deg,rgba(82,52,28,0.08)_0px,rgba(82,52,28,0.08)_12px,transparent_12px,transparent_30px)] opacity-70 blur-[1px] lg:block" />

        <div className="absolute -bottom-44 left-1/2 h-80 w-[90%] -translate-x-1/2 rounded-[50%] bg-[#4c2d15]/20 blur-[90px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(57,35,14,0.18)_100%)]" />

        <div className="absolute inset-0 opacity-[0.035] [background-image:url('data:image/svg+xml,%3Csvg_viewBox=%220_0_180_180%22_xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter_id=%22n%22%3E%3CfeTurbulence_type=%22fractalNoise%22_baseFrequency=%220.9%22_numOctaves=%224%22_stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect_width=%22100%25%22_height=%22100%25%22_filter=%22url(%23n)%22_opacity=%220.8%22/%3E%3C/svg%3E')]" />
      </div>

      <section className="relative z-10 w-full max-w-[1180px]">
        <div className="pointer-events-none absolute inset-x-12 -bottom-7 h-24 rounded-[50%] bg-[#4a2b13]/25 blur-3xl" />

        <div className="relative grid overflow-hidden rounded-[2.7rem] border border-[#e3c882]/70 bg-[#fcfaf6] shadow-[0_45px_130px_rgba(58,36,13,0.34),0_12px_35px_rgba(71,43,16,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] lg:grid-cols-[0.98fr_1.02fr]">
          {/* Left brand panel */}
          <aside className="relative hidden min-h-[720px] overflow-hidden bg-[#0e0f0c] px-12 py-11 text-white lg:flex lg:flex-col">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,#080906_0%,#13130f_48%,#071a14_100%)]" />

            <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-[#c99c38]/16 blur-3xl" />

            <div className="pointer-events-none absolute -bottom-36 -left-28 size-[30rem] rounded-full bg-emerald-700/20 blur-[100px]" />

            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,231,174,0.08),transparent_42%)]" />

            <TopographicPattern />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl border border-[#e6be62]/30 bg-[#d5a742]/10 text-[#e6bd5c] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <Sparkles className="size-5" />
                </span>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e1b756]">
                    CloudView
                  </p>

                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
                    Hotel Operations
                  </p>
                </div>
              </div>

              <h1 className="mt-10 max-w-md font-serif text-[3.55rem] font-normal leading-[0.99] tracking-[-0.045em]">
                Your hotel
                <br />
                operations,
                <br />
                <span className="bg-gradient-to-r from-[#f0cf83] via-[#d8ad58] to-[#ad7929] bg-clip-text text-transparent">
                  securely managed.
                </span>
              </h1>

              <p className="mt-7 max-w-[27rem] text-sm font-medium leading-7 text-white/52">
                Access orders, services, inventory, guest stays, NFC
                operations, and business intelligence from one protected
                workspace.
              </p>
            </div>

            <div className="relative z-10 mt-auto space-y-3">
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

          {/* Right login panel */}
          <div className="relative flex min-h-[660px] items-center overflow-hidden bg-[linear-gradient(145deg,#fffefa_0%,#fcfaf6_55%,#f8f3ea_100%)] px-6 py-10 sm:px-10 lg:min-h-[720px] lg:px-16 lg:py-14">
            <div className="pointer-events-none absolute right-[-10rem] top-[-10rem] size-[28rem] rounded-full bg-[#e8c477]/10 blur-3xl" />

            <div className="pointer-events-none absolute bottom-[-13rem] left-[15%] size-[26rem] rounded-full bg-white blur-3xl" />

            <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-px bg-gradient-to-b from-transparent via-[#d8b764]/55 to-transparent lg:block" />

            <div className="relative z-10 mx-auto w-full max-w-[460px]">
              <div className="mb-9">
                {/* Mobile branding */}
                <div className="mb-9 flex items-center gap-3 lg:hidden">
                  <span className="grid size-12 place-items-center rounded-2xl bg-[#12130f] text-[#e2b755] shadow-[0_12px_30px_rgba(17,16,11,0.24)]">
                    <Sparkles className="size-5" />
                  </span>

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#a87424]">
                      CloudView
                    </p>

                    <p className="mt-1 text-sm font-black text-[#2d2923]">
                      Hotel Operations
                    </p>
                  </div>
                </div>

                <div className="hidden items-center gap-4 lg:flex">
                  <p className="shrink-0 text-[10px] font-black uppercase tracking-[0.29em] text-[#b27b27]">
                    Secure Admin Access
                  </p>

                  <span className="h-px flex-1 bg-gradient-to-r from-[#c99c38]/55 to-transparent" />

                  <ShieldCheck className="size-4 text-[#b27b27]" />
                </div>

                <h2 className="mt-6 font-serif text-[2.9rem] font-normal leading-none tracking-[-0.035em] text-[#15130f] sm:text-[3.3rem]">
                  Welcome back
                </h2>

                <p className="mt-4 max-w-sm text-sm font-medium leading-6 text-[#70695f]">
                  Sign in with your authorized CloudView account to continue.
                </p>
              </div>

              <LoginForm next={safeNext} initialError={currentError} />

              <div className="mt-7 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-400">
                <span className="size-1 rounded-full bg-[#c99c38]" />
                Protected CloudView environment
                <span className="size-1 rounded-full bg-[#c99c38]" />
              </div>
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
    <div className="group flex items-center gap-4 rounded-[1.2rem] border border-white/[0.09] bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#d4a94d]/25 hover:bg-white/[0.055]">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[#d6aa4d]/15 bg-[#c99c38]/10 text-[#e2b654] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition group-hover:bg-[#c99c38]/15">
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-white">{title}</p>

        <p className="mt-1 text-xs font-medium leading-5 text-white/42">
          {description}
        </p>
      </div>

      <ChevronRight className="size-4 shrink-0 text-white/20 transition group-hover:translate-x-0.5 group-hover:text-[#dcb458]" />
    </div>
  );
}

function TopographicPattern() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 left-0 h-[260px] w-full opacity-45"
      viewBox="0 0 600 300"
      fill="none"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="topographicGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DDB456" stopOpacity="0" />
          <stop offset="45%" stopColor="#DDB456" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#DDB456" stopOpacity="0.06" />
        </linearGradient>
      </defs>

      {[
        'M-40 270C60 180 120 315 230 225C335 140 385 260 660 130',
        'M-35 285C70 195 145 325 245 242C350 155 410 280 660 155',
        'M-30 300C75 215 155 338 265 255C370 175 425 295 660 180',
        'M-25 318C85 225 175 350 285 270C395 192 450 310 660 205',
        'M-20 335C100 245 195 365 305 288C420 210 475 325 660 230',
        'M20 350C125 275 220 375 330 305C445 230 500 340 660 255',
      ].map((path, index) => (
        <path
          key={path}
          d={path}
          stroke="url(#topographicGold)"
          strokeWidth={index === 0 ? 1.4 : 1}
        />
      ))}

      <circle cx="85" cy="240" r="2.2" fill="#E2B654" opacity="0.7" />
      <circle cx="178" cy="264" r="1.5" fill="#E2B654" opacity="0.55" />
      <circle cx="322" cy="231" r="1.8" fill="#E2B654" opacity="0.65" />
      <circle cx="445" cy="254" r="1.4" fill="#E2B654" opacity="0.45" />
    </svg>
  );
}