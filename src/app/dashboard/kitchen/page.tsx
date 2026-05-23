import Link from 'next/link';
import { OrderStatus } from '@prisma/client';
import { Clock, History, RefreshCcw } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { KitchenRunningTimer } from '@/components/dashboard/KitchenRunningTimer';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';
import { updateOrderStatusAction } from '../orders/actions';

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function roomOrLocation(order: {
  room: { number: string } | null;
  location: { name: string } | null;
}) {
  if (order.room) return `Room ${order.room.number}`;
  if (order.location) return order.location.name;
  return 'Guest location';
}

function OrderActionButton({
  orderId,
  status,
  label,
  tone = 'dark'
}: {
  orderId: string;
  status: OrderStatus;
  label: string;
  tone?: 'dark' | 'danger' | 'gold' | 'light';
}) {
  return (
    <form action={updateOrderStatusAction} className="w-full">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value={status} />

      <button
        type="submit"
        className={cn(
          'min-h-10 w-full rounded-xl border px-3 py-2 text-xs font-black shadow-sm transition active:scale-[0.98]',
          tone === 'dark' && 'border-black bg-black text-white hover:bg-neutral-800',
          tone === 'danger' && 'border-red-600 bg-red-600 text-white hover:bg-red-700',
          tone === 'gold' && 'border-gold bg-gold text-black hover:bg-gold/80',
          tone === 'light' && 'border-neutral-300 bg-white text-black hover:bg-neutral-100'
        )}
      >
        {label}
      </button>
    </form>
  );
}

function KitchenOrderCard({
  order,
  type
}: {
  order: {
    id: string;
    orderCode: string;
    status: OrderStatus;
    guestName: string | null;
    notes: string | null;
    createdAt: Date;
    room: { number: string } | null;
    location: { name: string } | null;
    items: {
      id: string;
      quantity: number;
      productNameSnapshot: string;
      notes: string | null;
    }[];
  };
  type: 'pending' | 'preparing' | 'ready';
}) {
  const guestName = order.guestName?.trim() || 'Guest name not provided';

  // Existing old ACCEPTED orders will now visually appear as PREPARING.
  const displayStatus =
    order.status === OrderStatus.ACCEPTED ? OrderStatus.PREPARING : order.status;

  return (
    <article className="flex h-[340px] w-[82vw] max-w-[310px] shrink-0 flex-col overflow-hidden rounded-[1.35rem] border border-neutral-200 bg-white shadow-soft sm:w-[300px] md:w-[310px]">
      <div className="shrink-0 border-b border-neutral-100 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-black">{order.orderCode}</h3>
            <p className="mt-0.5 truncate text-xs font-bold text-neutral-500">
              {roomOrLocation(order)}
            </p>
          </div>

          <div className="shrink-0 text-center">
            <StatusBadge status={displayStatus} />
            <KitchenRunningTimer startedAt={order.createdAt.toISOString()} />
          </div>
        </div>

        <div className="mt-3 grid gap-1 rounded-2xl bg-neutral-50 p-3 text-xs">
          <p className="truncate">
            <span className="font-black">Guest:</span>{' '}
            <span className="font-semibold text-neutral-600">{guestName}</span>
          </p>

          <p>
            <span className="font-black">Order Time:</span>{' '}
            <span className="font-semibold text-neutral-600">
              {formatTime(order.createdAt)}
            </span>
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {order.items.map((item) => (
          <div key={item.id} className="rounded-xl bg-neutral-50 px-3 py-2 text-xs">
            <b>
              {item.quantity}× {item.productNameSnapshot}
            </b>

            {item.notes ? (
              <p className="mt-1 text-[11px] font-medium text-neutral-500">
                Note: {item.notes}
              </p>
            ) : null}
          </div>
        ))}

        {order.notes ? (
          <div className="rounded-xl bg-yellow-50 p-2 text-xs text-yellow-900">
            <b>Guest note:</b> {order.notes}
          </div>
        ) : null}
      </div>

      <div className="mt-auto shrink-0 border-t border-neutral-100 bg-neutral-50 p-3">
        {type === 'pending' ? (
          <div className="grid grid-cols-2 gap-2">
            <OrderActionButton
              orderId={order.id}
              status={OrderStatus.PREPARING}
              label="Accept"
              tone="dark"
            />

            <OrderActionButton
              orderId={order.id}
              status={OrderStatus.CANCELLED}
              label="Reject"
              tone="danger"
            />
          </div>
        ) : null}

        {type === 'preparing' ? (
          <OrderActionButton
            orderId={order.id}
            status={OrderStatus.READY}
            label="Done / Ready"
            tone="dark"
          />
        ) : null}

        {type === 'ready' ? (
          <OrderActionButton
            orderId={order.id}
            status={OrderStatus.DELIVERED}
            label="Mark Delivered"
            tone="dark"
          />
        ) : null}
      </div>
    </article>
  );
}

function KitchenLane({
  title,
  description,
  orders,
  type
}: {
  title: string;
  description: string;
  orders: {
    id: string;
    orderCode: string;
    status: OrderStatus;
    guestName: string | null;
    notes: string | null;
    createdAt: Date;
    room: { number: string } | null;
    location: { name: string } | null;
    items: {
      id: string;
      quantity: number;
      productNameSnapshot: string;
      notes: string | null;
    }[];
  }[];
  type: 'pending' | 'preparing' | 'ready';
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-neutral-50">
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <div>
          <h2 className="text-xl font-black md:text-2xl">{title}</h2>
          <p className="mt-0.5 text-xs font-semibold text-neutral-500 md:text-sm">
            {description}
          </p>
        </div>

        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-black text-sm font-black text-white">
          {orders.length}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto px-4 pb-4">
        <div className="flex min-w-full items-stretch gap-3">
          {orders.length === 0 ? (
            <div className="grid min-h-40 w-full place-items-center rounded-[1.5rem] border border-dashed border-neutral-200 bg-white p-6 text-center">
              <p className="font-black text-neutral-500">No {title.toLowerCase()} orders</p>
            </div>
          ) : null}

          {orders.map((order) => (
            <KitchenOrderCard key={order.id} order={order} type={type} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function KitchenDisplayPage({
  searchParams
}: {
  searchParams?: Promise<{ history?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const showHistory = params?.history === '1';

  const baseWhere = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const [liveOrders, historyOrders] = await Promise.all([
    db.order.findMany({
      where: {
        ...baseWhere,
        status: {
          in: [
            OrderStatus.PENDING,
            OrderStatus.ACCEPTED,
            OrderStatus.PREPARING,
            OrderStatus.READY
          ]
        }
      },
      include: {
        room: true,
        location: true,
        items: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    }),

    db.order.findMany({
      where: {
        ...baseWhere,
        status: {
          in: [OrderStatus.DELIVERED, OrderStatus.CANCELLED]
        }
      },
      include: {
        room: true,
        location: true,
        items: true
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 30
    })
  ]);

  const pendingOrders = liveOrders.filter((order) => order.status === OrderStatus.PENDING);

 const preparingOrders = liveOrders.filter((order) =>
  [OrderStatus.ACCEPTED, OrderStatus.PREPARING].includes(order.status)
);

  const readyOrders = liveOrders.filter((order) => order.status === OrderStatus.READY);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <PageHeader
          title="Kitchen Display"
          description="Live kitchen workflow for pending, preparing, and ready orders."
        />

        <div className="flex flex-wrap gap-2">
          <form>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-black hover:bg-neutral-100"
            >
              <RefreshCcw className="size-4" />
              Refresh
            </button>
          </form>

          <Link
            href={showHistory ? '/dashboard/kitchen' : '/dashboard/kitchen?history=1'}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition',
              showHistory
                ? 'bg-black text-white'
                : 'border border-neutral-200 bg-white text-black hover:bg-neutral-100'
            )}
          >
            <History className="size-4" />
            {showHistory ? 'Live Orders' : 'History'}
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="space-y-5 overflow-hidden">
          <KitchenLane
            title="Pending"
            description="New orders waiting for accept or reject."
            orders={pendingOrders}
            type="pending"
          />

          <KitchenLane
            title="Preparing"
            description="Accepted orders and orders currently being prepared."
            orders={preparingOrders}
            type="preparing"
          />

          <KitchenLane
            title="Ready"
            description="Orders ready to be delivered to the guest."
            orders={readyOrders}
            type="ready"
          />
        </main>

        <aside className="xl:sticky xl:top-24 xl:h-[calc(100vh-8rem)]">
          <section className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-soft">
            <div className="border-b border-neutral-100 bg-neutral-50 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">Order History</h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Delivered and cancelled kitchen orders.
                  </p>
                </div>

                <Clock className="size-6 text-neutral-400" />
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {!showHistory ? (
                <div className="grid h-full min-h-72 place-items-center rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
                  <div>
                    <History className="mx-auto size-9 text-neutral-400" />
                    <p className="mt-3 font-black text-neutral-600">
                      Click History to view order history
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      This keeps the live board focused on active kitchen orders.
                    </p>
                  </div>
                </div>
              ) : null}

              {showHistory && historyOrders.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
                  <p className="font-black text-neutral-500">No history yet</p>
                </div>
              ) : null}

              {showHistory
                ? historyOrders.map((order) => (
                    <article
                      key={order.id}
                      className="rounded-[1.5rem] border border-neutral-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-black">{order.orderCode}</h3>
                          <p className="mt-1 text-xs font-bold text-neutral-500">
                            {roomOrLocation(order)} · {formatDateTime(order.updatedAt)}
                          </p>
                        </div>

                        <StatusBadge status={order.status} />
                      </div>

                      <div className="mt-3 space-y-1">
                        {order.items.map((item) => (
                          <p
                            key={item.id}
                            className="rounded-xl bg-neutral-50 px-3 py-2 text-xs font-bold"
                          >
                            {item.quantity}× {item.productNameSnapshot}
                          </p>
                        ))}
                      </div>

                      <div className="mt-3 flex justify-between border-t border-neutral-100 pt-3 text-sm">
                        <span className="font-bold text-neutral-500">Total</span>
                        <span className="font-black">{money(order.totalCents)}</span>
                      </div>
                    </article>
                  ))
                : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}