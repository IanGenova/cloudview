'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/*
 * A thrown render anywhere in the console used to fall through to Next's own
 * error page: the sidebar gone, no reference to quote, and in production no
 * reason either. Staff are mid-shift when this happens — the one thing that
 * matters is getting back to the board.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error', error.digest ?? '', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-700">
        Error
      </p>

      <h1 className="mt-3 font-serif text-3xl font-normal tracking-tight text-neutral-950 dark:text-white">
        This screen did not load
      </h1>

      <p className="mt-4 max-w-md text-sm leading-6 text-neutral-600 dark:text-neutral-400">
        Nothing was changed by the failure. Try again, and quote the reference
        below if it keeps happening.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-black"
        >
          Try again
        </button>

        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center border border-cv-hairline px-5 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50 dark:text-white dark:hover:bg-neutral-900"
        >
          Back to the dashboard
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  );
}
