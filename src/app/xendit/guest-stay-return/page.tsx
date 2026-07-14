import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { verifyGuestStayXenditReturnState } from '@/lib/guest-stay-xendit-return';

export const dynamic = 'force-dynamic';

function isPrivateLanHostname(hostname: string) {
  const host = hostname.trim().toLowerCase();

  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function getDashboardBaseUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!value) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL is required to return to Guest Stays.'
    );
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL must be an absolute HTTP or HTTPS URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.');
  }

  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol !== 'https:' &&
    !isPrivateLanHostname(url.hostname)
  ) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL must use HTTPS outside a private LAN environment.'
    );
  }

  return url.origin;
}

function getGuestStaysFallbackUrl() {
  try {
    return new URL('/dashboard/guest-stays', `${getDashboardBaseUrl()}/`).toString();
  } catch {
    return '/dashboard/login';
  }
}

function ReturnError({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0b0905] px-5 text-white">
      <section className="w-full max-w-lg rounded-[2rem] border border-red-500/25 bg-[#151108] p-7 text-center shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-red-500/10 text-red-300">
          <AlertTriangle className="size-7" />
        </span>
        <h1 className="mt-5 font-serif text-3xl font-normal">
          Unable to restore this guest checkout
        </h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-white/55">
          {message}
        </p>
        <Link
          href={getGuestStaysFallbackUrl()}
          className="mt-7 inline-flex h-12 items-center justify-center rounded-2xl bg-[#c99c38] px-5 text-sm font-black text-black transition hover:bg-[#e0b64f]"
        >
          Open Guest Stays
        </Link>
      </section>
    </main>
  );
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export default async function GuestStayXenditReturnPage({
  searchParams,
}: {
  searchParams?: Promise<{
    state?: string;
  }>;
}) {
  const params = await searchParams;
  const returnState = verifyGuestStayXenditReturnState(params?.state);

  if (!returnState) {
    return (
      <ReturnError message="The payment return link is invalid or has expired. Open Guest Stays and review the latest Xendit transaction." />
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
      payload: true,
    },
  });

  if (!session || !isJsonRecord(session.payload)) {
    return (
      <ReturnError message="The matching guest-stay Xendit session was not found. Open Guest Stays and review the payment records before retrying." />
    );
  }

  if (
    session.payload.flow !== 'GUEST_STAY_CHECKOUT' ||
    session.payload.guestStayId !== returnState.guestStayId ||
    session.payload.hotelId !== returnState.hotelId
  ) {
    return (
      <ReturnError message="The payment return details do not match the original guest checkout." />
    );
  }

  let dashboardBaseUrl: string;

  try {
    dashboardBaseUrl = getDashboardBaseUrl();
  } catch (error) {
    return (
      <ReturnError
        message={
          error instanceof Error
            ? error.message
            : 'The local Guest Stays dashboard URL is not configured.'
        }
      />
    );
  }

  const destination = new URL('/dashboard/guest-stays', `${dashboardBaseUrl}/`);
  destination.searchParams.set('xendit', session.id);
  destination.searchParams.set('xenditResult', returnState.result);

  redirect(destination.toString());
}
