import Link from 'next/link';

/*
 * ST-2 on the staff side. The console had no not-found boundary either, so a
 * stale bookmark or a deleted record dropped a member of staff onto Next's
 * white "404" with the sidebar gone and no way back into the console.
 */
export default function DashboardNotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
        Not found
      </p>

      <h1 className="mt-3 font-serif text-3xl font-normal tracking-tight text-neutral-950 dark:text-white">
        That record is not here
      </h1>

      <p className="mt-4 max-w-md text-sm leading-6 text-neutral-600 dark:text-neutral-400">
        It may have been deleted, or the link may point at another hotel. The
        console is still running — nothing else has been affected.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-black"
        >
          Back to the dashboard
        </Link>

        <Link
          href="/dashboard/orders"
          className="inline-flex min-h-11 items-center border border-cv-hairline px-5 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50 dark:text-white dark:hover:bg-neutral-900"
        >
          Orders
        </Link>
      </div>
    </div>
  );
}
