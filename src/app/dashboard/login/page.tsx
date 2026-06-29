import { redirect } from 'next/navigation';
import { LoginForm } from './LoginForm';
import { dashboardHomeForRole, getCurrentUser } from '@/lib/auth';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
  }>;
}) {
  const { next } = await searchParams;
  const user = await getCurrentUser();

  if (user) {
    redirect(dashboardHomeForRole(user.role));
  }

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

      <section className="relative z-10 w-full max-w-4xl">
        <div className="relative overflow-hidden rounded-[2rem] border border-[#c99c38]/25 bg-white/78 shadow-[0_30px_90px_rgba(60,42,15,0.18)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.78),transparent_42%)]" />

          <div className="pointer-events-none absolute -left-32 top-0 h-full w-32 rotate-12 bg-gradient-to-r from-transparent via-white/45 to-transparent blur-xl" />

          <div className="relative h-1.5 overflow-hidden bg-[#f4e2bd]">
            <div className="absolute inset-y-0 left-1/2 w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#c99c38] to-transparent" />
          </div>

          <div className="relative px-6 py-8 sm:px-10 sm:py-10 lg:px-16 lg:py-12">
            <div className="mx-auto max-w-2xl">
              <div className="text-center">
                <p className="text-sm font-black uppercase tracking-[0.45em] text-[#b88938]">
                  Cloud View
                </p>

                <h1 className="mt-5 font-serif text-4xl font-black tracking-tight text-ink sm:text-5xl">
                  CloudView Admin Portal
                </h1>

                <p className="mt-4 text-base font-medium leading-7 text-neutral-500 sm:text-lg">
                  Manage orders, services, inventory, NFC tags, and POS sync.
                </p>
              </div>

              <div className="mt-9">
                <LoginForm next={next ?? ''} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}