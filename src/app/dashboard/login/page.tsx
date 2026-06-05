import { redirect } from 'next/navigation';
import { LoginForm } from './LoginForm';
import { dashboardHomeForRole, getCurrentUser } from '@/lib/auth';

export default async function LoginPage() {
  const user = await getCurrentUser();

  // If already logged in and user presses browser Back to /dashboard/login,
  // redirect back to dashboard instead of showing login inside the dashboard shell.
  if (user) {
    redirect(dashboardHomeForRole(user.role));
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-cream px-5 py-10 text-ink">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-12rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-white/80 blur-3xl" />
        <div className="absolute right-[-10rem] top-[8rem] h-[34rem] w-[34rem] rounded-full bg-gold/10 blur-3xl" />
        <div className="absolute bottom-[-16rem] left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-white/70 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.88),transparent_34%),radial-gradient(circle_at_84%_72%,rgba(193,128,37,0.10),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.52),rgba(248,229,198,0.36))]" />
      </div>

      <section className="relative z-10 w-full max-w-4xl">
        <div className="overflow-hidden rounded-[2rem] border border-gold/20 bg-white/82 shadow-[0_28px_80px_rgba(18,18,18,0.12)] backdrop-blur-xl">
          <div className="h-1.5 bg-gradient-to-r from-transparent via-gold to-transparent" />

          <div className="px-6 py-8 sm:px-10 sm:py-10 lg:px-16 lg:py-12">
            <div className="mx-auto max-w-2xl">
              <div className="text-center">
                <p className="text-sm font-black uppercase tracking-[0.45em] text-gold">
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
                <LoginForm />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}