import Link from 'next/link';
import { OrderStatus } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';
import { markOrderPaidAction, updateOrderStatusAction } from './actions';

const statusFilters = [
  { label: 'All Orders', value: 'ALL' },
  { label: 'Pending', value: OrderStatus.PENDING },
  { label: 'Accepted', value: OrderStatus.ACCEPTED },
  { label: 'Preparing', value: OrderStatus.PREPARING },
  { label: 'Ready', value: OrderStatus.READY },
  { label: 'Delivered', value: OrderStatus.DELIVERED },
  { label: 'Cancelled', value: OrderStatus.CANCELLED }
] as const;

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function paymentMethodLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function buildFilterHref(status: string, query?: string) {
  const params = new URLSearchParams();

  if (status !== 'ALL') params.set('status', status);
  if (query?.trim()) params.set('q', query.trim());

  const queryString = params.toString();

  return queryString ? `/dashboard/orders?${queryString}` : '/dashboard/orders';
}

function statusDescription(status: string) {
  switch (status) {
    case OrderStatus.PENDING:
      return 'New guest orders waiting for staff confirmation.';
    case OrderStatus.ACCEPTED:
      return 'Orders accepted by staff and ready for kitchen action.';
    case OrderStatus.PREPARING:
      return 'Orders currently being prepared by the kitchen.';
    case OrderStatus.READY:
      return 'Orders ready for pickup or delivery.';
    case OrderStatus.DELIVERED:
      return 'Completed orders already delivered to guests.';
    case OrderStatus.CANCELLED:
      return 'Orders cancelled by staff.';
    default:
      return 'All food orders from the guest portal.';
  }
}

export default async function OrdersPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const selectedStatus = params?.status || 'ALL';
  const searchQuery = params?.q?.trim() || '';

  const baseWhere = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const orders = await db.order.findMany({
    where: {
      ...baseWhere,
      ...(selectedStatus !== 'ALL'
        ? {
            status: selectedStatus as OrderStatus
          }
        : {})
    },
    include: {
      hotel: true,
      room: true,
      location: true,
      tag: true,
      items: true,
      statusHistory: {
        orderBy: { createdAt: 'desc' },
        take: 5
      },
      posLogs: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  const filteredOrders = searchQuery
    ? orders.filter((order) => {
        const roomOrLocation = order.room
          ? `Room ${order.room.number}`
          : order.location?.name || '';

        const searchableText = [
          order.orderCode,
          order.guestName,
          order.hotel.name,
          roomOrLocation,
          order.paymentMethod,
          order.paymentStatus,
          order.posSyncStatus,
          order.notes,
          ...order.items.map((item) => item.productNameSnapshot)
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(searchQuery.toLowerCase());
      })
    : orders;

  const statusCounts = await Promise.all(
    statusFilters.map(async (filter) => {
      const count = await db.order.count({
        where: {
          ...baseWhere,
          ...(filter.value !== 'ALL'
            ? {
                status: filter.value as OrderStatus
              }
            : {})
        }
      });

      return {
        value: filter.value,
        count
      };
    })
  );

  const countMap = new Map(statusCounts.map((item) => [item.value, item.count]));

  const activeOrders = await db.order.count({
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
    }
  });

  const unpaidOrders = await db.order.count({
    where: {
      ...baseWhere,
      paymentStatus: 'UNPAID'
    }
  });

  const salesOrders = await db.order.findMany({
    where: {
      ...baseWhere,
      NOT: {
        status: OrderStatus.CANCELLED
      }
    },
    select: {
      totalCents: true
    }
  });

  const totalSales = salesOrders.reduce((sum, order) => sum + order.totalCents, 0);

  const selectedLabel =
    statusFilters.find((filter) => filter.value === selectedStatus)?.label || 'Orders';

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Food orders from NFC/QR guest portals. Accepting an order deducts inventory and triggers POS sync."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-bold text-neutral-500">Active Orders</p>
            <p className="mt-2 text-3xl font-black">{activeOrders}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-bold text-neutral-500">Unpaid Orders</p>
            <p className="mt-2 text-3xl font-black">{unpaidOrders}</p>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 xl:col-span-1">
          <CardContent className="p-5">
            <p className="text-sm font-bold text-neutral-500">Orders Total</p>
            <p className="mt-2 text-3xl font-black">{money(totalSales)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-black">Filter Orders</h2>
              <p className="mt-1 text-sm text-neutral-500">
                On mobile, use the dropdown. On desktop, use the status buttons.
              </p>
            </div>

            <form
              action="/dashboard/orders"
              method="GET"
              className="grid w-full gap-3 xl:max-w-xl"
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="md:hidden">
                  <Select name="status" defaultValue={selectedStatus}>
                    {statusFilters.map((filter) => (
                      <option key={filter.value} value={filter.value}>
                        {filter.label} ({countMap.get(filter.value) || 0})
                      </option>
                    ))}
                  </Select>
                </div>

                <Input
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="Search order code, guest name, room, item..."
                />

                <Button type="submit" className="w-full sm:w-auto">
                  Apply
                </Button>
              </div>

              <p className="text-xs font-semibold text-neutral-500 md:hidden">
                Current filter: <span className="text-ink">{selectedLabel}</span>
              </p>
            </form>
          </div>

          <div className="mt-5 hidden flex-wrap gap-2 md:flex">
            {statusFilters.map((filter) => {
              const active = selectedStatus === filter.value;

              return (
                <Link
                  key={filter.value}
                  href={buildFilterHref(filter.value, searchQuery)}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-black transition',
                    active
                      ? 'border-ink bg-ink text-white'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
                  )}
                >
                  {filter.label}
                  <span
                    className={cn(
                      'ml-2 rounded-full px-2 py-0.5 text-xs',
                      active ? 'bg-white/15 text-white' : 'bg-neutral-100 text-neutral-500'
                    )}
                  >
                    {countMap.get(filter.value) || 0}
                  </span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <section className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-soft">
        <div className="border-b border-neutral-100 bg-neutral-50 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">{selectedLabel}</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {statusDescription(selectedStatus)}
              </p>
            </div>

            <span className="grid size-10 place-items-center rounded-full bg-ink text-sm font-black text-white">
              {filteredOrders.length}
            </span>
          </div>
        </div>

        <div className="space-y-4 p-3 sm:p-4">
          {filteredOrders.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center">
              <p className="font-black text-neutral-600">No matching orders</p>
              <p className="mt-1 text-sm text-neutral-500">
                Try another status filter or search keyword.
              </p>
            </div>
          ) : null}

          {filteredOrders.map((order) => {
            const guestName = order.guestName?.trim() || 'Guest name not provided';
            const roomOrLocation = order.room
              ? `Room ${order.room.number}`
              : order.location?.name || 'Guest location';

            return (
              <article
                key={order.id}
                className="overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white"
              >
                <div className="border-b border-neutral-100 bg-white px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black">{order.orderCode}</h3>
                      <StatusBadge status={order.status} />
                      <StatusBadge status={order.paymentStatus} />
                      <StatusBadge status={`POS ${order.posSyncStatus}`} />
                    </div>

                    <p className="text-2xl font-black md:text-right">
                      {money(order.totalCents)}
                    </p>
                  </div>

                  <div className="mt-3 grid gap-2 rounded-2xl bg-neutral-50 p-3 text-sm md:grid-cols-2">
                    <div>
                      <span className="font-black text-neutral-700">Guest Name: </span>
                      <span className="font-semibold text-neutral-600">{guestName}</span>
                    </div>

                    <div>
                      <span className="font-black text-neutral-700">Room / Location: </span>
                      <span className="font-semibold text-neutral-600">{roomOrLocation}</span>
                    </div>

                    <div>
                      <span className="font-black text-neutral-700">Hotel: </span>
                      <span className="font-semibold text-neutral-600">{order.hotel.name}</span>
                    </div>

                    <div>
                      <span className="font-black text-neutral-700">Payment: </span>
                      <span className="font-semibold text-neutral-600">
                        {paymentMethodLabel(order.paymentMethod)}
                      </span>
                    </div>

                    <div className="md:col-span-2">
                      <span className="font-black text-neutral-700">Created: </span>
                      <span className="font-semibold text-neutral-600">
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 p-4">
                  {order.items.map((item) => (
                    <div key={item.id} className="rounded-2xl bg-neutral-50 p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <b>
                            {item.quantity}× {item.productNameSnapshot}
                          </b>

                          {item.notes ? (
                            <p className="mt-1 text-xs font-medium text-neutral-500">
                              Item note: {item.notes}
                            </p>
                          ) : null}
                        </div>

                        <span className="shrink-0 font-black">
                          {money(item.unitPriceCents * item.quantity)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {order.notes ? (
                    <div className="rounded-2xl bg-yellow-50 p-3 text-sm text-yellow-900">
                      <b>Guest note:</b> {order.notes}
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-neutral-100 bg-neutral-50 p-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-neutral-400">
                    Move order to
                  </p>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    {Object.values(OrderStatus).map((status) => (
                      <form key={status} action={updateOrderStatusAction}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="status" value={status} />

                        <Button
                          className={cn(
                            'w-full',
                            order.status === status && 'border-gold bg-gold/15 text-ink'
                          )}
                          size="sm"
                          variant={status === OrderStatus.CANCELLED ? 'danger' : 'outline'}
                          disabled={order.status === status}
                        >
                          {status.replaceAll('_', ' ')}
                        </Button>
                      </form>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <form action={markOrderPaidAction}>
                      <input type="hidden" name="orderId" value={order.id} />

                      <Button
                        className="w-full"
                        size="sm"
                        disabled={order.paymentStatus === 'PAID'}
                      >
                        {order.paymentStatus === 'PAID' ? 'Already Paid' : 'Mark Paid'}
                      </Button>
                    </form>

                    <button
                      type="button"
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-bold hover:bg-neutral-100"
                    >
                      Print Kitchen Ticket
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}