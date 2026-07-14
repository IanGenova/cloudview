import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CheckCircle2,
  ChevronLeft,
  Clock,
  ConciergeBell,
  CreditCard,
  MessageCircle,
  ReceiptText,
  RotateCcw,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  PaymentMethod,
  PaymentStatus,
  ServiceRequestStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { GuestBottomNav } from '@/components/guest/GuestShell';
import { RealtimeGuestServiceRequestsRefresh } from '@/components/guest/RealtimeGuestServiceRequestsRefresh';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { getCurrentNfcGuestSession } from '@/lib/nfc-guest-session';
import { cancelGuestServiceRequestItemAction } from '../service-xendit-actions';

export const dynamic = 'force-dynamic';

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

function money(value: number) {
  return pesoFormatter.format(value);
}

function moneyCents(value: number) {
  return pesoFormatter.format(value / 100);
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

function label(value: string) {
  return value.replaceAll('_', ' ');
}

function requestStatusLabel(
  status: ServiceRequestStatus,
  assignedToName?: string | null
) {
  if (status === ServiceRequestStatus.NEW && assignedToName) {
    return 'ACCEPTED';
  }

  if (status === ServiceRequestStatus.COMPLETED) {
    return 'FINISHED';
  }

  return label(status);
}

function ServiceRequestProgress({
  status,
  assignedToName,
  history,
  cancelReason,
}: {
  status: ServiceRequestStatus;
  assignedToName?: string | null;
  history: Array<{ status: ServiceRequestStatus }>;
  cancelReason?: string | null;
}) {
  const reachedInProgress =
    status === ServiceRequestStatus.IN_PROGRESS ||
    status === ServiceRequestStatus.COMPLETED ||
    history.some((entry) => entry.status === ServiceRequestStatus.IN_PROGRESS);
  const accepted = Boolean(assignedToName) || reachedInProgress;
  const finished = status === ServiceRequestStatus.COMPLETED;
  const cancelled = status === ServiceRequestStatus.CANCELLED;

  const steps = [
    { label: 'Submitted', complete: true },
    { label: 'Accepted', complete: accepted },
    { label: 'In progress', complete: reachedInProgress },
    { label: 'Finished', complete: finished },
  ];

  return (
    <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Live tracking
        </p>
        {assignedToName ? (
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-gold">
            <UserCheck className="size-3.5 shrink-0" />
            <span className="truncate">{assignedToName}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-1">
        {steps.map((step, index) => (
          <div key={step.label} className="relative text-center">
            {index < steps.length - 1 ? (
              <span
                className={
                  steps[index + 1].complete
                    ? 'absolute left-1/2 top-3 h-0.5 w-full bg-gold'
                    : 'absolute left-1/2 top-3 h-0.5 w-full bg-white/10'
                }
              />
            ) : null}

            <span
              className={
                step.complete
                  ? 'relative z-10 mx-auto grid size-6 place-items-center rounded-full bg-gold text-black'
                  : 'relative z-10 mx-auto grid size-6 place-items-center rounded-full border border-white/15 bg-[#111] text-white/35'
              }
            >
              {step.complete ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>

            <p
              className={
                step.complete
                  ? 'mt-2 text-[9px] font-bold text-white/80'
                  : 'mt-2 text-[9px] font-semibold text-white/35'
              }
            >
              {step.label}
            </p>
          </div>
        ))}
      </div>

      {cancelled ? (
        <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs font-semibold text-red-200">
          Request cancelled{cancelReason ? ` — ${cancelReason}` : '.'}
        </div>
      ) : status === ServiceRequestStatus.NEW && !assignedToName ? (
        <p className="mt-4 text-xs font-medium text-white/45">
          Waiting for the hotel team to accept this request.
        </p>
      ) : status === ServiceRequestStatus.NEW && assignedToName ? (
        <p className="mt-4 text-xs font-medium text-white/55">
          Accepted by {assignedToName}. Work will begin shortly.
        </p>
      ) : status === ServiceRequestStatus.IN_PROGRESS ? (
        <p className="mt-4 text-xs font-medium text-white/55">
          The hotel team is currently working on this request.
        </p>
      ) : finished ? (
        <p className="mt-4 text-xs font-medium text-emerald-200/80">
          This service request has been finished.
        </p>
      ) : null}
    </div>
  );
}

function statusBadgeClass(status: ServiceRequestStatus) {
  if (status === ServiceRequestStatus.COMPLETED) {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === ServiceRequestStatus.CANCELLED) {
    return 'bg-red-100 text-red-700';
  }

  if (status === ServiceRequestStatus.IN_PROGRESS) {
    return 'bg-gold/20 text-gold';
  }

  return 'bg-white/10 text-white/70';
}

function paymentBadgeClass(status: PaymentStatus) {
  if (status === PaymentStatus.PAID) {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === PaymentStatus.REFUNDED) {
    return 'bg-blue-100 text-blue-700';
  }

  if (
    status === PaymentStatus.REFUND_PENDING ||
    status === PaymentStatus.PARTIALLY_REFUNDED
  ) {
    return 'bg-amber-100 text-amber-800';
  }

  if (status === PaymentStatus.REFUND_FAILED) {
    return 'bg-red-100 text-red-700';
  }

  return 'bg-white/10 text-white/60';
}

export default async function MyRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tagCode: string }>;
  searchParams?: Promise<{ success?: string; error?: string }>;
}) {
  const { tagCode } = await params;
  const query = await searchParams;
  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag) notFound();

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
        include: {
          guestXenditSession: {
            select: {
              id: true,
              status: true,
              refundStatus: true,
              refundedAmountCents: true,
              refundErrorMessage: true,
            },
          },
          assignedTo: {
            select: {
              name: true,
            },
          },
          statusHistory: {
            select: {
              status: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 8,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    : [];

  const requestIds = requests.map((request) => request.id);
  const charges = requestIds.length
    ? await db.roomAddOnCharge.findMany({
        where: { serviceRequestId: { in: requestIds } },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const chargesByRequestId = new Map(
    charges.map((charge) => [charge.serviceRequestId, charge])
  );
  const xenditCount = requests.filter(
    (request) => request.paymentMethod === PaymentMethod.XENDIT
  ).length;

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      {guestSession ? (
        <RealtimeGuestServiceRequestsRefresh tagCode={tagCode} />
      ) : null}
      <div className="mx-auto min-h-screen max-w-md px-5 pb-32 pt-5">
        <div className="mb-7 grid grid-cols-[44px_1fr_44px] items-center">
          <Link
            href={`/t/${tagCode}`}
            className="grid size-11 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Back"
          >
            <ChevronLeft className="size-6" />
          </Link>
          <div className="text-center">
            <h1 className="font-serif text-xl font-normal tracking-wide">
              My Requests
            </h1>
            <p className="mt-0.5 text-xs font-medium text-white/50">
              {location}
            </p>
          </div>
          <div />
        </div>

        {query?.success === 'xendit-completed' ? (
          <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-semibold text-emerald-200">
            Xendit payment confirmed. Your service request is now available to
            the hotel team.
          </div>
        ) : null}

        {query?.success === 'request-cancelled' ? (
          <div className="mb-5 rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4 text-sm font-semibold text-blue-200">
            Service request cancelled. Inventory was restored and any eligible
            Xendit refund was submitted.
          </div>
        ) : null}


        {query?.success === 'request-already-cancelled' ? (
          <div className="mb-5 rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4 text-sm font-semibold text-blue-200">
            This service request is already cancelled. No duplicate inventory
            restoration or refund was created.
          </div>
        ) : null}

        {query?.error === 'request-not-cancellable' ? (
          <div className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm font-semibold text-amber-200">
            This request can no longer be cancelled because the hotel has
            already started or completed processing it.
          </div>
        ) : null}

        {query?.error === 'request-not-found' ? (
          <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
            The service request could not be found. Please refresh the page.
          </div>
        ) : null}

        <section className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-[1.5rem] border border-gold/20 bg-gold/10 p-4">
            <MessageCircle className="size-5 text-gold" />
            <p className="mt-3 text-[9px] font-semibold uppercase tracking-widest text-gold/80">
              Requests
            </p>
            <p className="mt-1 font-serif text-2xl">{requests.length}</p>
          </div>
          <div className="rounded-[1.5rem] border border-emerald-500/20 bg-emerald-500/10 p-4">
            <CreditCard className="size-5 text-emerald-300" />
            <p className="mt-3 text-[9px] font-semibold uppercase tracking-widest text-emerald-300/80">
              Xendit
            </p>
            <p className="mt-1 font-serif text-2xl">{xenditCount}</p>
          </div>
          <div className="rounded-[1.5rem] border border-blue-500/20 bg-blue-500/10 p-4">
            <ReceiptText className="size-5 text-blue-300" />
            <p className="mt-3 text-[9px] font-semibold uppercase tracking-widest text-blue-300/80">
              Room Bill
            </p>
            <p className="mt-1 font-serif text-2xl">{charges.length}</p>
          </div>
        </section>

        <div className="space-y-4">
          {requests.map((request) => {
            const charge = chargesByRequestId.get(request.id);
            const isXendit = request.paymentMethod === PaymentMethod.XENDIT;
            const canCancel = request.status === ServiceRequestStatus.NEW;

            return (
              <article
                key={request.id}
                className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-sm backdrop-blur-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-serif text-[17px] font-medium tracking-wide">
                        {request.requestCode}
                      </h2>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${statusBadgeClass(
                          request.status
                        )}`}
                      >
                        {requestStatusLabel(
                          request.status,
                          request.assignedTo?.name
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-white/50">
                      {formatDateTime(request.createdAt)}
                    </p>
                  </div>

                  {request.amountCents > 0 ? (
                    <p className="shrink-0 font-serif text-lg text-gold">
                      {moneyCents(request.amountCents)}
                    </p>
                  ) : null}
                </div>

                <ServiceRequestProgress
                  status={request.status}
                  assignedToName={request.assignedTo?.name}
                  history={request.statusHistory}
                  cancelReason={request.cancelReason}
                />

                <div className="mt-4 rounded-[1.25rem] bg-white/5 p-4">
                  <p className="flex items-center gap-2 font-serif text-[15px] font-medium tracking-wide">
                    <ConciergeBell className="size-4 text-gold" />
                    {request.quantity}× {request.type}
                  </p>
                  {request.notes ? (
                    <p className="mt-2 whitespace-pre-line text-[13px] font-medium leading-relaxed text-white/60">
                      {request.notes}
                    </p>
                  ) : null}
                </div>

                {isXendit ? (
                  <div className="mt-3 rounded-[1.25rem] border border-gold/20 bg-gold/10 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <QrPaymentIcon />
                      <p className="font-serif text-[15px] font-medium text-gold">
                        Xendit online payment
                      </p>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${paymentBadgeClass(
                          request.paymentStatus
                        )}`}
                      >
                        {label(request.paymentStatus)}
                      </span>
                    </div>

                    {request.paymentStatus === PaymentStatus.REFUNDED ? (
                      <p className="mt-2 text-xs font-semibold text-white/60">
                        Refunded: {moneyCents(request.amountCents)}
                      </p>
                    ) : request.paymentStatus ===
                      PaymentStatus.PARTIALLY_REFUNDED ? (
                      <p className="mt-2 text-xs font-semibold text-white/60">
                        A partial refund was completed for this service item.
                      </p>
                    ) : null}

                    {request.guestXenditSession?.refundErrorMessage ? (
                      <p className="mt-2 text-xs font-semibold text-red-200">
                        {request.guestXenditSession.refundErrorMessage}
                      </p>
                    ) : null}
                  </div>
                ) : charge ? (
                  <div className="mt-3 rounded-[1.25rem] border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <p className="font-serif text-[15px] font-medium text-emerald-200">
                      Room Add-on Charge
                    </p>
                    <p className="mt-2 text-[13px] text-emerald-100/80">
                      {charge.quantity} × {money(Number(charge.unitPrice))} ={' '}
                      {money(Number(charge.totalAmount))}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 rounded-[1.25rem] border border-white/10 bg-white/5 p-4 text-[13px] font-medium text-white/50">
                    {request.billingModeSnapshot === 'FREE'
                      ? 'Complimentary service — no payment required.'
                      : request.billingModeSnapshot === 'PRICE_ON_CONFIRMATION'
                        ? 'Staff will confirm the final price before billing.'
                        : 'No room charge was posted.'}
                  </div>
                )}

                {canCancel ? (
                  <form
                    action={cancelGuestServiceRequestItemAction}
                    className="mt-4"
                  >
                    <input type="hidden" name="tagCode" value={tagCode} />
                    <input type="hidden" name="requestId" value={request.id} />
                    <input
                      type="hidden"
                      name="reason"
                      value="Guest cancelled this service request"
                    />
                    <button
                      type="submit"
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 text-sm font-black text-red-200 transition hover:bg-red-500/20"
                    >
                      <XCircle className="size-4" />
                      Cancel Request
                    </button>
                  </form>
                ) : request.paymentStatus === PaymentStatus.REFUND_PENDING ? (
                  <div className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-500/10 p-3 text-xs font-semibold text-amber-200">
                    <RotateCcw className="size-4" />
                    Xendit refund is being processed.
                  </div>
                ) : null}
              </article>
            );
          })}

          {!requests.length ? (
            <div className="grid min-h-[50vh] place-items-center rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center">
              <div>
                <div className="mx-auto grid size-20 place-items-center rounded-[1.5rem] bg-white/5 text-gold">
                  <Clock className="size-8" strokeWidth={1.5} />
                </div>
                <h2 className="mt-6 font-serif text-2xl font-normal tracking-wide">
                  No requests for this guest
                </h2>
                <p className="mt-3 text-[15px] font-medium leading-relaxed text-white/50">
                  Your service requests will appear here after submission or
                  Xendit payment confirmation.
                </p>
                <Link
                  href={`/t/${tagCode}/service`}
                  className="mt-8 inline-flex min-h-12 items-center justify-center rounded-[1.25rem] bg-gold px-6 py-3 text-[15px] font-semibold text-black"
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

function QrPaymentIcon() {
  return <CreditCard className="size-4 text-gold" />;
}
