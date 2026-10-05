'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/*
 * ST-2's other half. With no error boundary under /t, a thrown render in any
 * guest route fell through to Next's own error page — a white screen outside
 * the hotel's portal, and in production without even a reason. This keeps the
 * guest inside, says the one true thing (the hotel does not know yet), and
 * offers retry plus a human.
 */
export default function GuestError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname() || '';
  const match = /^\/t\/([^/]+)/.exec(pathname);
  const tagCode = match ? match[1] : null;

  useEffect(() => {
    /* The digest is the only handle support has on a production failure. */
    console.error('Guest portal error', error.digest ?? '', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">
          Something broke
        </p>

        <h1 className="mt-3 font-serif text-4xl font-normal leading-tight tracking-wide">
          This screen did not load
        </h1>

        <p className="mt-4 text-sm font-medium leading-6 text-white/60">
          The hotel has not been told. Try once more, and if it happens again
          the front desk can take your request directly.
        </p>

        <div className="mt-8 grid gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center bg-gold px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Try again
          </button>

          {tagCode ? (
            <Link
              href={`/t/${tagCode}/contact`}
              className="inline-flex min-h-11 items-center justify-center border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Contact the front desk
            </Link>
          ) : null}
        </div>

        {error.digest ? (
          <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.18em] text-white/30">
            Reference {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
