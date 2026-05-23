import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, Circle, Clock, ConciergeBell } from 'lucide-react';
import { OrderStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestLogo } from '@/components/guest/GuestShell';
import { AutoRefresh } from '@/components/guest/AutoRefresh';
import { OrderRunningTimer } from '@/components/guest/OrderRunningTimer';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

const trackingSteps = [
  {
    status: OrderStatus.PENDING,
    label: 'Order Confirmed',
    description: 'Your order has been received.'
  },
  {
    status: OrderStatus.ACCEPTED,
    label: 'Accepted by Staff',
    description: 'The team confirmed your order.'
  },
  {
    status: OrderStatus.PREPARING,
    label: 'Preparing Your Food',
    description: 'The kitchen is preparing your items.'
  },
  {
    status: OrderStatus.READY,
    label: 'On The Way',
    description: 'Your order is ready or being delivered.'
  },
  {
    status: OrderStatus.DELIVERED,
    label: 'Delivered',
    description: 'Enjoy your meal.'
  }
];

function statusIndex(status: OrderStatus) {
  if (status === OrderStatus.CANCELLED) return -1;

  return trackingSteps.findIndex((step) => step.status === status);
}

function formatTime(date?: Date | null) {
  if (!date) return '';

  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function estimatedDeliveryText(status: OrderStatus) {
  switch (status) {
    case OrderStatus.PENDING:
      return '20 - 30 mins';
    case OrderStatus.ACCEPTED:
      return '20 - 25 mins';
    case OrderStatus.PREPARING:
      return '15 - 20 mins';
    case OrderStatus.READY:
      return '5 - 10 mins';
    case OrderStatus.DELIVERED:
      return 'Delivered';
    case OrderStatus.CANCELLED:
      return 'Cancelled';
    default:
      return '20 - 30 mins';
  }
}

export default async function OrderTrackingPage({
  params
}: {
  params: Promise<{ tagCode: string; orderCode: string }>;
}) {
  const { tagCode, orderCode } = await params;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag) notFound();

  const order = await db.order.findFirst({
    where: {
      orderCode,
      tagId: tag.id
    },
    include: {
      items: true,
      statusHistory: {
        orderBy: {
          createdAt: 'asc'
        }
      }
    }
  });

  if (!order) notFound();

  const currentIndex = statusIndex(order.status);
  const isCancelled = order.status === OrderStatus.CANCELLED;
  const isDelivered = order.status === OrderStatus.DELIVERED;

  const deliveredHistory = order.statusHistory.find(
    (history) => history.status === OrderStatus.DELIVERED
  );

  const roomOrLocation = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name || 'Guest location';

  return (
    <main className="min-h-screen bg-black text-white">
      <AutoRefresh seconds={10} />

      <div className="mx-auto min-h-screen max-w-md bg-black px-5 pb-28 pt-5">
        <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
          <Link
            href={`/t/${tagCode}`}
            className="grid size-11 place-items-center rounded-full active:bg-white/10"
            aria-label="Back home"
          >
            <span className="text-2xl leading-none">‹</span>
          </Link>

          <div className="text-center">
            <h1 className="font-black">Order Tracking</h1>
            <p className="text-xs text-white/50">{roomOrLocation}</p>
          </div>

          <div />
        </div>

        <div className="mb-8">
          <GuestLogo hotel={tag.hotel} />
        </div>

        {isDelivered ? (
          <section className="rounded-[2rem] bg-white p-6 text-center text-ink shadow-soft">
            <div className="mx-auto grid size-28 place-items-center rounded-full border-[6px] border-gold/60">
              <ConciergeBell className="size-14 text-gold" />
            </div>

            <h2 className="mt-6 text-2xl font-black">Enjoy Your Meal!</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Your order has been delivered.
            </p>

            <div className="mt-5 rounded-2xl bg-neutral-50 p-4 text-left">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-400">
                Order Summary
              </p>

              <p className="mt-2 font-black">{order.orderCode}</p>
              <p className="text-sm text-neutral-500">{money(order.totalCents)}</p>
            </div>

            <div className="mt-5">
              <OrderRunningTimer
                startedAt={order.createdAt.toISOString()}
                completedAt={deliveredHistory?.createdAt.toISOString() || order.updatedAt.toISOString()}
                isRunning={false}
              />
            </div>

            <Link
              href={`/t/${tagCode}/contact`}
              className="mt-5 block rounded-2xl bg-gold px-5 py-4 text-center font-black text-ink"
            >
              Rate Your Experience
            </Link>
          </section>
        ) : (
          <>
            <section className="text-center">
              <p className="text-3xl font-serif leading-tight">
                {isCancelled ? 'Your order was cancelled' : 'Your order is on its way'}
              </p>

              <p className="mt-4 text-sm text-white/60">
                Estimated delivery time
              </p>

              <p className="mt-1 text-xl font-black">
                {estimatedDeliveryText(order.status)}
              </p>
            </section>

            <div className="my-7">
              <OrderRunningTimer startedAt={order.createdAt.toISOString()} />
            </div>

            <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
              <div className="space-y-6">
                {isCancelled ? (
                  <div className="flex gap-4">
                    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-red-500 text-white">
                      ×
                    </div>

                    <div>
                      <p className="font-black text-red-200">Cancelled</p>
                      <p className="text-sm text-white/50">
                        This order has been cancelled by staff.
                      </p>
                    </div>
                  </div>
                ) : (
                  trackingSteps.map((step, index) => {
                    const done = index <= currentIndex;
                    const active = index === currentIndex;

                    const history = order.statusHistory.find(
                      (item) => item.status === step.status
                    );

                    return (
                      <div key={step.status} className="relative flex gap-4">
                        {index < trackingSteps.length - 1 ? (
                          <div
                            className={cn(
                              'absolute left-4 top-9 h-8 w-px',
                              done ? 'bg-gold' : 'bg-white/20'
                            )}
                          />
                        ) : null}

                        <div
                          className={cn(
                            'z-10 grid size-8 shrink-0 place-items-center rounded-full border',
                            done
                              ? 'border-gold bg-gold text-ink'
                              : 'border-white/25 bg-black text-white/40'
                          )}
                        >
                          {done ? (
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
                              <p className={cn('font-black', done ? 'text-white' : 'text-white/45')}>
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
                  })
                )}
              </div>
            </section>

            <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">
                    Order Code
                  </p>
                  <p className="mt-1 text-lg font-black">{order.orderCode}</p>
                </div>

                <StatusBadge status={order.status} />
              </div>

              <div className="mt-4 space-y-2">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between gap-3 rounded-2xl bg-white/5 p-3 text-sm"
                  >
                    <span>
                      {item.quantity}× {item.productNameSnapshot}
                    </span>

                    <b>{money(item.quantity * item.unitPriceCents)}</b>
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="flex justify-between">
                  <span className="text-white/50">Total</span>
                  <b>{money(order.totalCents)}</b>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <GuestBottomNav tagCode={tagCode} active="order" dark />
    </main>
  );
}