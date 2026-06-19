import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  BedDouble,
  Clock,
  ConciergeBell,
  History,
  ReceiptText,
  Repeat2,
  ShoppingBag,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { getGuestPortalActivity } from '@/lib/guest-portal-activity';

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
  if (['PENDING', 'NEW'].includes(status)) {
    return 'bg-amber-100 text-amber-800';
  }

  if (['ACCEPTED', 'PREPARING', 'IN_PROGRESS', 'READY'].includes(status)) {
    return 'bg-blue-100 text-blue-800';
  }

  if (['DELIVERED', 'COMPLETED', 'PAID'].includes(status)) {
    return 'bg-emerald-100 text-emerald-800';
  }

  if (['CANCELLED', 'REFUNDED', 'REJECTED'].includes(status)) {
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
    <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
      <p className="text-sm font-black text-white">{title}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-white/45">
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

  if (!activity.hasSession) {
    redirect(`/t/${tagCode}?error=session_expired`);
  }

  const roomLabel = activity.guestStay?.room
    ? `Room ${activity.guestStay.room.number}${
        activity.guestStay.room.name ? ` · ${activity.guestStay.room.name}` : ''
      }`
    : 'Guest Session';

  return (
    <main className="min-h-screen bg-[#080704] px-4 py-6 text-white">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        <Link
          href={`/t/${tagCode}`}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-white/70 transition hover:bg-white/[0.08] hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to Portal
        </Link>

        <section className="overflow-hidden rounded-[2rem] border border-[#c99c38]/25 bg-gradient-to-br from-[#171107] via-[#0f0d09] to-[#070604] p-6 shadow-2xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#c99c38]">
                Guest Activity
              </p>

              <h1 className="mt-2 text-4xl font-black tracking-tight">
                {activity.guestName || 'Guest'}
              </h1>

              <p className="mt-2 text-sm font-semibold text-white/50">
                {activity.hotel?.name || 'Cloud View'} · {roomLabel}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <p className="text-xs font-black uppercase text-white/40">
                  Active Orders
                </p>
                <p className="mt-1 text-3xl font-black">
                  {activity.currentActiveOrderCount}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <p className="text-xs font-black uppercase text-white/40">
                  Active Requests
                </p>
                <p className="mt-1 text-3xl font-black">
                  {activity.currentActiveServiceRequestCount}
                </p>
              </div>
            </div>
          </div>

          {activity.guestStay ? (
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-black/25 p-4">
                <div className="flex items-center gap-2 text-[#c99c38]">
                  <BedDouble className="size-4" />
                  <p className="text-xs font-black uppercase">Current Stay</p>
                </div>
                <p className="mt-2 text-sm font-bold text-white/75">
                  {roomLabel}
                </p>
              </div>

              <div className="rounded-2xl bg-black/25 p-4">
                <div className="flex items-center gap-2 text-[#c99c38]">
                  <Clock className="size-4" />
                  <p className="text-xs font-black uppercase">Check-in</p>
                </div>
                <p className="mt-2 text-sm font-bold text-white/75">
                  {formatDateTime(activity.guestStay.checkInAt)}
                </p>
              </div>

              <div className="rounded-2xl bg-black/25 p-4">
                <div className="flex items-center gap-2 text-[#c99c38]">
                  <UserCircle className="size-4" />
                  <p className="text-xs font-black uppercase">Devices</p>
                </div>
                <p className="mt-2 text-sm font-bold text-white/75">
                  {activity.guestStay.devices.length} /{' '}
                  {activity.guestStay.maxDevices} authorized
                </p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShoppingBag className="size-5 text-[#c99c38]" />
              <h2 className="text-xl font-black">Current Stay Orders</h2>
            </div>

            <div className="space-y-3">
              {activity.currentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/t/${tagCode}/track/${order.orderCode}`}
                  className="block rounded-[1.5rem] border border-white/10 bg-black/25 p-4 transition hover:border-[#c99c38]/45 hover:bg-black/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{order.orderCode}</p>
                      <p className="mt-1 text-xs font-semibold text-white/40">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${statusClass(
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
                        className="text-sm font-semibold text-white/65"
                      >
                        {item.quantity}× {item.productNameSnapshot}
                      </p>
                    ))}

                    {order.items.length > 3 ? (
                      <p className="text-xs font-bold text-white/35">
                        +{order.items.length - 3} more item/s
                      </p>
                    ) : null}
                  </div>

                  <p className="mt-3 text-right text-lg font-black text-[#c99c38]">
                    {formatCurrency(order.totalCents)}
                  </p>
                </Link>
              ))}

              {!activity.currentOrders.length ? (
                <EmptyState
                  title="No current orders yet"
                  description="Food orders from this current stay will appear here."
                />
              ) : null}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ConciergeBell className="size-5 text-[#c99c38]" />
              <h2 className="text-xl font-black">Current Service Requests</h2>
            </div>

            <div className="space-y-3">
              {activity.currentServiceRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{request.requestCode}</p>
                      <p className="mt-1 text-sm font-bold text-white/65">
                        {request.type}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-white/40">
                        {formatDateTime(request.createdAt)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${statusClass(
                        request.status
                      )}`}
                    >
                      {formatStatus(request.status)}
                    </span>
                  </div>

                  {request.notes ? (
                    <p className="mt-3 line-clamp-3 text-xs font-semibold leading-5 text-white/45">
                      {request.notes}
                    </p>
                  ) : null}
                </div>
              ))}

              {!activity.currentServiceRequests.length ? (
                <EmptyState
                  title="No current requests yet"
                  description="Service requests from this current stay will appear here."
                />
              ) : null}
            </div>
          </div>
        </section>

        {activity.orderAgainItems.length > 0 ? (
          <section className="rounded-[2rem] border border-[#c99c38]/25 bg-[#120e07] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Repeat2 className="size-5 text-[#c99c38]" />
              <h2 className="text-xl font-black">Order Again</h2>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {activity.orderAgainItems.map((item) => (
                <Link
                  key={item.productId}
                  href={`/t/${tagCode}/menu`}
                  className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4 transition hover:border-[#c99c38]/45"
                >
                  <Sparkles className="size-5 text-[#c99c38]" />
                  <p className="mt-3 font-black">{item.productName}</p>
                  <p className="mt-1 text-xs font-semibold text-white/45">
                    Ordered {item.timesOrdered} time/s before
                  </p>
                  <p className="mt-3 text-xs font-black uppercase tracking-wide text-[#c99c38]">
                    Open Menu
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center gap-2">
              <History className="size-5 text-[#c99c38]" />
              <h2 className="text-xl font-black">Past Orders</h2>
            </div>

            <div className="space-y-3">
              {activity.pastOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{order.orderCode}</p>
                      <p className="mt-1 text-xs font-semibold text-white/40">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${statusClass(
                        order.status
                      )}`}
                    >
                      {formatStatus(order.status)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-semibold text-white/55">
                    {order.items
                      .slice(0, 3)
                      .map((item) => `${item.quantity}× ${item.productNameSnapshot}`)
                      .join(', ')}
                    {order.items.length > 3 ? '...' : ''}
                  </p>

                  <p className="mt-3 text-right font-black text-[#c99c38]">
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

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ReceiptText className="size-5 text-[#c99c38]" />
              <h2 className="text-xl font-black">Past Service Requests</h2>
            </div>

            <div className="space-y-3">
              {activity.pastServiceRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{request.requestCode}</p>
                      <p className="mt-1 text-sm font-bold text-white/65">
                        {request.type}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-white/40">
                        {formatDateTime(request.createdAt)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${statusClass(
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
      </section>
    </main>
  );
}