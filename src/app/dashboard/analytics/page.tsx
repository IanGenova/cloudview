import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/dashboard/StatCard';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/money';

export const dynamic = 'force-dynamic';

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

function formatMoneyFromCents(cents: number) {
  return money(cents);
}

function formatPeso(value: number) {
  return pesoFormatter.format(value);
}

function getLastNDays(days: number) {
  const result: {
    key: string;
    label: string;
    date: Date;
  }[] = [];

  const today = new Date();

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    date.setHours(0, 0, 0, 0);

    const key = date.toISOString().slice(0, 10);

    result.push({
      key,
      label: new Intl.DateTimeFormat('en-PH', {
        month: 'short',
        day: 'numeric',
      }).format(date),
      date,
    });
  }

  return result;
}

function getStartOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function getMaxValue(values: number[]) {
  return Math.max(...values, 1);
}

function getPercentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function statusLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function getOrderStatusTone(status: OrderStatus) {
  switch (status) {
    case OrderStatus.DELIVERED:
      return 'bg-emerald-100 text-emerald-700';
    case OrderStatus.CANCELLED:
      return 'bg-red-100 text-red-700';
    case OrderStatus.PREPARING:
    case OrderStatus.READY:
      return 'bg-amber-100 text-amber-700';
    case OrderStatus.ACCEPTED:
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-neutral-100 text-neutral-700';
  }
}

function getPaymentStatusTone(status: PaymentStatus) {
  switch (status) {
    case PaymentStatus.PAID:
      return 'bg-emerald-100 text-emerald-700';
    case PaymentStatus.REFUNDED:
      return 'bg-neutral-100 text-neutral-700';
    default:
      return 'bg-amber-100 text-amber-700';
  }
}

export default async function AnalyticsPage() {
  const user = await requireUser();

  const baseOrderWhere: Prisma.OrderWhereInput =
    user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const baseServiceRequestWhere: Prisma.ServiceRequestWhereInput =
    user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const baseMenuStockWhere: Prisma.MenuAvailabilityStockWhereInput =
    user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const baseMovementWhere: Prisma.MenuAvailabilityMovementWhereInput =
    user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const days = getLastNDays(14);
  const startDate = getStartOfDay(days[0].date);

  const [
    sales,
    orders,
    requests,
    roomOrders,
    poolOrders,
    recentOrders,
    orderStatusGroups,
    paymentStatusGroups,
    popularItems,
    serviceTypeGroups,
    serviceStatusGroups,
    menuStocks,
    recentStockMovements,
    stockMovementUsage,
  ] = await Promise.all([
    db.order.aggregate({
      where: baseOrderWhere,
      _sum: {
        totalCents: true,
      },
    }),

    db.order.count({
      where: baseOrderWhere,
    }),

    db.serviceRequest.count({
      where: baseServiceRequestWhere,
    }),

    db.order.count({
      where: {
        ...baseOrderWhere,
        roomId: {
          not: null,
        },
      },
    }),

    db.order.count({
      where: {
        ...baseOrderWhere,
        location: {
          type: 'POOL',
        },
      },
    }),

    db.order.findMany({
      where: {
        ...baseOrderWhere,
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        id: true,
        totalCents: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    }),

    db.order.groupBy({
      by: ['status'],
      where: baseOrderWhere,
      _count: {
        _all: true,
      },
    }),

    db.order.groupBy({
      by: ['paymentStatus'],
      where: baseOrderWhere,
      _count: {
        _all: true,
      },
    }),

    db.orderItem.groupBy({
      by: ['productNameSnapshot'],
      where: {
        order: baseOrderWhere,
      },
      _sum: {
        quantity: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: 8,
    }),

    db.serviceRequest.groupBy({
      by: ['type'],
      where: baseServiceRequestWhere,
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          type: 'desc',
        },
      },
      take: 8,
    }),

    db.serviceRequest.groupBy({
      by: ['status'],
      where: baseServiceRequestWhere,
      _count: {
        _all: true,
      },
    }),

    db.menuAvailabilityStock.findMany({
      where: baseMenuStockWhere,
      include: {
        product: {
          select: {
            name: true,
            isAvailable: true,
          },
        },
        hotel: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        {
          hotel: {
            name: 'asc',
          },
        },
        {
          product: {
            name: 'asc',
          },
        },
      ],
    }),

    db.menuAvailabilityMovement.findMany({
      where: baseMovementWhere,
      include: {
        product: {
          select: {
            name: true,
          },
        },
        hotel: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 8,
    }),

    db.menuAvailabilityMovement.groupBy({
      by: ['productId'],
      where: {
        ...baseMovementWhere,
        type: 'ORDER_DEDUCTION',
      },
      _sum: {
        quantity: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: 8,
    }),
  ]);

  const movementProductIds = stockMovementUsage.map((item) => item.productId);

  const movementProducts = movementProductIds.length
    ? await db.menuProduct.findMany({
        where: {
          id: {
            in: movementProductIds,
          },
        },
        select: {
          id: true,
          name: true,
        },
      })
    : [];

  const movementProductMap = new Map(
    movementProducts.map((product) => [product.id, product])
  );

  const totalSalesCents = sales._sum.totalCents ?? 0;
  const averageOrderValueCents = orders
    ? Math.round(totalSalesCents / orders)
    : 0;

  const deliveredOrders =
    orderStatusGroups.find((item) => item.status === OrderStatus.DELIVERED)
      ?._count._all ?? 0;

  const cancelledOrders =
    orderStatusGroups.find((item) => item.status === OrderStatus.CANCELLED)
      ?._count._all ?? 0;

  const completionRate = getPercentage(deliveredOrders, orders);
  const cancellationRate = getPercentage(cancelledOrders, orders);

  const salesTrend = days.map((day) => {
    const dayOrders = recentOrders.filter(
      (order) => order.createdAt.toISOString().slice(0, 10) === day.key
    );

    return {
      label: day.label,
      salesCents: dayOrders.reduce((sum, order) => sum + order.totalCents, 0),
      orders: dayOrders.length,
    };
  });

  const maxSales = getMaxValue(salesTrend.map((item) => item.salesCents));
  const maxOrders = getMaxValue(salesTrend.map((item) => item.orders));

  const maxPopularQty = getMaxValue(
    popularItems.map((item) => item._sum.quantity ?? 0)
  );

  const maxServiceQty = getMaxValue(
    serviceTypeGroups.map((item) => item._count._all)
  );

  const availableStockItems = menuStocks.filter(
    (stock) =>
      stock.product.isAvailable && stock.availableQty > 0 && !stock.isSoldOut
  ).length;

  const soldOutStockItems = menuStocks.filter(
    (stock) => stock.isSoldOut || stock.availableQty <= 0
  ).length;

  const hiddenMenuItems = menuStocks.filter(
    (stock) => !stock.product.isAvailable
  ).length;

  const totalAvailableQty = menuStocks.reduce(
    (sum, stock) => sum + stock.availableQty,
    0
  );

  const totalSoldQty = menuStocks.reduce((sum, stock) => sum + stock.soldQty, 0);

  const topStockUsage = stockMovementUsage.map((item) => ({
    productName: movementProductMap.get(item.productId)?.name ?? item.productId,
    quantity: item._sum.quantity ?? 0,
  }));

  const maxStockUsage = getMaxValue(topStockUsage.map((item) => item.quantity));

  return (
    <div>
      <PageHeader
        title="Business Analytics"
        description="Sales performance, order flow, service requests, menu popularity, and stock availability insights."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total sales" value={formatMoneyFromCents(totalSalesCents)} />
        <StatCard label="Total orders" value={orders} />
        <StatCard label="Average order value" value={formatMoneyFromCents(averageOrderValueCents)} />
        <StatCard label="Service requests" value={requests} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Room service orders" value={roomOrders} />
        <StatCard label="Poolside orders" value={poolOrders} />
        <StatCard label="Completion rate" value={`${completionRate}%`} />
        <StatCard label="Cancellation rate" value={`${cancellationRate}%`} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Sales trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-neutral-500">
                  Last 14 days revenue
                </p>
                <p className="mt-1 text-2xl font-black">
                  {formatMoneyFromCents(
                    salesTrend.reduce((sum, item) => sum + item.salesCents, 0)
                  )}
                </p>
              </div>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
                Revenue
              </span>
            </div>

            <div className="flex h-64 items-end gap-2 rounded-[2rem] bg-neutral-50 p-4">
              {salesTrend.map((item) => {
                const height = Math.max((item.salesCents / maxSales) * 100, 4);

                return (
                  <div
                    key={item.label}
                    className="flex h-full min-w-0 flex-1 flex-col justify-end"
                  >
                    <div className="group relative flex flex-1 items-end">
                      <div
                        className="w-full rounded-t-2xl bg-black transition hover:bg-gold"
                        style={{
                          height: `${height}%`,
                        }}
                      />

                      <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 rounded-xl bg-black px-3 py-2 text-xs font-bold text-white group-hover:block">
                        {formatMoneyFromCents(item.salesCents)}
                      </div>
                    </div>

                    <p className="mt-2 truncate text-center text-[10px] font-bold text-neutral-400">
                      {item.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-neutral-500">
                  Last 14 days orders
                </p>
                <p className="mt-1 text-2xl font-black">
                  {salesTrend.reduce((sum, item) => sum + item.orders, 0)}
                </p>
              </div>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
                Orders
              </span>
            </div>

            <div className="space-y-3">
              {salesTrend.map((item) => {
                const width = Math.max((item.orders / maxOrders) * 100, 3);

                return (
                  <div key={item.label}>
                    <div className="mb-1 flex justify-between text-xs font-bold text-neutral-500">
                      <span>{item.label}</span>
                      <span>{item.orders}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full bg-gold"
                        style={{
                          width: `${width}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Order status breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.values(OrderStatus).map((status) => {
              const count =
                orderStatusGroups.find((item) => item.status === status)?._count
                  ._all ?? 0;
              const percentage = getPercentage(count, orders);

              return (
                <div key={status} className="rounded-2xl bg-neutral-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${getOrderStatusTone(
                        status
                      )}`}
                    >
                      {statusLabel(status)}
                    </span>
                    <b>{count}</b>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-black"
                      style={{
                        width: `${percentage}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.values(PaymentStatus).map((status) => {
              const count =
                paymentStatusGroups.find((item) => item.paymentStatus === status)
                  ?._count._all ?? 0;
              const percentage = getPercentage(count, orders);

              return (
                <div key={status} className="rounded-2xl bg-neutral-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${getPaymentStatusTone(
                        status
                      )}`}
                    >
                      {statusLabel(status)}
                    </span>
                    <b>{count}</b>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{
                        width: `${percentage}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Menu stock health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <MiniMetric
                label="Available menu items"
                value={availableStockItems}
                tone="green"
              />
              <MiniMetric
                label="Sold out items"
                value={soldOutStockItems}
                tone="red"
              />
              <MiniMetric
                label="Hidden menu items"
                value={hiddenMenuItems}
              />
              <MiniMetric
                label="Total available quantity"
                value={totalAvailableQty}
              />
              <MiniMetric
                label="Total sold quantity"
                value={totalSoldQty}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Popular menu items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {popularItems.map((item, index) => {
              const qty = item._sum.quantity ?? 0;
              const width = Math.max((qty / maxPopularQty) * 100, 4);

              return (
                <div
                  key={item.productNameSnapshot}
                  className="rounded-2xl bg-neutral-50 p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black">{item.productNameSnapshot}</p>
                      <p className="text-xs text-neutral-400">Rank #{index + 1}</p>
                    </div>
                    <b>{qty}</b>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-black"
                      style={{
                        width: `${width}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {!popularItems.length ? (
              <EmptyState text="No product sales yet." />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service request analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-6xl font-black">{requests}</p>
            <p className="mt-1 text-sm text-neutral-500">
              Total guest service interactions
            </p>

            <div className="mt-5 space-y-3">
              {serviceTypeGroups.map((item) => {
                const count = item._count._all;
                const width = Math.max((count / maxServiceQty) * 100, 4);

                return (
                  <div key={item.type}>
                    <div className="mb-1 flex justify-between text-sm font-bold">
                      <span>{item.type}</span>
                      <span>{count}</span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full bg-gold"
                        style={{
                          width: `${width}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {serviceStatusGroups.length ? (
              <div className="mt-5 grid grid-cols-2 gap-2">
                {serviceStatusGroups.map((item) => (
                  <div
                    key={item.status}
                    className="rounded-2xl bg-neutral-50 p-3"
                  >
                    <p className="text-xs font-black uppercase text-neutral-400">
                      {statusLabel(item.status)}
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {item._count._all}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock usage from orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topStockUsage.map((item) => {
              const width = Math.max((item.quantity / maxStockUsage) * 100, 4);

              return (
                <div key={item.productName} className="rounded-2xl bg-neutral-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-black">{item.productName}</p>
                    <b>{item.quantity}</b>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-black"
                      style={{
                        width: `${width}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {!topStockUsage.length ? (
              <EmptyState text="No order stock deductions yet." />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Menu stock availability table</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-2xl border border-neutral-100">
              <div className="grid grid-cols-[1fr_100px_100px_100px] bg-neutral-50 px-4 py-3 text-xs font-black uppercase text-neutral-500">
                <span>Menu Item</span>
                <span className="text-right">Available</span>
                <span className="text-right">Sold</span>
                <span className="text-right">Status</span>
              </div>

              {menuStocks.map((stock) => {
                const available =
                  stock.product.isAvailable &&
                  stock.availableQty > 0 &&
                  !stock.isSoldOut;

                return (
                  <div
                    key={stock.id}
                    className="grid grid-cols-[1fr_100px_100px_100px] border-t border-neutral-100 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-black">{stock.product.name}</p>
                      <p className="text-xs text-neutral-400">
                        {stock.hotel.name}
                      </p>
                    </div>

                    <span className="text-right font-bold">
                      {stock.availableQty}
                    </span>

                    <span className="text-right font-bold">{stock.soldQty}</span>

                    <span className="text-right">
                      <span
                        className={
                          available
                            ? 'rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700'
                            : 'rounded-full bg-red-100 px-2 py-1 text-[10px] font-black text-red-700'
                        }
                      >
                        {available ? 'OK' : 'SOLD OUT'}
                      </span>
                    </span>
                  </div>
                );
              })}

              {!menuStocks.length ? (
                <div className="p-8 text-center">
                  <EmptyState text="No menu stock records yet." />
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent stock movements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentStockMovements.map((movement) => (
              <div
                key={movement.id}
                className="rounded-2xl bg-neutral-50 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <b>{statusLabel(movement.type)}</b>
                  <span className="text-xs font-black text-neutral-500">
                    Balance: {movement.balanceAfter}
                  </span>
                </div>

                <p className="mt-1 text-neutral-500">
                  {movement.hotel.name} · {movement.product.name}
                </p>

                <p className="mt-1 text-xs text-neutral-400">
                  Qty: {movement.quantity}
                  {movement.reason ? ` · ${movement.reason}` : ''}
                </p>
              </div>
            ))}

            {!recentStockMovements.length ? (
              <EmptyState text="No recent stock movements." />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'green' | 'red';
}) {
  return (
    <div
      className={
        tone === 'green'
          ? 'rounded-2xl bg-emerald-50 p-4'
          : tone === 'red'
            ? 'rounded-2xl bg-red-50 p-4'
            : 'rounded-2xl bg-neutral-50 p-4'
      }
    >
      <p
        className={
          tone === 'green'
            ? 'text-xs font-black uppercase text-emerald-700'
            : tone === 'red'
              ? 'text-xs font-black uppercase text-red-700'
              : 'text-xs font-black uppercase text-neutral-400'
        }
      >
        {label}
      </p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 p-5 text-center text-sm font-bold text-neutral-400">
      {text}
    </div>
  );
}