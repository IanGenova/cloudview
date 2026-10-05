'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/*
 * ST-2's last gap, and in practice its first: a URL that matches no route at
 * all never reaches the boundaries under /t and /dashboard, so every mistyped
 * path in the product — guest or staff — fell through to Next's own white
 * "404 This page could not be found." Measured on four URLs, this is the
 * boundary that serves them.
 *
 * It cannot be given route params, so it reads the path to decide which doors
 * to offer: a guest holding a phone in a hotel lobby should not be handed a
 * link to the staff dashboard, and a member of staff mid-shift should not be
 * sent to the marketing page.
 */
export default function RootNotFound() {
  const pathname = usePathname() || '';
  const guestTag = /^\/[tn]\/([^/]+)/.exec(pathname);
  const isStaff = pathname.startsWith('/dashboard');

  return (
    <main className="grid min-h-screen place-items-center bg-neutral-950 px-6 text-white">
      <div className="w-full max-w-md">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">
          Not found
        </p>

        <h1 className="mt-3 font-serif text-4xl font-normal leading-tight tracking-wide">
          {guestTag ? 'That page has moved on' : 'There is nothing at this address'}
        </h1>

        <p className="mt-4 text-sm leading-6 text-white/60">
          {guestTag
            ? 'The link you followed does not lead anywhere in this hotel’s portal. Nothing is wrong with your stay.'
            : 'The link may be mistyped, or it may point at something that has since been removed.'}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {guestTag ? (
            <>
              <Link
                href={`/t/${guestTag[1]}`}
                className="inline-flex min-h-11 items-center bg-gold px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
              >
                Back to the guest portal
              </Link>

              <Link
                href={`/t/${guestTag[1]}/contact`}
                className="inline-flex min-h-11 items-center border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Contact the front desk
              </Link>
            </>
          ) : (
            <>
              <Link
                href={isStaff ? '/dashboard' : '/'}
                className="inline-flex min-h-11 items-center bg-gold px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
              >
                {isStaff ? 'Back to the dashboard' : 'CloudView home'}
              </Link>

              {isStaff ? (
                <Link
                  href="/dashboard/orders"
                  className="inline-flex min-h-11 items-center border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Orders
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
