import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
  Utensils,
} from 'lucide-react';
import { OrderItemStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { GuestBottomNav } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { getCurrentNfcGuestSession } from '@/lib/nfc-guest-session';

export const dynamic = 'force-dynamic';

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

type OrderItemWithBundleComponents = {
  id: string;
  productNameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  notes: string | null;
  isBundleSnapshot: boolean;
  status: OrderItemStatus;
  cancelledQty: number;
  cancelledAt: Date | null;
  cancelReason: string | null;
  bundleComponents: {
    id: string;
    componentNameSnapshot: string;
    quantity: number;
  }[];
};

function money(cents: number) {
  return pesoFormatter.format(cents / 100);
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

function statusBadgeClass(status: OrderStatus) {
  switch (status) {
    case OrderStatus.DELIVERED:
      return 'bg-emerald-100 text-emerald-700';
    case OrderStatus.CANCELLED:
      return 'bg-red-100 text-red-700';
    case OrderStatus.PREPARING:
    case OrderStatus.READY:
      return 'bg-gold/20 text-gold';
    case OrderStatus.ACCEPTED:
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-white/10 text-white/70';
  }
}

function paymentBadgeClass(status: PaymentStatus) {
  if (status === PaymentStatus.PAID) {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === PaymentStatus.REFUNDED) {
    return 'bg-blue-100 text-blue-700';
  }

  return 'bg-red-100 text-red-700';
}

function itemStatusBadgeClass(status: OrderItemStatus) {
  if (status === OrderItemStatus.CANCELLED) {
    return 'bg-red-500/15 text-red-200';
  }

  if (status === OrderItemStatus.PARTIALLY_CANCELLED) {
    return 'bg-amber-500/15 text-amber-200';
  }

  return 'bg-emerald-500/15 text-emerald-200';
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

function extractOrderType(notes?: string | null) {
  if (!notes) {
    return 'Order type not specified';
  }

  const line = notes
    .split('\n')
    .find((item) => item.toLowerCase().startsWith('order type:'));

  if (!line) {
    return 'Order type not specified';
  }

  return line.replace(/^Order Type:\s*/i, '').trim();
}

function getActiveItemQuantity(item: {
  quantity: number;
  cancelledQty?: number | null;
}) {
  return Math.max(item.quantity - (item.cancelledQty ?? 0), 0);
}

function getOrderItemCount(items: OrderItemWithBundleComponents[]) {
  return items.reduce((sum, item) => sum + getActiveItemQuantity(item), 0);
}

function getCancelledItemCount(items: OrderItemWithBundleComponents[]) {
  return items.filter(
    (item) =>
      item.status === OrderItemStatus.CANCELLED ||
      getActiveItemQuantity(item) <= 0
  ).length;
}

function getOrderPreview(items: OrderItemWithBundleComponents[]) {
  const activeItems = items.filter((item) => getActiveItemQuantity(item) > 0);

  if (!activeItems.length) {
    return 'All items cancelled';
  }

  const firstItems = activeItems
    .slice(0, 2)
    .map((item) => {
      const activeQty = getActiveItemQuantity(item);

      const label = item.isBundleSnapshot
        ? `${activeQty}× ${item.productNameSnapshot} bundle`
        : `${activeQty}× ${item.productNameSnapshot}`;

      return label;
    })
    .join(', ');

  return `${firstItems}${activeItems.length > 2 ? '…' : ''}`;
}

function OrderItemSummary({
  item,
}: {
  item: OrderItemWithBundleComponents;
}) {
  const activeQty = getActiveItemQuantity(item);
  const isCancelled =
    item.status === OrderItemStatus.CANCELLED || activeQty <= 0;

  return (
    <div
      className={
        isCancelled
          ? 'rounded-2xl border border-red-500/20 bg-red-500/10 p-3'
          : 'rounded-2xl bg-white/5 p-3'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={
                isCancelled
                  ? 'text-sm font-black text-red-100 line-through decoration-red-300'
                  : 'text-sm font-black text-white'
              }
            >
              {isCancelled ? item.quantity : activeQty}×{' '}
              {item.productNameSnapshot}
            </p>

            {item.isBundleSnapshot ? (
              <span className="rounded-full bg-gold/15 px-3 py-1 text-[10px] font-black text-gold">
                Bundle
              </span>
            ) : null}

            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black ${itemStatusBadgeClass(
                item.status
              )}`}
            >
              {statusLabel(item.status)}
            </span>
          </div>

          {item.cancelledQty > 0 ? (
            <p className="mt-1 text-xs font-bold text-red-200">
              Cancelled quantity: {item.cancelledQty}
            </p>
          ) : null}

          {item.cancelReason ? (
            <p className="mt-1 text-xs font-bold text-red-200">
              Reason: {item.cancelReason}
            </p>
          ) : null}

          {item.notes ? (
            <p className="mt-1 whitespace-pre-line text-xs text-white/40">
              {item.notes}
            </p>
          ) : null}
        </div>

        <p
          className={
            isCancelled
              ? 'text-sm font-black text-red-100'
              : 'text-sm font-black text-white'
          }
        >
          {money(activeQty * item.unitPriceCents)}
        </p>
      </div>

      {item.isBundleSnapshot ? (
        <div className="mt-3 rounded-xl bg-gold/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gold">
            Includes
          </p>

          {item.bundleComponents.length ? (
            <div className="mt-2 space-y-1">
              {item.bundleComponents.map((component) => (
                <p
                  key={component.id}
                  className="text-xs font-bold text-white/75"
                >
                  {component.quantity}× {component.componentNameSnapshot}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs font-bold text-white/45">
              Bundle component details were not saved for this order.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default async function MyOrdersPage({
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

  const orders = guestSession
    ? await db.order.findMany({
        where: {
          hotelId: tag.hotelId,
          tagId: tag.id,
          guestSessionId: guestSession.id,
        },
        include: {
          items: {
            include: {
              bundleComponents: {
                orderBy: {
                  createdAt: 'asc',
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50,
      })
    : [];

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto min-h-screen max-w-md px-5 pb-32 pt-5">
        <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
          <Link
            href={`/t/${tagCode}`}
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeft className="size-6" />
          </Link>

          <div className="text-center">
            <h1 className="text-xl font-black">My Orders</h1>
            <p className="text-sm text-white/45">{location}</p>
          </div>

          <div />
        </div>

        <section className="mb-5 rounded-[2rem] border border-gold/20 bg-gold/10 p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-gold text-black">
              <ShoppingBag className="size-6" />
            </div>

            <div>
              <h2 className="font-black text-white">Food Order History</h2>
              <p className="mt-1 text-sm leading-6 text-white/50">
                View your current and previous food orders. Pending orders can
                still be managed from the tracking page.
              </p>
            </div>
          </div>
        </section>

        {orders.length ? (
          <div className="space-y-4">
            {orders.map((order) => {
              const itemCount = getOrderItemCount(order.items);
              const cancelledItemCount = getCancelledItemCount(order.items);
              const preview = getOrderPreview(order.items);
              const orderType = extractOrderType(order.notes);
              const canManageItems = order.status === OrderStatus.PENDING;

              return (
                <article
                  key={order.id}
                  className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-black text-white">
                          {order.orderCode}
                        </h2>

                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-black ${statusBadgeClass(
                            order.status
                          )}`}
                        >
                          {statusLabel(order.status)}
                        </span>
                      </div>

                      <p className="mt-1 text-xs font-bold text-white/40">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </div>

                    <p className="shrink-0 text-right text-lg font-black text-gold">
                      {money(order.totalCents)}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-white/5 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/30">
                        Active Items
                      </p>
                      <p className="mt-1 text-sm font-black text-white">
                        {itemCount}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white/5 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/30">
                        Payment
                      </p>
                      <p className="mt-1 text-sm font-black text-white">
                        {order.paymentMethod.replaceAll('_', ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-black ${paymentBadgeClass(
                        order.paymentStatus
                      )}`}
                    >
                      {statusLabel(order.paymentStatus)}
                    </span>

                    <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black text-white/60">
                      {orderType}
                    </span>

                    {cancelledItemCount > 0 ? (
                      <span className="rounded-full bg-red-500/15 px-3 py-1 text-[10px] font-black text-red-200">
                        {cancelledItemCount} cancelled item
                        {cancelledItemCount === 1 ? '' : 's'}
                      </span>
                    ) : null}

                    {canManageItems ? (
                      <span className="rounded-full bg-blue-500/15 px-3 py-1 text-[10px] font-black text-blue-200">
                        Can cancel items
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-2xl bg-white/5 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/30">
                      Preview
                    </p>
                    <p className="mt-1 text-sm font-bold leading-6 text-white/70">
                      {preview}
                    </p>
                  </div>

                  <details className="mt-3 rounded-2xl bg-white/5 p-3">
                    <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-gold">
                      View Items
                    </summary>

                    <div className="mt-3 space-y-2">
                      {order.items.map((item) => (
                        <OrderItemSummary key={item.id} item={item} />
                      ))}
                    </div>
                  </details>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Link
                      href={`/t/${tagCode}/track/${order.orderCode}`}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gold px-4 py-3 text-center text-sm font-black text-black"
                    >
                      <PackageCheck className="size-4" />
                      {canManageItems ? 'Track / Manage' : 'Track Order'}
                    </Link>

                    <Link
                      href={`/t/${tagCode}/menu`}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 py-3 text-center text-sm font-black text-white"
                    >
                      <Utensils className="size-4" />
                      Order Again
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="grid min-h-[60vh] place-items-center rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
            <div>
              <div className="mx-auto grid size-20 place-items-center rounded-[2rem] bg-white/10 text-gold">
                <ReceiptText className="size-10" />
              </div>

              <h2 className="mt-5 text-2xl font-black">No orders yet</h2>

              <p className="mt-2 text-sm leading-6 text-white/45">
                Food orders you place during this guest session will appear here.
              </p>

              <Link
                href={`/t/${tagCode}/menu`}
                className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-3 text-sm font-black text-black"
              >
                <Utensils className="size-4" />
                Order Food
              </Link>
            </div>
          </section>
        )}

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="size-5 text-gold" />
            <h2 className="font-black">Order Notes</h2>
          </div>

          <div className="space-y-3 text-sm leading-6 text-white/50">
            <p>
              Pending orders may still allow item cancellation from the tracking
              page.
            </p>
            <p>
              Once the order is accepted or preparation starts, please contact
              the front desk for changes.
            </p>
            <p>
              Cancelled items will no longer count toward the active order total.
            </p>
          </div>
        </section>
      </div>

      <GuestBottomNav tagCode={tagCode} active="order" dark />
    </main>
  );
}