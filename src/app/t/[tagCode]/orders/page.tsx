import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  Utensils,
  QrCode,
} from 'lucide-react';
import {
  GuestXenditFlow,
  OrderItemStatus,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { GuestBottomNav } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { getCurrentNfcGuestIdentity } from '@/lib/nfc-guest-session';
import { getGuestRewardsContextForTag } from '@/lib/nfc-rewards';

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

  if (
    status === PaymentStatus.REFUNDED ||
    status === PaymentStatus.PARTIALLY_REFUNDED
  ) {
    return 'bg-blue-100 text-blue-700';
  }

  if (status === PaymentStatus.REFUND_PENDING) {
    return 'bg-amber-100 text-amber-800';
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
          ? 'rounded-[1.25rem] border border-red-500/20 bg-red-500/10 p-4'
          : 'rounded-[1.25rem] bg-white/5 p-4'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={
                isCancelled
                  ? 'font-serif text-[15px] font-medium tracking-wide text-red-100 line-through decoration-red-300'
                  : 'font-serif text-[15px] font-medium tracking-wide text-white'
              }
            >
              {isCancelled ? item.quantity : activeQty}×{' '}
              {item.productNameSnapshot}
            </p>

            {item.isBundleSnapshot ? (
              <span className="rounded-full bg-gold/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-gold">
                Bundle
              </span>
            ) : null}

            <span
              className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${itemStatusBadgeClass(
                item.status
              )}`}
            >
              {statusLabel(item.status)}
            </span>
          </div>

          {item.cancelledQty > 0 ? (
            <p className="mt-2 text-xs font-medium text-red-200/80">
              Cancelled quantity: {item.cancelledQty}
            </p>
          ) : null}

          {item.cancelReason ? (
            <p className="mt-1 text-xs font-medium text-red-200/80">
              Reason: {item.cancelReason}
            </p>
          ) : null}

          {item.notes ? (
            <p className="mt-2 whitespace-pre-line text-[13px] font-medium leading-relaxed text-white/50">
              <span className="text-white/70">Note: </span>{item.notes}
            </p>
          ) : null}
        </div>

        <p
          className={
            isCancelled
              ? 'font-serif text-[15px] font-medium tracking-wide text-red-100'
              : 'font-serif text-[15px] font-medium tracking-wide text-white'
          }
        >
          {money(activeQty * item.unitPriceCents)}
        </p>
      </div>

      {item.isBundleSnapshot ? (
        <div className="mt-4 rounded-xl bg-gold/10 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
            Includes
          </p>

          {item.bundleComponents.length ? (
            <div className="mt-2 space-y-1.5">
              {item.bundleComponents.map((component) => (
                <p
                  key={component.id}
                  className="text-[13px] font-medium text-white/75"
                >
                  {component.quantity}× {component.componentNameSnapshot}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[13px] font-medium text-white/45">
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

  const guestIdentity = await getCurrentNfcGuestIdentity(tagCode);
  const guestSession = guestIdentity.session;
  const guestDisplayName = guestIdentity.guestName || 'Guest';
  const rewardsContext = await getGuestRewardsContextForTag(tagCode);

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

  const xenditSessions = guestSession
    ? await db.guestXenditSession.findMany({
        where: {
          guestSessionId: guestSession.id,
          hotelId: tag.hotelId,
          tagId: tag.id,
          flowType: GuestXenditFlow.FOOD_ORDER,
        },
        select: {
          id: true,
          status: true,
          amountCents: true,
          refundedAmountCents: true,
          checkoutUrl: true,
          orderCode: true,
          errorMessage: true,
          refundErrorMessage: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : [];

  /**
   * A completed Xendit session with an order code is already represented by
   * the order card below. Hide the duplicate payment activity card, while
   * keeping pending, processing, review, and refund states visible.
   */
  const visibleXenditSessions = xenditSessions.filter(
    (payment) =>
      payment.status !== 'COMPLETED' || !payment.orderCode
  );

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto min-h-screen max-w-md px-5 pb-32 pt-5">
        <div className="mb-6 grid grid-cols-[44px_1fr_44px] items-center">
          <Link
            href={`/t/${tagCode}`}
            className="grid size-11 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Back"
          >
            <ChevronLeft className="size-6" />
          </Link>

          <div className="text-center">
            <h1 className="font-serif text-xl font-normal tracking-wide">My Orders</h1>
            <p className="mt-0.5 text-xs font-medium text-white/50">
              {location} · <span className="capitalize">{guestDisplayName}</span>
            </p>
          </div>

          <div />
        </div>

        <section className="mb-5 rounded-[2rem] border border-gold/20 bg-gold/10 p-5 backdrop-blur-md">
          <div className="flex items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gold text-black shadow-sm">
              <ShoppingBag className="size-6" />
            </div>

            <div>
              <h2 className="font-serif text-xl font-normal tracking-wide text-white">Food Order History</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-gold">
                Guest: {guestDisplayName}
              </p>
              <p className="mt-2 text-[13px] font-medium leading-relaxed text-white/60">
                View your current and previous food orders. Pending orders can
                still be managed from the tracking page.
              </p>
            </div>
          </div>
        </section>

        {rewardsContext.guestMember && rewardsContext.pointAccount ? (
          <section className="mb-5 rounded-[2rem] border border-gold/25 bg-gold/10 p-5 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
                  CloudView Rewards
                </p>

                <h2 className="mt-1 font-serif text-2xl font-normal tracking-wide text-white">
                  {rewardsContext.pointAccount.availablePoints} points available
                </h2>

                <p className="mt-1 text-sm font-medium leading-6 text-white/60">
                  Orders linked to your rewards profile can earn points once paid and delivered.
                </p>
              </div>

              <Link
                href={`/t/${tagCode}/rewards`}
                className="shrink-0 rounded-[1.25rem] bg-gold px-5 py-3 text-[13px] font-semibold tracking-wide text-black transition hover:brightness-110 active:scale-[0.98]"
              >
                View
              </Link>
            </div>
          </section>
        ) : (
          <section className="mb-5 rounded-[2rem] border border-gold/25 bg-white/[0.04] p-5 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
                  CloudView Rewards
                </p>

                <h2 className="mt-1 font-serif text-xl font-normal tracking-wide text-white">
                  Claim points from your orders
                </h2>

                <p className="mt-1 text-[13px] font-medium leading-6 text-white/55">
                  Link your guest rewards profile to earn points from food orders and services.
                </p>
              </div>

              <Link
                href={`/t/${tagCode}/rewards`}
                className="shrink-0 rounded-[1.25rem] bg-gold px-5 py-3 text-[13px] font-semibold tracking-wide text-black transition hover:brightness-110 active:scale-[0.98]"
              >
                Claim
              </Link>
            </div>
          </section>
        )}

        {visibleXenditSessions.length ? (
          <section className="mb-5 rounded-[2rem] border border-gold/20 bg-white/[0.035] p-5 backdrop-blur-md">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-gold/15 text-gold">
                <QrCode className="size-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
                  Xendit Activity
                </p>
                <h2 className="mt-1 font-serif text-xl font-normal tracking-wide text-white">
                  Payment activity
                </h2>
              </div>
            </div>

            <div className="space-y-3">
              {visibleXenditSessions.map((payment) => {
                const canResume =
                  payment.status === 'PENDING' &&
                  Boolean(payment.checkoutUrl) &&
                  (!payment.expiresAt || payment.expiresAt > new Date());

                return (
                  <div
                    key={payment.id}
                    className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-white">
                          {money(payment.amountCents)}
                        </p>
                        <p className="mt-1 text-xs font-medium text-white/45">
                          {formatDateTime(payment.createdAt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-gold/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-gold">
                        {statusLabel(payment.status)}
                      </span>
                    </div>

                    {payment.refundedAmountCents > 0 ? (
                      <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-blue-200">
                        <RotateCcw className="size-3.5" />
                        Refunded: {money(payment.refundedAmountCents)}
                      </p>
                    ) : null}

                    {payment.errorMessage || payment.refundErrorMessage ? (
                      <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs font-medium leading-5 text-red-200">
                        {payment.refundErrorMessage || payment.errorMessage}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {canResume && payment.checkoutUrl ? (
                        <a
                          href={payment.checkoutUrl}
                          className="rounded-xl bg-gold px-4 py-2 text-xs font-black text-black"
                        >
                          Continue payment
                        </a>
                      ) : null}

                      {payment.orderCode ? (
                        <Link
                          href={`/t/${tagCode}/track/${payment.orderCode}`}
                          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-black text-white"
                        >
                          Track order
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

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
                  className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-sm backdrop-blur-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-serif text-[17px] font-medium tracking-wide text-white">
                          {order.orderCode}
                        </h2>

                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${statusBadgeClass(
                            order.status
                          )}`}
                        >
                          {statusLabel(order.status)}
                        </span>
                      </div>

                      <p className="mt-1 text-xs font-medium text-white/50">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </div>

                    <p className="shrink-0 text-right font-serif text-lg font-medium tracking-wide text-gold">
                      {money(order.totalCents)}
                    </p>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/5 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                        Active Items
                      </p>
                      <p className="mt-1 font-serif text-lg font-normal tracking-wide text-white">
                        {itemCount}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white/5 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                        Payment
                      </p>
                      <p className="mt-1 font-serif text-base font-normal tracking-wide text-white">
                        {order.paymentMethod.replaceAll('_', ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${paymentBadgeClass(
                        order.paymentStatus
                      )}`}
                    >
                      {statusLabel(order.paymentStatus)}
                    </span>

                    <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/70">
                      {orderType}
                    </span>

                    {cancelledItemCount > 0 ? (
                      <span className="rounded-full bg-red-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-red-200">
                        {cancelledItemCount} cancelled item{cancelledItemCount === 1 ? '' : 's'}
                      </span>
                    ) : null}

                    {canManageItems ? (
                      <span className="rounded-full bg-blue-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-blue-200">
                        Can cancel items
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-5 rounded-[1.25rem] bg-white/5 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                      Preview
                    </p>
                    <p className="mt-1.5 text-[15px] font-medium leading-relaxed text-white/75">
                      {preview}
                    </p>
                  </div>

                  <details className="group mt-3 rounded-[1.25rem] bg-white/5 p-4 open:bg-white/[0.07]">
                    <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-widest text-gold transition group-open:mb-4">
                      View Order Details
                    </summary>

                    <div className="space-y-3">
                      {order.items.map((item) => (
                        <OrderItemSummary key={item.id} item={item} />
                      ))}
                    </div>
                  </details>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Link
                      href={`/t/${tagCode}/track/${order.orderCode}`}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-[1.25rem] bg-gold px-4 py-3 text-center text-[15px] font-semibold tracking-wide text-black transition hover:brightness-110 active:scale-[0.98]"
                    >
                      <PackageCheck className="size-4" />
                      {canManageItems ? 'Track / Manage' : 'Track Order'}
                    </Link>

                    <Link
                      href={`/t/${tagCode}/menu`}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-[1.25rem] border border-white/15 px-4 py-3 text-center text-[15px] font-semibold tracking-wide text-white transition hover:bg-white/10 active:scale-[0.98]"
                    >
                      <Utensils className="size-4 text-gold" />
                      Order Again
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="grid min-h-[50vh] place-items-center rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-md">
            <div>
              <div className="mx-auto grid size-24 place-items-center rounded-full bg-white/5 text-gold shadow-sm">
                <ReceiptText className="size-10" strokeWidth={1.5} />
              </div>

              <h2 className="mt-6 font-serif text-3xl font-light tracking-wide">No orders yet</h2>

              <p className="mt-3 text-[15px] font-medium leading-relaxed text-white/50">
                Food orders you place during this guest session will appear here.
              </p>

              <Link
                href={`/t/${tagCode}/menu`}
                className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-[1.25rem] bg-gold px-6 py-3 text-[15px] font-semibold tracking-wide text-black transition hover:brightness-110 active:scale-[0.98]"
              >
                <Utensils className="size-4" />
                Order Food
              </Link>
            </div>
          </section>
        )}

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
              <Clock className="size-5" />
            </div>
            <h2 className="font-serif text-xl font-normal tracking-wide">Order Notes</h2>
          </div>

          <div className="space-y-3 text-[13px] font-medium leading-relaxed text-white/60">
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