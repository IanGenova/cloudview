import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BedDouble,
  Clock,
  ConciergeBell,
  CreditCard,
  History,
  ReceiptText,
  Repeat2,
  ShoppingBag,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { getGuestPortalActivity } from '@/lib/guest-portal-activity';
import { getCurrentNfcGuestIdentity } from '@/lib/nfc-guest-session';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100);
}

function formatDateTime(date?: Date | null) {
  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatStatus(status: string) {
  return status.replaceAll('_', ' ');
}

function statusClass(status: string) {
  if (['PENDING', 'NEW', 'REFUND_PENDING'].includes(status)) {
    return 'bg-amber-100 text-amber-800';
  }

  if (
    ['ACCEPTED', 'PREPARING', 'IN_PROGRESS', 'READY', 'PROCESSING'].includes(
      status
    )
  ) {
    return 'bg-blue-100 text-blue-800';
  }

  if (['DELIVERED', 'COMPLETED', 'PAID', 'REFUNDED'].includes(status)) {
    return 'bg-emerald-100 text-emerald-800';
  }

  if (
    [
      'CANCELLED',
      'REJECTED',
      'EXPIRED',
      'FAILED',
      'PAID_REVIEW_REQUIRED',
      'REFUND_FAILED',
    ].includes(status)
  ) {
    return 'bg-red-100 text-red-800';
  }

  return 'bg-neutral-100 text-neutral-700';
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
      <p className="text-[15px] font-serif font-medium tracking-wide text-white">{title}</p>
      <p className="mt-1 text-xs font-medium leading-5 text-white/50">
        {description}
      </p>
    </div>
  );
}

export default async function GuestActivityPage({
  params,
}: {
  params: Promise<{
    tagCode: string;
  }>;
}) {
  const { tagCode } = await params;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag) {
    redirect('/nfc-access-denied?reason=invalid-nfc-access');
  }

  const activity = await getGuestPortalActivity(tagCode);
  const identity = await getCurrentNfcGuestIdentity(tagCode);

  if (!activity.hasSession) {
    redirect(`/t/${tagCode}?error=session_expired`);
  }

  const recentXenditPayments = identity.session
    ? await db.guestXenditSession.findMany({
        where: {
          guestSessionId: identity.session.id,
          hotelId: tag.hotelId,
        },
        select: {
          id: true,
          flowType: true,
          status: true,
          amountCents: true,
          refundedAmountCents: true,
          orderCode: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
    : [];

  const roomLabel = activity.guestStay?.room
    ? `Room ${activity.guestStay.room.number}${
        activity.guestStay.room.name ? ` · ${activity.guestStay.room.name}` : ''
      }`
    : tag.location?.name ?? tag.label;
  const hasActivity = Boolean(
    activity.guestStay ||
      recentXenditPayments.length ||
      activity.currentOrders.length ||
      activity.currentServiceRequests.length ||
      activity.pastOrders.length ||
      activity.pastServiceRequests.length
  );

  return (
    <>
      {/*
        Decision 3, the owner's: this screen and /orders were the same list
        twice, and this one — current orders, current requests, and the history
        of both — is the one that holds a stay. It is "My stay" now and it is
        the fourth tab's destination, so it needs the shell and the tab bar it
        never had: it used to be a bare page with a "Back to Portal" link and
        no navigation, which is part of why a guest could not find it.

        Its own header went with the wrapping. It carried the guest's name at
        36px on a gradient — the third place on the screen the name appeared,
        and the second statement of where they are.
      */}
      <GuestShell
        hotel={activity.hotel ?? tag.hotel}
        title="My activity"
        subtitle={roomLabel}
        backHref={`/t/${tagCode}`}
        variant="dark"
      >
        <section className="space-y-6">
        {!hasActivity ? (
          <section className="border border-white/10 bg-white/[0.04] px-6 py-12 text-center">
            <ShoppingBag className="mx-auto size-8 text-[#c99c38]" />
            <h2 className="mt-5 font-serif text-2xl">Your activity will appear here</h2>
            <p className="mt-3 text-sm leading-6 text-white/60">
              Orders and service requests from this visit will be easy to track here.
            </p>
            <div className="mt-7 grid gap-3">
              <Link href={`/t/${tagCode}/menu`} className="flex min-h-12 items-center justify-center bg-[#d6a738] px-4 text-sm font-semibold text-black">
                Explore food & drinks
              </Link>
              <Link href={`/t/${tagCode}/service`} className="flex min-h-12 items-center justify-center border border-white/20 px-4 text-sm font-semibold text-white">
                Browse services
              </Link>
            </div>
          </section>
        ) : (
        <>
        <section className="border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-medium text-white/60">
                {activity.guestName
                  ? `${activity.guestName}, here is everything you have going on.`
                  : 'Everything you have going on.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="border border-white/10 bg-white/[0.05] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                  Active Orders
                </p>
                <p className="mt-1 text-3xl font-serif font-light">
                  {activity.currentActiveOrderCount}
                </p>
              </div>

              <div className="border border-white/10 bg-white/[0.05] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                  Active Requests
                </p>
                <p className="mt-1 text-3xl font-serif font-light">
                  {activity.currentActiveServiceRequestCount}
                </p>
              </div>
            </div>
          </div>

          {activity.guestStay ? (
            <div className="mt-6 grid gap-3">
              <div className="bg-black/25 p-4">
                <div className="flex items-center gap-2 text-[#c99c38]">
                  <BedDouble className="size-4" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest">Current Stay</p>
                </div>
                <p className="mt-2 text-[15px] font-serif font-medium text-white/80">
                  {roomLabel}
                </p>
              </div>

              <div className="bg-black/25 p-4">
                <div className="flex items-center gap-2 text-[#c99c38]">
                  <Clock className="size-4" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest">Check-in</p>
                </div>
                <p className="mt-2 text-[15px] font-serif font-medium text-white/80">
                  {formatDateTime(activity.guestStay.checkInAt)}
                </p>
              </div>

              <div className="bg-black/25 p-4">
                <div className="flex items-center gap-2 text-[#c99c38]">
                  <UserCircle className="size-4" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest">Devices</p>
                </div>
                <p className="mt-2 text-[15px] font-serif font-medium text-white/80">
                  {activity.guestStay.devices.length} /{' '}
                  {activity.guestStay.maxDevices} authorized
                </p>
              </div>
            </div>
          ) : null}
        </section>

        {recentXenditPayments.length ? (
          <section className="border border-[#c99c38]/20 bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center gap-2">
              <CreditCard className="size-5 text-[#c99c38]" />
              <h2 className="text-2xl font-serif font-normal tracking-wide">
                Xendit Payments
              </h2>
            </div>

            <div className="grid gap-3">
              {recentXenditPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-serif text-lg font-medium tracking-wide text-[#c99c38]">
                        {formatCurrency(payment.amountCents)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-white/50">
                        {formatDateTime(payment.createdAt)}
                      </p>
                    </div>
                    <span className={`max-w-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${statusClass(payment.status)}`}>
                      {formatStatus(payment.status)}
                    </span>
                  </div>

                  <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-white/40">
                    {formatStatus(payment.flowType)}
                  </p>

                  {payment.orderCode ? (
                    <Link
                      href={`/t/${tagCode}/track/${payment.orderCode}`}
                      className="mt-3 inline-flex text-xs font-semibold text-[#c99c38]"
                    >
                      Track {payment.orderCode}
                    </Link>
                  ) : null}

                  {payment.refundedAmountCents > 0 ? (
                    <p className="mt-2 text-xs font-bold text-blue-200">
                      Refunded {formatCurrency(payment.refundedAmountCents)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-6">
          <div className="min-w-0 border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShoppingBag className="size-5 text-[#c99c38]" />
              <h2 className="text-2xl font-serif font-normal tracking-wide">Current orders</h2>
            </div>

            <div className="space-y-3">
              {activity.currentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/t/${tagCode}/track/${order.orderCode}`}
                  className="block border border-white/10 bg-black/25 p-4 transition hover:border-[#c99c38]/45 hover:bg-black/35"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-serif font-medium tracking-wide text-[15px]">{order.orderCode}</p>
                      <p className="mt-1 text-xs font-medium text-white/50">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </div>

                    <span
                      className={`max-w-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${statusClass(
 order.status
 )}`}
                    >
                      {formatStatus(order.status)}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1">
                    {order.items.slice(0, 3).map((item) => (
                      <p
                        key={item.id}
                        className="text-sm font-medium text-white/70"
                      >
                        {item.quantity}× {item.productNameSnapshot}
                      </p>
                    ))}

                    {order.items.length > 3 ? (
                      <p className="text-xs font-medium text-white/45">
                        +{order.items.length - 3} more item/s
                      </p>
                    ) : null}
                  </div>

                  <p className="mt-3 text-right text-lg font-serif font-medium tracking-wide text-[#c99c38]">
                    {formatCurrency(order.totalCents)}
                  </p>
                </Link>
              ))}

              {!activity.currentOrders.length ? (
                <EmptyState
                  title="No current orders yet"
                  description="Food orders from this visit will appear here."
                />
              ) : null}
            </div>
          </div>

          <div className="min-w-0 border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ConciergeBell className="size-5 text-[#c99c38]" />
              <h2 className="text-2xl font-serif font-normal tracking-wide">Current requests</h2>
            </div>

            <div className="space-y-3">
              {activity.currentServiceRequests.map((request) => (
                <div
                  key={request.id}
                  className="border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-serif font-medium tracking-wide text-[15px]">{request.requestCode}</p>
                      <p className="mt-1 text-sm font-medium text-white/75">
                        {request.type}
                      </p>
                      <p className="mt-1 text-xs font-medium text-white/50">
                        {formatDateTime(request.createdAt)}
                      </p>
                    </div>

                    <span
                      className={`max-w-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${statusClass(
 request.status
 )}`}
                    >
                      {formatStatus(request.status)}
                    </span>
                  </div>

                  {request.notes ? (
                    <p className="mt-3 line-clamp-3 text-xs font-medium leading-5 text-white/60">
                      {request.notes}
                    </p>
                  ) : null}
                </div>
              ))}

              {!activity.currentServiceRequests.length ? (
                <EmptyState
                  title="No current requests yet"
                  description="Service requests from this visit will appear here."
                />
              ) : null}
            </div>
          </div>
        </section>

        {activity.orderAgainItems.length > 0 ? (
          <section className="border border-[#c99c38]/25 bg-[#120e07] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Repeat2 className="size-5 text-[#c99c38]" />
              <h2 className="text-2xl font-serif font-normal tracking-wide">Order Again</h2>
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 10.5rem), 1fr))' }}>
              {activity.orderAgainItems.map((item) => (
                <Link
                  key={item.productId}
                  href={`/t/${tagCode}/menu`}
                  className="border border-white/10 bg-black/25 p-4 transition hover:border-[#c99c38]/45"
                >
                  <Sparkles className="size-5 text-[#c99c38]" />
                  <p className="mt-3 font-serif font-medium tracking-wide text-[15px]">{item.productName}</p>
                  <p className="mt-1 text-xs font-medium text-white/50">
                    Ordered {item.timesOrdered} time/s before
                  </p>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-[#c99c38]">
                    Open Menu
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-6">
          <div className="min-w-0 border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center gap-2">
              <History className="size-5 text-[#c99c38]" />
              <h2 className="text-2xl font-serif font-normal tracking-wide">Past Orders</h2>
            </div>

            <div className="space-y-3">
              {activity.pastOrders.map((order) => (
                <div
                  key={order.id}
                  className="border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-serif font-medium tracking-wide text-[15px]">{order.orderCode}</p>
                      <p className="mt-1 text-xs font-medium text-white/50">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </div>

                    <span
                      className={`max-w-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${statusClass(
 order.status
 )}`}
                    >
                      {formatStatus(order.status)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-medium text-white/60">
                    {order.items
                      .slice(0, 3)
                      .map((item) => `${item.quantity}× ${item.productNameSnapshot}`)
                      .join(', ')}
                    {order.items.length > 3 ? '...' : ''}
                  </p>

                  <p className="mt-3 text-right font-serif font-medium tracking-wide text-[#c99c38]">
                    {formatCurrency(order.totalCents)}
                  </p>
                </div>
              ))}

              {!activity.pastOrders.length ? (
                <EmptyState
                  title="No past orders yet"
                  description="Previous orders from this guest profile will appear here."
                />
              ) : null}
            </div>
          </div>

          <div className="min-w-0 border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ReceiptText className="size-5 text-[#c99c38]" />
              <h2 className="text-2xl font-serif font-normal tracking-wide">Past requests</h2>
            </div>

            <div className="space-y-3">
              {activity.pastServiceRequests.map((request) => (
                <div
                  key={request.id}
                  className="border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-serif font-medium tracking-wide text-[15px]">{request.requestCode}</p>
                      <p className="mt-1 text-sm font-medium text-white/75">
                        {request.type}
                      </p>
                      <p className="mt-1 text-xs font-medium text-white/50">
                        {formatDateTime(request.createdAt)}
                      </p>
                    </div>

                    <span
                      className={`max-w-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${statusClass(
 request.status
 )}`}
                    >
                      {formatStatus(request.status)}
                    </span>
                  </div>
                </div>
              ))}

              {!activity.pastServiceRequests.length ? (
                <EmptyState
                  title="No past service requests yet"
                  description="Previous service requests from this guest profile will appear here."
                />
              ) : null}
            </div>
          </div>
        </section>
        </>
        )}
        </section>
      </GuestShell>

      <GuestBottomNav tagCode={tagCode} active="stay" dark />
    </>
  );
}
