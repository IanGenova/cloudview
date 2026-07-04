import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft,
  Clock,
  ConciergeBell,
  CreditCard,
  MessageCircle,
  ReceiptText,
} from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { getCurrentNfcGuestSession } from '@/lib/nfc-guest-session';

export const dynamic = 'force-dynamic';

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

function money(value: number) {
  return pesoFormatter.format(value);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-700';
    case 'CANCELLED':
      return 'bg-red-100 text-red-700';
    case 'IN_PROGRESS':
      return 'bg-gold/20 text-gold';
    case 'ACKNOWLEDGED':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-white/10 text-white/70';
  }
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

export default async function MyRequestsPage({
  params,
}: {
  params: Promise<{
    tagCode: string;
  }>;
}) {
  const { tagCode } = await params;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag) {
    notFound();
  }

  const guestSession = await getCurrentNfcGuestSession(tagCode);

  const location = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  const requests = guestSession
    ? await db.serviceRequest.findMany({
        where: {
          tagId: tag.id,
          hotelId: tag.hotelId,
          guestSessionId: guestSession.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50,
      })
    : [];

  const requestIds = requests.map((request) => request.id);

  const charges = requestIds.length
    ? await db.roomAddOnCharge.findMany({
        where: {
          serviceRequestId: {
            in: requestIds,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
    : [];

  const chargesByRequestId = new Map(
    charges.map((charge) => [charge.serviceRequestId, charge])
  );

  const billedCount = requests.filter((request) =>
    chargesByRequestId.has(request.id)
  ).length;

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto min-h-screen max-w-md px-5 pb-32 pt-5">
        <div className="mb-7 grid grid-cols-[44px_1fr_44px] items-center">
          <Link
            href={`/t/${tagCode}/contact`}
            className="grid size-11 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Back"
          >
            <ChevronLeft className="size-6" />
          </Link>

          <div className="text-center">
            <h1 className="font-serif text-xl font-normal tracking-wide">My Requests</h1>
            <p className="mt-0.5 text-xs font-medium text-white/50">{location}</p>
          </div>

          <div />
        </div>

        <section className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-[2rem] border border-gold/20 bg-gold/10 p-5 backdrop-blur-md">
            <div className="grid size-11 place-items-center rounded-2xl bg-gold/15 text-gold">
              <MessageCircle className="size-5" />
            </div>

            <p className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-gold/80">
              Current Session
            </p>

            <h2 className="mt-1 font-serif text-3xl font-light text-white">
              {requests.length}
            </h2>

            <p className="mt-1 text-xs font-medium text-white/50">
              Request{requests.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="rounded-[2rem] border border-emerald-500/20 bg-emerald-500/10 p-5 backdrop-blur-md">
            <div className="grid size-11 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300">
              <CreditCard className="size-5" />
            </div>

            <p className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-emerald-300/80">
              Billed
            </p>

            <h2 className="mt-1 font-serif text-3xl font-light text-white">
              {billedCount}
            </h2>

            <p className="mt-1 text-xs font-medium text-white/50">
              Add-on charge{billedCount === 1 ? '' : 's'}
            </p>
          </div>
        </section>

        <div className="space-y-4">
          {requests.map((request) => {
            const charge = chargesByRequestId.get(request.id);
            const isBilled = Boolean(charge);

            return (
              <div
                key={request.id}
                className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-sm backdrop-blur-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-serif text-[17px] font-medium tracking-wide text-white">
                        {request.requestCode}
                      </h3>

                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${statusBadgeClass(
                          request.status
                        )}`}
                      >
                        {statusLabel(request.status)}
                      </span>

                      {isBilled ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
                          BILLED
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-700">
                          NOT BILLED
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs font-medium text-white/50">
                      {formatDateTime(request.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-[1.25rem] bg-white/5 p-4">
                  <p className="flex items-center gap-2 font-serif text-[15px] font-medium tracking-wide">
                    <ConciergeBell className="size-4 text-gold" />
                    {request.type}
                  </p>

                  {request.notes ? (
                    <p className="mt-2 whitespace-pre-line text-[13px] font-medium leading-relaxed text-white/60">
                      {request.notes}
                    </p>
                  ) : null}
                </div>

                {charge ? (
                  <div className="mt-3 rounded-[1.25rem] border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <p className="flex items-center gap-2 font-serif text-[15px] font-medium tracking-wide text-emerald-200">
                      <ReceiptText className="size-4" />
                      Room Add-on Charge
                    </p>

                    <div className="mt-3 space-y-1.5 text-[13px] font-medium text-emerald-100/80">
                      <p>Item: {charge.itemName}</p>
                      <p>
                        Qty {charge.quantity} ×{' '}
                        {money(Number(charge.unitPrice))}
                      </p>
                      <p className="font-serif text-[15px] font-medium tracking-wide text-emerald-100">
                        Total: {money(Number(charge.totalAmount))}
                      </p>
                      <p className="pt-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-200/60">Payment: POSTED</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                    <p className="text-[13px] font-medium text-white/50">
                      This request has no room add-on charge.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {!requests.length ? (
            <div className="grid min-h-[50vh] place-items-center rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-md">
              <div>
                <div className="mx-auto grid size-20 place-items-center rounded-[1.5rem] bg-white/5 text-gold shadow-sm">
                  <Clock className="size-8" strokeWidth={1.5} />
                </div>

                <h2 className="mt-6 font-serif text-2xl font-normal tracking-wide text-white">No requests for this guest</h2>

                <p className="mt-3 text-[15px] font-medium leading-relaxed text-white/50">
                  Requests from previous guests are hidden. Tap the NFC card again
                  to start a new guest session.
                </p>

                <Link
                  href={`/t/${tagCode}/service`}
                  className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-[1.25rem] bg-gold px-6 py-3 text-[15px] font-semibold tracking-wide text-black transition hover:brightness-110 active:scale-[0.98]"
                >
                  Request Service
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <GuestBottomNav tagCode={tagCode} active="profile" dark />
    </main>
  );
}