import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';

function GridIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="currentColor"
    >
      <path d="M7.5 18.5a5.5 5.5 0 0 1-.48-10.98A7 7 0 0 1 20.4 10.4a4.25 4.25 0 0 1-.65 8.1H7.5Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 3 5 6v6c0 4.4 2.9 8.5 7 9.8 4.1-1.3 7-5.4 7-9.8V6l-7-3Z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m12 3 2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84L6.6 19.6l1.03-6-4.36-4.25 6.03-.88L12 3Z" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-cream text-ink">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-12rem] top-[9rem] h-[44rem] w-[44rem] rounded-full bg-gold/10 blur-3xl" />
        <div className="absolute bottom-[-18rem] right-[6rem] h-[38rem] w-[38rem] rounded-full bg-white/80 blur-3xl" />
        <div className="absolute left-[-16rem] top-[18rem] h-[36rem] w-[36rem] rounded-full bg-white/70 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_56%,rgba(193,128,37,0.13),transparent_28%),linear-gradient(115deg,rgba(255,255,255,0.74)_0%,rgba(255,248,235,0.92)_48%,rgba(248,229,198,0.56)_100%)]" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-7rem)] max-w-7xl items-center px-6 py-14 sm:px-8 lg:py-20">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-3 rounded-full border border-gold/15 bg-white/70 px-5 py-3 text-sm font-bold text-gold shadow-soft backdrop-blur">
            <CloudIcon />
            CloudView — Smart Hospitality, One Tap Away
          </p>

          <h1 className="mt-10 max-w-4xl font-serif text-6xl font-black leading-[0.96] tracking-tight text-ink sm:text-7xl lg:text-8xl">
            Tap NFC. Order.
            <br />
            Request. Relax.
          </h1>

          <div className="mt-9 h-1 w-24 rounded-full bg-gold" />

          <p className="mt-8 max-w-2xl text-xl leading-9 text-neutral-700">
            CloudView Hotels empowers guests to instantly access everything
            they need — from food ordering and service requests to hotel
            information — with a simple tap.
          </p>

          <div className="mt-10 flex flex-wrap gap-5">
            <Button
              asChild
              className="h-16 rounded-2xl bg-ink px-8 text-base font-black text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-black"
            >
              <Link href="/dashboard/login" className="inline-flex items-center gap-3">
                <GridIcon />
                Open Dashboard
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              className="h-16 rounded-2xl border-gold/25 bg-white/75 px-8 text-base font-black text-ink shadow-soft backdrop-blur transition hover:-translate-y-0.5 hover:bg-white"
            >
              <Link
                href="/t/room-305-main-panel"
                className="inline-flex items-center gap-3"
              >
                <span className="text-gold">
                  <UserIcon />
                </span>
                Demo Guest Portal
              </Link>
            </Button>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4 text-base font-bold text-ink">
            <div className="inline-flex items-center gap-3">
              <span className="text-gold">
                <ShieldIcon />
              </span>
              Contactless &amp; Secure
            </div>

            <span className="hidden h-8 w-px bg-gold/25 sm:block" />

            <div className="inline-flex items-center gap-3">
              <span className="text-gold">
                <BoltIcon />
              </span>
              Instant Access
            </div>

            <span className="hidden h-8 w-px bg-gold/25 sm:block" />

            <div className="inline-flex items-center gap-3">
              <span className="text-gold">
                <StarIcon />
              </span>
              Better Guest Experience
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}