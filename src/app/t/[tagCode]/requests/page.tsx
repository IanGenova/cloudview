import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft,
  Clock,
  ConciergeBell,
  CreditCard,
  MessageCircle,
  PackageCheck,
  ReceiptText,
} from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

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

  if (!tag || tag.status !== 'ACTIVE') {
    notFound();
  }

  const location = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  const requests = await db.serviceRequest.findMany({
    where: {
      tagId: tag.id,
      hotelId: tag.hotelId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  });

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
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto min-h-screen max-w-md bg-black px-5 pb-32 pt-5">
        <div className="mb-7 grid grid-cols-[44px_1fr_44px] items-center">
          <Link
            href={`/t/${tagCode}/contact`}
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeft className="size-6" />
          </Link>

          <div className="text-center">
            <h1 className="text-xl font-black">My Requests</h1>
            <p className="text-sm text-white/45">{location}</p>
          </div>

          <div />
        </div>

        <section className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-[2rem] border border-gold/20 bg-gold/10 p-5">
            <div className="grid size-11 place-items-center rounded-2xl bg-gold/15 text-gold">
              <MessageCircle className="size-5" />
            </div>

            <p className="mt-4 text-sm font-bold text-white/50">
              Total Requests
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">
              {requests.length}
            </h2>
          </div>

          <div className="rounded-[2rem] border border-emerald-500/20 bg-emerald-500/10 p-5">
            <div className="grid size-11 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300">
              <CreditCard className="size-5" />
            </div>

            <p className="mt-4 text-sm font-bold text-white/50">Billed</p>
            <h2 className="mt-1 text-2xl font-black text-white">
              {billedCount}
            </h2>
          </div>
        </section>

        <div className="space-y-3">
          {requests.map((request) => {
            const charge = chargesByRequestId.get(request.id);
            const isBilled = Boolean(charge);

            return (
              <div
                key={request.id}
                className="rounded-[2rem] border border-white/10 bg-white/5 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-white">
                        {request.requestCode}
                      </h3>

                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-black ${statusBadgeClass(
                          request.status
                        )}`}
                      >
                        {statusLabel(request.status)}
                      </span>

                      {isBilled ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700">
                          BILLED
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-700">
                          NOT BILLED
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-white/40">
                      {formatDateTime(request.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-white/5 p-3">
                  <p className="flex items-center gap-2 text-sm font-black">
                    <ConciergeBell className="size-4 text-gold" />
                    {request.type}
                  </p>

                  {request.notes ? (
                    <p className="mt-2 whitespace-pre-line text-xs leading-5 text-white/45">
                      {request.notes}
                    </p>
                  ) : null}
                </div>

                {charge ? (
                  <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                    <p className="flex items-center gap-2 text-sm font-black text-emerald-200">
                      <ReceiptText className="size-4" />
                      Room Add-on Charge
                    </p>

                    <div className="mt-2 space-y-1 text-xs text-emerald-100/80">
                      <p>Item: {charge.itemName}</p>
                      <p>
                        Qty {charge.quantity} ×{' '}
                        {money(Number(charge.unitPrice))}
                      </p>
                      <p className="font-black">
                        Total: {money(Number(charge.totalAmount))}
                      </p>
                      <p>Payment: {charge.paymentStatus}</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs font-bold text-white/45">
                      This request has no room add-on charge.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {!requests.length ? (
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/5 text-gold">
                <Clock className="size-7" />
              </div>

              <h2 className="mt-4 font-black">No requests yet</h2>
              <p className="mt-2 text-sm leading-6 text-white/45">
                Your service requests and room add-ons will appear here after
                submission.
              </p>

              <Link
                href={`/t/${tagCode}/service`}
                className="mt-5 inline-block rounded-2xl bg-gold px-5 py-3 text-sm font-black text-ink"
              >
                Request Service
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      <GuestBottomNav tagCode={tagCode} active="profile" dark />
    </main>
  );
}