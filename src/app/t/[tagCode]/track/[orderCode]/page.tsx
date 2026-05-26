import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderStatus } from '@prisma/client';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Circle,
  Clock,
  ConciergeBell,
  CreditCard,
  MapPin,
  PackageCheck,
  ReceiptText,
  Timer,
  Truck,
  Utensils,
} from 'lucide-react';
import { db } from '@/lib/db';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { GuestBottomNav, GuestLogo } from '@/components/guest/GuestShell';
import { LiveElapsedTimer } from '@/components/guest/LiveElapsedTimer';
import { RealtimeOrderRefresh } from '@/components/guest/RealtimeOrderRefresh';

export const dynamic = 'force-dynamic';

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const trackingSteps = [
  {
    status: OrderStatus.PENDING,
    label: 'Order Received',
    description: 'Your order has been sent to the hotel team.',
  },
  {
    status: OrderStatus.ACCEPTED,
    label: 'Order Confirmed',
    description: 'Your order has been accepted by staff.',
  },
  {
    status: OrderStatus.PREPARING,
    label: 'Preparing',
    description: 'The kitchen is preparing your order.',
  },
  {
    status: OrderStatus.READY,
    label: 'Ready / Dispatching',
    description: 'Your order is ready and will be delivered soon.',
  },
  {
    status: OrderStatus.DELIVERED,
    label: 'Delivered',
    description: 'Your order has been delivered.',
  },
] as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function money(cents: number) {
  return pesoFormatter.format(cents / 100);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
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

function paymentLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function getStatusContent(status: OrderStatus) {
  switch (status) {
    case OrderStatus.PENDING:
      return {
        title: 'Waiting for confirmation',
        subtitle:
          'Your order was received and is waiting for hotel staff confirmation.',
        etaLabel: 'Estimated confirmation time',
        eta: '2 - 5 mins',
        timerLabel: 'Time since order was placed',
      };

    case OrderStatus.ACCEPTED:
      return {
        title: 'Your order is confirmed',
        subtitle: 'The hotel team accepted your order.',
        etaLabel: 'Estimated delivery time',
        eta: '20 - 25 mins',
        timerLabel: 'Time since confirmation',
      };

    case OrderStatus.PREPARING:
      return {
        title: 'Your order is being prepared',
        subtitle: 'The kitchen is currently preparing your food.',
        etaLabel: 'Estimated remaining time',
        eta: '15 - 20 mins',
        timerLabel: 'Time in preparation',
      };

    case OrderStatus.READY:
      return {
        title: 'Your order is ready',
        subtitle: 'Your order is ready and will be delivered to your room soon.',
        etaLabel: 'Estimated delivery time',
        eta: '5 - 10 mins',
        timerLabel: 'Time since ready',
      };

    case OrderStatus.DELIVERED:
      return {
        title: 'Order delivered',
        subtitle: 'Your order has been delivered. Enjoy your meal.',
        etaLabel: 'Status',
        eta: 'Delivered',
        timerLabel: 'Completed in',
      };

    case OrderStatus.CANCELLED:
      return {
        title: 'Order cancelled',
        subtitle:
          'This order has been cancelled. Please contact staff if you need assistance.',
        etaLabel: 'Status',
        eta: 'Cancelled',
        timerLabel: 'Cancelled after',
      };

    default:
      return {
        title: 'Tracking your order',
        subtitle: 'Your order status is being updated.',
        etaLabel: 'Estimated delivery time',
        eta: '20 - 25 mins',
        timerLabel: 'Running timer',
      };
  }
}

function getStepIndex(status: OrderStatus) {
  return trackingSteps.findIndex((step) => step.status === status);
}

function getHighestCompletedStepIndex(
  statusHistory: {
    status: OrderStatus;
  }[]
) {
  const indexes = statusHistory
    .map((history) => getStepIndex(history.status))
    .filter((index) => index >= 0);

  return indexes.length ? Math.max(...indexes) : 0;
}

function getTimerStart(order: {
  createdAt: Date;
  status: OrderStatus;
  statusHistory: {
    status: OrderStatus;
    createdAt: Date;
  }[];
}) {
  if (
    order.status === OrderStatus.DELIVERED ||
    order.status === OrderStatus.CANCELLED
  ) {
    return order.createdAt;
  }

  const currentStatusHistory = [...order.statusHistory]
    .reverse()
    .find((history) => history.status === order.status);

  return currentStatusHistory?.createdAt ?? order.createdAt;
}

function getTimerEnd(order: {
  status: OrderStatus;
  statusHistory: {
    status: OrderStatus;
    createdAt: Date;
  }[];
}) {
  if (
    order.status !== OrderStatus.DELIVERED &&
    order.status !== OrderStatus.CANCELLED
  ) {
    return null;
  }

  const currentStatusHistory = [...order.statusHistory]
    .reverse()
    .find((history) => history.status === order.status);

  return currentStatusHistory?.createdAt ?? null;
}

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{
    tagCode: string;
    orderCode: string;
  }>;
}) {
  const { tagCode, orderCode } = await params;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag || tag.status !== 'ACTIVE') {
    notFound();
  }

  const order = await db.order.findFirst({
    where: {
      orderCode,
      tagId: tag.id,
      hotelId: tag.hotelId,
    },
    include: {
      hotel: {
        include: {
          settings: true,
        },
      },
      room: true,
      location: true,
      items: {
        orderBy: {
          createdAt: 'asc',
        },
      },
      statusHistory: {
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          status: true,
          note: true,
          createdAt: true,
        },
      },
    },
  });

  if (!order) {
    notFound();
  }

  const roomLabel = order.room
    ? `Room ${order.room.number}`
    : order.location?.name ?? tag.location?.name ?? tag.label;

  const statusContent = getStatusContent(order.status);
  const currentStepIndex =
    order.status === OrderStatus.CANCELLED
      ? getHighestCompletedStepIndex(order.statusHistory)
      : getStepIndex(order.status);

  const historyByStatus = new Map(
    order.statusHistory.map((history) => [history.status, history])
  );

  const timerStart = getTimerStart(order);
  const timerEnd = getTimerEnd(order);

  const isCancelled = order.status === OrderStatus.CANCELLED;
  const isDelivered = order.status === OrderStatus.DELIVERED;

  return (
    <main className="min-h-screen bg-black text-white">
      <RealtimeOrderRefresh orderCode={order.orderCode} />

      <div className="mx-auto min-h-screen max-w-md bg-black px-5 pb-32 pt-5">
        <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
          <Link
            href={`/t/${tagCode}`}
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeft className="size-6" />
          </Link>

          <div className="text-center">
            <h1 className="text-xl font-black">Order Tracking</h1>
            <p className="text-sm text-white/45">{roomLabel}</p>
          </div>

          <div />
        </div>

        <section className="py-8 text-center">
          <div className="mb-8 flex justify-center">
            <GuestLogo hotel={order.hotel} />
          </div>

          {isCancelled ? (
            <div className="mx-auto mb-6 grid size-20 place-items-center rounded-[2rem] border border-red-500/40 bg-red-500/10 text-red-300">
              <AlertTriangle className="size-9" />
            </div>
          ) : isDelivered ? (
            <div className="mx-auto mb-6 grid size-20 place-items-center rounded-[2rem] border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
              <PackageCheck className="size-9" />
            </div>
          ) : (
            <div className="mx-auto mb-6 grid size-20 place-items-center rounded-[2rem] border border-gold/40 bg-gold/10 text-gold">
              <Utensils className="size-9" />
            </div>
          )}

          <h2 className="font-serif text-5xl leading-tight text-white">
            {statusContent.title}
          </h2>

          <p className="mx-auto mt-4 max-w-xs text-sm leading-6 text-white/50">
            {statusContent.subtitle}
          </p>

          <div className="mt-8">
            <p className="text-sm font-bold text-white/45">
              {statusContent.etaLabel}
            </p>

            <p
              className={cx(
                'mt-2 text-3xl font-black',
                isCancelled ? 'text-red-300' : 'text-white'
              )}
            >
              {statusContent.eta}
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-gold/25 bg-gold/10 p-5 text-center">
          <div className="mb-3 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-gold">
            <Timer className="size-4" />
            Running Timer
          </div>

          <p className="text-5xl font-black">
            <LiveElapsedTimer from={timerStart} to={timerEnd} />
          </p>

          <p className="mt-3 text-sm text-white/45">
            {statusContent.timerLabel}
          </p>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black">Live Progress</h2>
              <p className="mt-1 text-xs text-white/45">
                Updates automatically through realtime WebSocket events.
              </p>
            </div>

            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/70">
              {order.status.replaceAll('_', ' ')}
            </span>
          </div>

          <div className="space-y-5">
            {trackingSteps.map((step, index) => {
              const history = historyByStatus.get(step.status);
              const active = order.status === step.status;
              const done = currentStepIndex >= index && !isCancelled;

              const cancelledButCompleted =
                isCancelled && currentStepIndex >= index;

              const completed = done || cancelledButCompleted;

              return (
                <div key={step.status} className="relative flex gap-4">
                  {index < trackingSteps.length - 1 ? (
                    <div
                      className={cx(
                        'absolute left-4 top-9 h-8 w-px',
                        completed ? 'bg-gold' : 'bg-white/20'
                      )}
                    />
                  ) : null}

                  <div
                    className={cx(
                      'z-10 grid size-8 shrink-0 place-items-center rounded-full border',
                      completed
                        ? 'border-gold bg-gold text-ink'
                        : 'border-white/25 bg-black text-white/40'
                    )}
                  >
                    {completed && !active ? (
                      <Check className="size-4" />
                    ) : active ? (
                      <Clock className="size-4" />
                    ) : (
                      <Circle className="size-3" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p
                          className={cx(
                            'font-black',
                            completed || active ? 'text-white' : 'text-white/45'
                          )}
                        >
                          {step.label}
                        </p>
                        <p className="mt-1 text-xs text-white/45">
                          {step.description}
                        </p>
                      </div>

                      {history ? (
                        <p className="shrink-0 text-xs font-semibold text-white/45">
                          {formatTime(history.createdAt)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}

            {isCancelled ? (
              <div className="relative flex gap-4">
                <div className="z-10 grid size-8 shrink-0 place-items-center rounded-full border border-red-500 bg-red-500 text-white">
                  <AlertTriangle className="size-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-red-200">Order Cancelled</p>
                      <p className="mt-1 text-xs text-white/45">
                        This order was cancelled by staff.
                      </p>
                    </div>

                    {historyByStatus.get(OrderStatus.CANCELLED) ? (
                      <p className="shrink-0 text-xs font-semibold text-white/45">
                        {formatTime(
                          historyByStatus.get(OrderStatus.CANCELLED)!.createdAt
                        )}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <ReceiptText className="size-5 text-gold" />
            <h2 className="font-black">Order Details</h2>
          </div>

          <div className="space-y-2">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between gap-3 rounded-2xl bg-white/5 p-3 text-sm"
              >
                <div>
                  <p className="font-bold">
                    {item.quantity}× {item.productNameSnapshot}
                  </p>

                  {item.notes ? (
                    <p className="mt-1 text-xs text-white/40">{item.notes}</p>
                  ) : null}
                </div>

                <b>{money(item.quantity * item.unitPriceCents)}</b>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between text-white/50">
              <span>Subtotal</span>
              <span>{money(order.subtotalCents)}</span>
            </div>

            <div className="flex justify-between text-white/50">
              <span>Service Charge</span>
              <span>{money(order.serviceChargeCents)}</span>
            </div>

            <div className="flex justify-between text-white/50">
              <span>Tax</span>
              <span>{money(order.taxCents)}</span>
            </div>

            <div className="flex justify-between pt-2 text-lg font-black text-white">
              <span>Total</span>
              <span>{money(order.totalCents)}</span>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Truck className="size-5 text-gold" />
            <h2 className="font-black">Delivery Details</h2>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3 rounded-2xl bg-white/5 p-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-gold" />
              <div>
                <p className="font-black">Room / Location</p>
                <p className="mt-1 text-white/50">{roomLabel}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl bg-white/5 p-3">
              <CreditCard className="mt-0.5 size-4 shrink-0 text-gold" />
              <div>
                <p className="font-black">Payment</p>
                <p className="mt-1 text-white/50">
                  {paymentLabel(order.paymentMethod)} · {order.paymentStatus}
                </p>
              </div>
            </div>

            {order.guestName ? (
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="font-black">Guest Name</p>
                <p className="mt-1 text-white/50">{order.guestName}</p>
              </div>
            ) : null}

            {order.notes ? (
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="font-black">Special Notes</p>
                <p className="mt-1 whitespace-pre-line text-white/50">
                  {order.notes}
                </p>
              </div>
            ) : null}

            <div className="rounded-2xl bg-white/5 p-3">
              <p className="font-black">Order Code</p>
              <p className="mt-1 text-white/50">{order.orderCode}</p>
              <p className="mt-1 text-xs text-white/35">
                Ordered at {formatDateTime(order.createdAt)}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <ConciergeBell className="size-5 text-gold" />
            <h2 className="font-black">Need help?</h2>
          </div>

          <p className="text-sm leading-6 text-white/50">
            Contact the front desk if you need to update, follow up, or report
            an issue with this order.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link
              href={`/t/${tagCode}/contact`}
              className="rounded-2xl bg-gold px-4 py-3 text-center text-sm font-black text-ink"
            >
              Contact Front Desk
            </Link>

            <Link
              href={`/t/${tagCode}/service`}
              className="rounded-2xl border border-white/15 px-4 py-3 text-center text-sm font-black text-white"
            >
              Request Assistance
            </Link>
          </div>
        </section>
      </div>

      <GuestBottomNav tagCode={tagCode} active="order" dark />
    </main>
  );
}