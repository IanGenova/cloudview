import type { ReactNode } from 'react';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import {
  BarChart3,
  CircleDollarSign,
  ClipboardList,
  ConciergeBell,
  CreditCard,
  PackageCheck,
  PieChart,
  Sparkles,
  TrendingUp,
  Utensils,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/money';

export const dynamic = 'force-dynamic';

function formatMoneyFromCents(cents: number) {
  return money(cents);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-PH').format(value);
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

function getOrderStatusColor(status: OrderStatus) {
  switch (status) {
    case OrderStatus.DELIVERED:
      return '#10b981';
    case OrderStatus.CANCELLED:
      return '#ef4444';
    case OrderStatus.PREPARING:
      return '#f59e0b';
    case OrderStatus.READY:
      return '#22c55e';
    case OrderStatus.ACCEPTED:
      return '#3b82f6';
    case OrderStatus.PENDING:
      return '#71717a';
    default:
      return '#a3a3a3';
  }
}

function getPaymentStatusColor(status: PaymentStatus) {
  switch (status) {
    case PaymentStatus.PAID:
      return '#10b981';
    case PaymentStatus.REFUNDED:
      return '#737373';
    case PaymentStatus.UNPAID:
      return '#f59e0b';
    default:
      return '#eab308';
  }
}

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

function AnalyticsCard({
  title,
  description,
  children,
  className = '',
  right,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-soft ${className}`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-neutral-100 bg-neutral-50/70 px-5 py-4">
        <div>
          <h2 className="text-lg font-black text-neutral-950">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm font-semibold leading-6 text-neutral-500">
              {description}
            </p>
          ) : null}
        </div>

        {right}
      </div>

      <div className="p-5">{children}</div>
    </section>
  );
}

function HeroMetric({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">
          {label}
        </p>

        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gold text-black">
          {icon}
        </span>
      </div>

      <p className="mt-4 text-2xl font-black tracking-tight text-white">
        {value}
      </p>

      {helper ? (
        <p className="mt-1 text-xs font-semibold text-white/55">{helper}</p>
      ) : null}
    </div>
  );
}

function DonutChart({
  segments,
  total,
  centerLabel,
  centerValue,
}: {
  segments: DonutSegment[];
  total: number;
  centerLabel: string;
  centerValue: string | number;
}) {
  let offset = 0;

  const visibleSegments = segments.filter((segment) => segment.value > 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
      <div className="relative mx-auto size-56">
        <svg viewBox="0 0 44 44" className="size-full -rotate-90">
          <circle
            cx="22"
            cy="22"
            r="15.9155"
            fill="transparent"
            stroke="#f4f4f5"
            strokeWidth="7"
          />

          {visibleSegments.map((segment) => {
            const percentage = total ? (segment.value / total) * 100 : 0;
            const currentOffset = offset;

            offset += percentage;

            return (
              <circle
                key={segment.label}
                cx="22"
                cy="22"
                r="15.9155"
                fill="transparent"
                stroke={segment.color}
                strokeWidth="7"
                strokeDasharray={`${percentage} ${100 - percentage}`}
                strokeDashoffset={-currentOffset}
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-3xl font-black text-neutral-950">
              {centerValue}
            </p>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-neutral-400">
              {centerLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {segments.map((segment) => {
          const percentage = getPercentage(segment.value, total);

          return (
            <div
              key={segment.label}
              className="rounded-2xl bg-neutral-50 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />

                  <p className="truncate text-sm font-black">
                    {segment.label}
                  </p>
                </div>

                <p className="shrink-0 text-sm font-black">
                  {segment.value} · {percentage}%
                </p>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: segment.color,
                  }}
                />
              </div>
            </div>
          );
        })}

        {!segments.some((segment) => segment.value > 0) ? (
          <EmptyState text="No chart data yet." />
        ) : null}
      </div>
    </div>
  );
}

function SalesAreaChart({
  data,
}: {
  data: {
    label: string;
    salesCents: number;
    orders: number;
  }[];
}) {
  const width = 720;
  const height = 260;
  const padding = 28;
  const maxSales = getMaxValue(data.map((item) => item.salesCents));
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = data.map((item, index) => {
    const x =
      data.length === 1
        ? width / 2
        : padding + (index / (data.length - 1)) * innerWidth;

    const y =
      height -
      padding -
      (item.salesCents / maxSales) * innerHeight;

    return {
      x,
      y,
      ...item,
    };
  });

  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');

  const areaPoints = points.length
    ? `${points[0].x},${height - padding} ${linePoints} ${
        points[points.length - 1].x
      },${height - padding}`
    : '';

  return (
    <div>
      <div className="overflow-hidden rounded-[2rem] bg-neutral-950 p-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-72 w-full"
          role="img"
          aria-label="Sales trend area chart"
        >
          <defs>
            <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#d6a729" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#d6a729" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={padding}
              x2={width - padding}
              y1={padding + innerHeight * ratio}
              y2={padding + innerHeight * ratio}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          ))}

          {areaPoints ? (
            <polygon points={areaPoints} fill="url(#salesGradient)" />
          ) : null}

          {linePoints ? (
            <polyline
              points={linePoints}
              fill="none"
              stroke="#d6a729"
              strokeWidth="4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {points.map((point) => (
            <g key={point.label}>
              <circle
                cx={point.x}
                cy={point.y}
                r="5"
                fill="#ffffff"
                stroke="#d6a729"
                strokeWidth="3"
              />

              <title>
                {point.label}: {formatMoneyFromCents(point.salesCents)}
              </title>
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-2 text-center text-[10px] font-black text-neutral-400 md:grid-cols-14">
        {data.map((item) => (
          <span key={item.label} className="truncate">
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({
  items,
  maxValue,
  emptyText,
  valueSuffix = '',
}: {
  items: {
    label: string;
    value: number;
    helper?: string;
  }[];
  maxValue: number;
  emptyText: string;
  valueSuffix?: string;
}) {
  if (!items.length) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const width = Math.max((item.value / maxValue) * 100, 4);

        return (
          <div key={`${item.label}-${index}`} className="rounded-2xl bg-neutral-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{item.label}</p>
                {item.helper ? (
                  <p className="mt-1 text-xs font-semibold text-neutral-400">
                    {item.helper}
                  </p>
                ) : null}
              </div>

              <b className="shrink-0 text-sm">
                {formatNumber(item.value)}
                {valueSuffix}
              </b>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-white">
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
  tone?: 'green' | 'red' | 'amber';
}) {
  return (
    <div
      className={
        tone === 'green'
          ? 'rounded-2xl bg-emerald-50 p-4'
          : tone === 'red'
            ? 'rounded-2xl bg-red-50 p-4'
            : tone === 'amber'
              ? 'rounded-2xl bg-amber-50 p-4'
              : 'rounded-2xl bg-neutral-50 p-4'
      }
    >
      <p
        className={
          tone === 'green'
            ? 'text-xs font-black uppercase text-emerald-700'
            : tone === 'red'
              ? 'text-xs font-black uppercase text-red-700'
              : tone === 'amber'
                ? 'text-xs font-black uppercase text-amber-700'
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

  const movementProductIds = stockMovementUsage
    .map((item) => item.productId)
    .filter(Boolean) as string[];

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

  const paidOrders =
    paymentStatusGroups.find((item) => item.paymentStatus === PaymentStatus.PAID)
      ?._count._all ?? 0;

  const paidRate = getPercentage(paidOrders, orders);

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

  const totalTrendSalesCents = salesTrend.reduce(
    (sum, item) => sum + item.salesCents,
    0
  );

  const trendOrderCount = salesTrend.reduce((sum, item) => sum + item.orders, 0);

  const orderStatusSegments = Object.values(OrderStatus).map((status) => {
    const count =
      orderStatusGroups.find((item) => item.status === status)?._count._all ??
      0;

    return {
      label: statusLabel(status),
      value: count,
      color: getOrderStatusColor(status),
    };
  });

  const paymentStatusSegments = Object.values(PaymentStatus).map((status) => {
    const count =
      paymentStatusGroups.find((item) => item.paymentStatus === status)?._count
        ._all ?? 0;

    return {
      label: statusLabel(status),
      value: count,
      color: getPaymentStatusColor(status),
    };
  });

  const maxPopularQty = getMaxValue(
    popularItems.map((item) => item._sum.quantity ?? 0)
  );

  const popularMenuItems = popularItems.map((item, index) => ({
    label: item.productNameSnapshot,
    value: item._sum.quantity ?? 0,
    helper: `Rank #${index + 1}`,
  }));

  const maxServiceQty = getMaxValue(
    serviceTypeGroups.map((item) => item._count._all)
  );

  const serviceItems = serviceTypeGroups.map((item, index) => ({
    label: item.type,
    value: item._count._all,
    helper: `Service rank #${index + 1}`,
  }));

  const availableStockItems = menuStocks.filter(
    (stock) =>
      stock.product.isAvailable &&
      Number(stock.availableQty) > 0 &&
      !stock.isSoldOut
  ).length;

  const soldOutStockItems = menuStocks.filter(
    (stock) => stock.isSoldOut || Number(stock.availableQty) <= 0
  ).length;

  const hiddenMenuItems = menuStocks.filter(
    (stock) => !stock.product.isAvailable
  ).length;

  const totalAvailableQty = menuStocks.reduce(
    (sum, stock) => sum + Number(stock.availableQty),
    0
  );

  const totalSoldQty = menuStocks.reduce(
    (sum, stock) => sum + Number(stock.soldQty),
    0
  );

  const topStockUsage = stockMovementUsage.map((item) => ({
    productName: movementProductMap.get(item.productId)?.name ?? item.productId,
    quantity: Number(item._sum.quantity ?? 0),
  }));

  const maxStockUsage = getMaxValue(topStockUsage.map((item) => item.quantity));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Business Intelligence Center"
        description="A visual command dashboard for sales, orders, services, menu performance, and inventory movement."
      />

      <section className="relative overflow-hidden rounded-[2.5rem] bg-neutral-950 p-6 text-white shadow-2xl">
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-gold/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-12 size-72 rounded-full bg-emerald-500/20 blur-3xl" />

        <div className="relative z-10 grid gap-6 xl:grid-cols-[1.1fr_1.5fr] xl:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-gold">
              <Sparkles className="size-4" />
              CloudView Analytics
            </div>

            <h1 className="mt-5 max-w-2xl text-4xl font-black tracking-tight md:text-5xl">
              Real-time business pulse for hotel operations.
            </h1>

            <p className="mt-4 max-w-xl text-sm font-semibold leading-7 text-white/60">
              Monitor revenue, order movement, service demand, and stock health
              using visual dashboards built for fast decisions.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <HeroMetric
              label="Total Sales"
              value={formatMoneyFromCents(totalSalesCents)}
              helper="All recorded order value"
              icon={<CircleDollarSign className="size-5" />}
            />

            <HeroMetric
              label="Orders"
              value={formatNumber(orders)}
              helper={`${completionRate}% completion`}
              icon={<ClipboardList className="size-5" />}
            />

            <HeroMetric
              label="Avg. Order"
              value={formatMoneyFromCents(averageOrderValueCents)}
              helper="Average basket value"
              icon={<TrendingUp className="size-5" />}
            />

            <HeroMetric
              label="Requests"
              value={formatNumber(requests)}
              helper="Guest service activity"
              icon={<ConciergeBell className="size-5" />}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric
          label="Room Service Orders"
          value={formatNumber(roomOrders)}
          tone="green"
        />
        <MiniMetric
          label="Poolside Orders"
          value={formatNumber(poolOrders)}
          tone="amber"
        />
        <MiniMetric
          label="Paid Order Rate"
          value={`${paidRate}%`}
          tone="green"
        />
        <MiniMetric
          label="Cancellation Rate"
          value={`${cancellationRate}%`}
          tone={cancellationRate > 10 ? 'red' : undefined}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <AnalyticsCard
          title="Sales Performance Graph"
          description="Revenue movement over the last 14 days."
          right={
            <span className="inline-flex items-center gap-2 rounded-full bg-black px-3 py-1 text-xs font-black text-white">
              <BarChart3 className="size-4" />
              {formatMoneyFromCents(totalTrendSalesCents)}
            </span>
          }
        >
          <SalesAreaChart data={salesTrend} />

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MiniMetric
              label="14-Day Revenue"
              value={formatMoneyFromCents(totalTrendSalesCents)}
              tone="green"
            />
            <MiniMetric
              label="14-Day Orders"
              value={formatNumber(trendOrderCount)}
            />
            <MiniMetric
              label="Daily Avg."
              value={formatMoneyFromCents(
                Math.round(totalTrendSalesCents / Math.max(days.length, 1))
              )}
              tone="amber"
            />
          </div>
        </AnalyticsCard>

        <AnalyticsCard
          title="Order Status Pie Chart"
          description="Visual breakdown of all order statuses."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-gold/15 text-gold">
              <PieChart className="size-5" />
            </span>
          }
        >
          <DonutChart
            segments={orderStatusSegments}
            total={orders}
            centerLabel="Orders"
            centerValue={formatNumber(orders)}
          />
        </AnalyticsCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <AnalyticsCard
          title="Payment Status Pie Chart"
          description="Paid, unpaid, refunded, and payment movement."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
              <CreditCard className="size-5" />
            </span>
          }
        >
          <DonutChart
            segments={paymentStatusSegments}
            total={orders}
            centerLabel="Payments"
            centerValue={formatNumber(orders)}
          />
        </AnalyticsCard>

        <AnalyticsCard
          title="Menu Stock Health"
          description="Availability and stock condition summary."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-blue-100 text-blue-700">
              <PackageCheck className="size-5" />
            </span>
          }
        >
          <div className="grid gap-3">
            <MiniMetric
              label="Available Menu Items"
              value={formatNumber(availableStockItems)}
              tone="green"
            />
            <MiniMetric
              label="Sold Out Items"
              value={formatNumber(soldOutStockItems)}
              tone="red"
            />
            <MiniMetric
              label="Hidden Menu Items"
              value={formatNumber(hiddenMenuItems)}
            />
            <MiniMetric
              label="Available Quantity"
              value={formatNumber(totalAvailableQty)}
            />
            <MiniMetric
              label="Sold Quantity"
              value={formatNumber(totalSoldQty)}
              tone="amber"
            />
          </div>
        </AnalyticsCard>

        <AnalyticsCard
          title="Service Request Analytics"
          description="Guest service demand by service type."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-blue-100 text-blue-700">
              <ConciergeBell className="size-5" />
            </span>
          }
        >
          <div className="mb-5 rounded-[1.5rem] bg-neutral-950 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/50">
              Total Interactions
            </p>
            <p className="mt-2 text-5xl font-black">{formatNumber(requests)}</p>
          </div>

          <HorizontalBars
            items={serviceItems}
            maxValue={maxServiceQty}
            emptyText="No service request data yet."
          />

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
                    {formatNumber(item._count._all)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </AnalyticsCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <AnalyticsCard
          title="Popular Menu Items"
          description="Top-selling food items by quantity ordered."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-gold/15 text-gold">
              <Utensils className="size-5" />
            </span>
          }
        >
          <HorizontalBars
            items={popularMenuItems}
            maxValue={maxPopularQty}
            emptyText="No product sales yet."
          />
        </AnalyticsCard>

        <AnalyticsCard
          title="Stock Usage From Orders"
          description="Highest stock deductions from guest orders."
        >
          <HorizontalBars
            items={topStockUsage.map((item, index) => ({
              label: item.productName,
              value: item.quantity,
              helper: `Usage rank #${index + 1}`,
            }))}
            maxValue={maxStockUsage}
            emptyText="No order stock deductions yet."
          />
        </AnalyticsCard>

        <AnalyticsCard
          title="Operational Scoreboard"
          description="Quick order and service health indicators."
        >
          <div className="space-y-3">
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
                    <b>
                      {count} · {percentage}%
                    </b>
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
          </div>
        </AnalyticsCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <AnalyticsCard
          title="Menu Stock Availability Table"
          description="Live stock visibility for menu items."
        >
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
                Number(stock.availableQty) > 0 &&
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
                    {formatNumber(Number(stock.availableQty))}
                  </span>

                  <span className="text-right font-bold">
                    {formatNumber(Number(stock.soldQty))}
                  </span>

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
        </AnalyticsCard>

        <AnalyticsCard
          title="Recent Stock Movements"
          description="Latest inventory movement records."
        >
          <div className="space-y-3">
            {recentStockMovements.map((movement) => (
              <div
                key={movement.id}
                className="rounded-2xl bg-neutral-50 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <b>{statusLabel(movement.type)}</b>
                  <span className="text-xs font-black text-neutral-500">
                    Balance: {formatNumber(Number(movement.balanceAfter))}
                  </span>
                </div>

                <p className="mt-1 text-neutral-500">
                  {movement.hotel.name} · {movement.product.name}
                </p>

                <p className="mt-1 text-xs text-neutral-400">
                  Qty: {formatNumber(Number(movement.quantity))}
                  {movement.reason ? ` · ${movement.reason}` : ''}
                </p>
              </div>
            ))}

            {!recentStockMovements.length ? (
              <EmptyState text="No recent stock movements." />
            ) : null}
          </div>
        </AnalyticsCard>
      </div>
    </div>
  );
}