'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/*
 * ST-2. Fifteen guest routes call notFound(), and the app had no not-found
 * boundary anywhere, so every one of them dropped the guest out of a dark
 * branded portal onto Next's white "404 — This page could not be found." with
 * no way back. The guest is standing in the hotel holding a phone; the least
 * this can do is stay inside the portal and offer the door.
 *
 * not-found.tsx is not given route params, so the tag code is recovered from
 * the path. If it cannot be (the path is malformed, which is the likeliest
 * reason to be here at all), the links are left out rather than guessed.
 */
export default function GuestNotFound() {
  const pathname = usePathname() || '';
  const match = /^\/t\/([^/]+)/.exec(pathname);
  const tagCode = match ? match[1] : null;

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">
          Not here
        </p>

        <h1 className="mt-3 font-serif text-4xl font-normal leading-tight tracking-wide">
          That page has moved on
        </h1>

        <p className="mt-4 text-sm font-medium leading-6 text-white/60">
          The link you followed does not lead anywhere in this hotel&rsquo;s
          portal. Nothing is wrong with your stay.
        </p>

        {tagCode ? (
          <div className="mt-8 grid gap-3">
            <Link
              href={`/t/${tagCode}`}
              className="inline-flex min-h-11 items-center justify-center bg-gold px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Back to the guest portal
            </Link>

            <Link
              href={`/t/${tagCode}/contact`}
              className="inline-flex min-h-11 items-center justify-center border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Contact the front desk
            </Link>
          </div>
        ) : (
          <p className="mt-8 border border-white/10 bg-white/[0.04] p-4 text-sm font-medium leading-6 text-white/55">
            Tap the hotel&rsquo;s NFC panel again to reopen the portal.
          </p>
        )}
      </div>
    </main>
  );
}
