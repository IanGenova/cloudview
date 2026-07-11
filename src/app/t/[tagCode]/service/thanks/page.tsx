import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CheckCircle2,
  Clock3,
  CreditCard,
  ReceiptText,
} from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { requireCurrentNfcGuestSession } from '@/lib/nfc-guest-session';

function label(value: string) {
  return value.replaceAll('_', ' ');
}

function money(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100);
}

export default async function ServiceThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ tagCode: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { tagCode } = await params;
  const { code } = await searchParams;
  const requestCode = code?.trim();

  if (!requestCode) notFound();

  const tag = await requireNfcGuestAccess(tagCode);
  const guestSession = await requireCurrentNfcGuestSession(tagCode);

  const requests = await db.serviceRequest.findMany({
    where: {
      requestCode,
      hotelId: tag.hotelId,
      tagId: tag.id,
      guestSessionId: guestSession.id,
    },
    include: {
      guestPayMongoSession: {
        select: {
          status: true,
          refundStatus: true,
          refundedAmountCents: true,
          refundErrorMessage: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!requests.length) notFound();

  const paidItems = requests.filter(
    (request) => request.paymentMethod === 'PAYMONGO'
  );
  const totalPaidCents = paidItems.reduce(
    (sum, request) => sum + request.amountCents,
    0
  );
  const firstPayment = paidItems[0]?.guestPayMongoSession;

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title="Request Sent"
        subtitle={`Reference: ${requestCode}`}
        backHref={`/t/${tagCode}/service`}
        variant="dark"
      >
        <div className="grid min-h-[65vh] place-items-center bg-[#050505] py-10 text-center text-white">
          <div className="w-full max-w-sm">
            <div className="mx-auto grid size-24 place-items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 shadow-[0_0_40px_rgba(16,185,129,0.12)]">
              <CheckCircle2 className="size-11" />
            </div>

            <h2 className="mt-6 font-serif text-3xl font-normal tracking-wide">
              Staff has received your request.
            </h2>

            <p className="mt-3 text-sm font-medium leading-6 text-white/55">
              A hotel team member will review and handle it shortly. Keep this
              reference number for follow-up.
            </p>

            <section className="mt-7 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-left shadow-[0_24px_60px_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-gold/15 text-gold">
                  <ReceiptText className="size-5" />
                </span>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.17em] text-white/35">
                    Request Reference
                  </p>
                  <p className="mt-1 font-serif text-xl text-white">
                    {requestCode}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-black/25 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/35">
                    Items
                  </p>
                  <p className="mt-1 text-lg font-black">{requests.length}</p>
                </div>
                <div className="rounded-2xl bg-black/25 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/35">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-black">
                    {label(requests[0].status)}
                  </p>
                </div>
              </div>

              {paidItems.length ? (
                <div className="mt-3 rounded-2xl border border-gold/15 bg-gold/[0.07] p-4 text-sm">
                  <div className="flex items-center gap-2 text-gold">
                    <CreditCard className="size-4" />
                    <b>PayMongo payment</b>
                  </div>
                  <div className="mt-3 space-y-2 text-white/60">
                    <p className="flex justify-between gap-3">
                      <span>Paid services</span>
                      <b className="text-white">{paidItems.length}</b>
                    </p>
                    <p className="flex justify-between gap-3">
                      <span>Amount</span>
                      <b className="text-gold">{money(totalPaidCents)}</b>
                    </p>
                    {firstPayment?.status ? (
                      <p className="flex justify-between gap-3">
                        <span>Payment status</span>
                        <b className="text-white">{label(firstPayment.status)}</b>
                      </p>
                    ) : null}
                    {firstPayment?.refundedAmountCents ? (
                      <p className="flex justify-between gap-3">
                        <span>Refunded</span>
                        <b className="text-blue-300">
                          {money(firstPayment.refundedAmountCents)}
                        </b>
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-start gap-3 rounded-2xl bg-white/[0.04] p-4 text-left text-xs font-medium leading-5 text-white/45">
                  <Clock3 className="mt-0.5 size-4 shrink-0 text-gold" />
                  Complimentary and price-on-confirmation requests may not show a
                  PayMongo payment amount.
                </div>
              )}

              <div className="mt-5 grid gap-3">
                <Link
                  href={`/t/${tagCode}/requests`}
                  className="block rounded-2xl bg-gold p-4 text-center text-sm font-black text-black"
                >
                  View My Requests
                </Link>
                <Link
                  href={`/t/${tagCode}`}
                  className="block rounded-2xl border border-white/12 bg-white/[0.04] p-4 text-center text-sm font-black text-white"
                >
                  Back to Home
                </Link>
              </div>

              {firstPayment?.refundErrorMessage ? (
                <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-xs font-semibold leading-5 text-red-200">
                  Refund review: {firstPayment.refundErrorMessage}
                </p>
              ) : null}
            </section>
          </div>
        </div>
      </GuestShell>

      <GuestBottomNav tagCode={tagCode} active="services" dark />
    </>
  );
}
