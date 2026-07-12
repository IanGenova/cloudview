'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, LoaderCircle, ShieldCheck } from 'lucide-react';

const POS_PAYMONGO_PENDING_STORAGE_KEY = 'cloudview-pos-paymongo-pending';

type ReturnResult = 'success' | 'cancelled';

export function POSPayMongoReturnClient({
  sessionId,
  hotelId,
  result,
  dashboardTarget,
}: {
  sessionId: string;
  hotelId: string;
  result: ReturnResult;
  dashboardTarget: string;
}) {
  const [redirecting, setRedirecting] = useState(true);
  const loginTarget = `/dashboard/login?next=${encodeURIComponent(
    dashboardTarget
  )}`;

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        POS_PAYMONGO_PENDING_STORAGE_KEY,
        JSON.stringify({
          sessionId,
          hotelId,
          result,
          createdAt: Date.now(),
        })
      );
    } catch {
      // The signed dashboard target still contains the recovery identifiers.
    }

    const timeout = window.setTimeout(() => {
      window.location.replace(loginTarget);
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [hotelId, loginTarget, result, sessionId]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#0b0905] px-5 text-white">
      <section className="w-full max-w-lg rounded-[2rem] border border-[#c99c38]/25 bg-[#151108] p-7 text-center shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#c99c38]/15 text-[#e0b64f]">
          {redirecting ? (
            <LoaderCircle className="size-7 animate-spin" />
          ) : (
            <ShieldCheck className="size-7" />
          )}
        </span>

        <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-[#c99c38]">
          Secure payment return
        </p>
        <h1 className="mt-3 font-serif text-3xl font-normal">
          Returning to the POS terminal
        </h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-white/55">
          CloudView is restoring the cashier session and verifying the PayMongo
          payment status. Do not close this tab.
        </p>

        <button
          type="button"
          onClick={() => {
            setRedirecting(false);
            window.location.assign(loginTarget);
          }}
          className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#c99c38] px-5 text-sm font-black text-black transition hover:bg-[#e0b64f]"
        >
          Continue to POS
          <ArrowRight className="size-4" />
        </button>
      </section>
    </main>
  );
}
