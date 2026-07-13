import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db';
import { verifyPOSXenditReturnState } from '@/lib/pos-xendit-return';
import { POSXenditReturnClient } from './POSXenditReturnClient';

export const dynamic = 'force-dynamic';

function ReturnError({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0b0905] px-5 text-white">
      <section className="w-full max-w-lg rounded-[2rem] border border-red-500/25 bg-[#151108] p-7 text-center shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-red-500/10 text-red-300">
          <AlertTriangle className="size-7" />
        </span>
        <h1 className="mt-5 font-serif text-3xl font-normal">
          Unable to restore this POS payment
        </h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-white/55">
          {message}
        </p>
        <Link
          href="/dashboard/login"
          className="mt-7 inline-flex h-12 items-center justify-center rounded-2xl bg-[#c99c38] px-5 text-sm font-black text-black transition hover:bg-[#e0b64f]"
        >
          Open dashboard login
        </Link>
      </section>
    </main>
  );
}

export default async function POSXenditReturnPage({
  searchParams,
}: {
  searchParams?: Promise<{
    state?: string;
  }>;
}) {
  const params = await searchParams;
  const returnState = verifyPOSXenditReturnState(params?.state);

  if (!returnState) {
    return (
      <ReturnError message="The payment return link is invalid or has expired. Open the dashboard and review the latest POS Xendit transaction." />
    );
  }

  const session = await db.posXenditSession.findFirst({
    where: {
      id: returnState.sessionId,
      hotelId: returnState.hotelId,
      paymentProvider: 'XENDIT',
    },
    select: {
      id: true,
      hotelId: true,
    },
  });

  if (!session) {
    return (
      <ReturnError message="The matching POS Xendit session was not found. Open the dashboard and review the payment records before retrying." />
    );
  }

  const query = new URLSearchParams({
    hotelId: session.hotelId,
    xendit: session.id,
    xenditResult: returnState.result,
  });
  const dashboardTarget = `/dashboard/pos?${query.toString()}`;

  return (
    <POSXenditReturnClient
      sessionId={session.id}
      hotelId={session.hotelId}
      result={returnState.result}
      dashboardTarget={dashboardTarget}
    />
  );
}
