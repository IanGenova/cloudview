import Link from 'next/link';
import {
  DashboardModule,
  OrderStatus,
  ServiceRequestStatus,
} from '@prisma/client';
import { redirect } from 'next/navigation';
import { DashboardRangeSelect } from '@/components/dashboard/DashboardRangeSelect';
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  ChevronDown,
  CreditCard,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { money } from '@/lib/money';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import {
  getFirstVisibleDashboardHref,
  getUserDashboardPermissions,
  hasDashboardPermission,
} from '@/lib/dashboard-permissions';

type OperationRangeKey =
  | 'today'
  | 'yesterday'
  | 'last-7-days'
  | 'this-month'
  | 'last-month';

type AnalyticsRangeKey =
  | 'current-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'last-12-months'
  | 'last-year';

type ChartPoint = {
  key: string;
  label: string;
  value: number;
};

type AnalyticsBucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
  salesCents: number;
  orders: number;
};

type ServiceBreakdownItem = {
  label: string;
  value: number;
  percent: number;
};

type DateRange = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + months);
  return value;
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function startOfWeek(date: Date) {
  const value = startOfDay(date);
  const day = value.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  value.setDate(value.getDate() + mondayOffset);

  return value;
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthLabel(date: Date) {
  return date.toLocaleString('en-US', {
    month: 'short',
  });
}

function minDate(first: Date, second: Date) {
  return first.getTime() <= second.getTime() ? first : second;
}

function getDailyAnalyticsBuckets(start: Date, end: Date): AnalyticsBucket[] {
  const buckets: AnalyticsBucket[] = [];
  const cursor = startOfDay(start);

  while (cursor < end) {
    const bucketStart = new Date(cursor);
    const bucketEnd = minDate(addDays(bucketStart, 1), end);

    buckets.push({
      key: formatDateKey(bucketStart),
      label: formatDayLabel(bucketStart),
      start: bucketStart,
      end: bucketEnd,
      salesCents: 0,
      orders: 0,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
}

function getWeeklyAnalyticsBuckets(start: Date, end: Date): AnalyticsBucket[] {
  const buckets: AnalyticsBucket[] = [];
  let cursor = startOfDay(start);
  let weekNumber = 1;

  while (cursor < end) {
    const bucketStart = new Date(cursor);
    const bucketEnd = minDate(addDays(bucketStart, 7), end);

    buckets.push({
      key: `${formatDateKey(bucketStart)}-${formatDateKey(bucketEnd)}`,
      label: `Week ${weekNumber}`,
      start: bucketStart,
      end: bucketEnd,
      salesCents: 0,
      orders: 0,
    });

    cursor = new Date(bucketEnd);
    weekNumber += 1;
  }

  return buckets;
}

function getMonthlyAnalyticsBuckets(start: Date, end: Date): AnalyticsBucket[] {
  const buckets: AnalyticsBucket[] = [];
  let cursor = startOfMonth(start);

  while (cursor < end) {
    const bucketStart = new Date(cursor);
    const nextMonthStart = new Date(
      bucketStart.getFullYear(),
      bucketStart.getMonth() + 1,
      1
    );

    const bucketEnd = minDate(nextMonthStart, end);

    buckets.push({
      key: `${bucketStart.getFullYear()}-${bucketStart.getMonth() + 1}`,
      label: formatMonthLabel(bucketStart),
      start: bucketStart,
      end: bucketEnd,
      salesCents: 0,
      orders: 0,
    });

    cursor = nextMonthStart;
  }

  return buckets;
}

function getAnalyticsBuckets(
  rangeKey: AnalyticsRangeKey,
  start: Date,
  end: Date
): AnalyticsBucket[] {
  if (rangeKey === 'current-week' || rangeKey === 'last-week') {
    return getDailyAnalyticsBuckets(start, end);
  }

  if (rangeKey === 'this-month' || rangeKey === 'last-month') {
    return getWeeklyAnalyticsBuckets(start, end);
  }

  return getMonthlyAnalyticsBuckets(start, end);
}

function normalizeOperationRange(value?: string): OperationRangeKey {
  if (
    value === 'today' ||
    value === 'yesterday' ||
    value === 'last-7-days' ||
    value === 'this-month' ||
    value === 'last-month'
  ) {
    return value;
  }

  return 'today';
}


function normalizeAnalyticsRange(value?: string): AnalyticsRangeKey {
  if (value === 'this-week') {
    return 'current-week';
  }

  if (
    value === 'current-week' ||
    value === 'last-week' ||
    value === 'this-month' ||
    value === 'last-month' ||
    value === 'last-3-months' ||
    value === 'last-6-months' ||
    value === 'last-12-months' ||
    value === 'last-year'
  ) {
    return value;
  }

  return 'current-week';
}

function getOperationRange(key: OperationRangeKey): DateRange {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const currentMonthStart = startOfMonth(today);

  if (key === 'yesterday') {
    const yesterday = addDays(today, -1);

    return {
      key,
      label: 'Yesterday',
      start: yesterday,
      end: today,
    };
  }

  if (key === 'last-7-days') {
    return {
      key,
      label: 'Last 7 Days',
      start: addDays(today, -6),
      end: tomorrow,
    };
  }

  if (key === 'this-month') {
    return {
      key,
      label: 'This Month',
      start: currentMonthStart,
      end: tomorrow,
    };
  }

  if (key === 'last-month') {
    const lastMonthStart = addMonths(currentMonthStart, -1);

    return {
      key,
      label: 'Last Month',
      start: lastMonthStart,
      end: currentMonthStart,
    };
  }

  return {
    key,
    label: 'Today',
    start: today,
    end: tomorrow,
  };
}

function getAnalyticsRange(key: AnalyticsRangeKey): DateRange {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const currentWeekStart = startOfWeek(today);
  const currentMonthStart = startOfMonth(today);
  const currentYearStart = startOfYear(today);

  if (key === 'last-week') {
    const lastWeekStart = addDays(currentWeekStart, -7);

    return {
      key,
      label: 'Last Week',
      start: lastWeekStart,
      end: currentWeekStart,
    };
  }

  if (key === 'this-month') {
    return {
      key,
      label: 'This Month',
      start: currentMonthStart,
      end: tomorrow,
    };
  }

  if (key === 'last-month') {
    const lastMonthStart = addMonths(currentMonthStart, -1);

    return {
      key,
      label: 'Last Month',
      start: lastMonthStart,
      end: currentMonthStart,
    };
  }

  if (key === 'last-3-months') {
    return {
      key,
      label: 'Last Three Months',
      start: addMonths(currentMonthStart, -2),
      end: tomorrow,
    };
  }

  if (key === 'last-6-months') {
    return {
      key,
      label: 'Last Six Months',
      start: addMonths(currentMonthStart, -5),
      end: tomorrow,
    };
  }

  if (key === 'last-12-months') {
    return {
      key,
      label: 'Last Twelve Months',
      start: addMonths(currentMonthStart, -11),
      end: tomorrow,
    };
  }

  if (key === 'last-year') {
    const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);

    return {
      key,
      label: `Last Year (${today.getFullYear() - 1})`,
      start: lastYearStart,
      end: currentYearStart,
    };
  }

  return {
    key,
    label: 'Current Week',
    start: currentWeekStart,
    end: tomorrow,
  };
}
function formatDayLabel(date: Date) {
  return dayLabels[date.getDay()];
}

function getDateBuckets(start: Date, end: Date) {
  const buckets: {
    date: Date;
    label: string;
    salesCents: number;
    orders: number;
  }[] = [];

  const cursor = startOfDay(start);

  while (cursor < end) {
    buckets.push({
      date: new Date(cursor),
      label: formatDayLabel(cursor),
      salesCents: 0,
      orders: 0,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
}

function buildOrderAnalytics(
  orders: {
    createdAt: Date;
    totalCents: number;
    status: OrderStatus;
  }[],
  rangeKey: AnalyticsRangeKey,
  start: Date,
  end: Date
) {
  const buckets = getAnalyticsBuckets(rangeKey, start, end);

  for (const order of orders) {
    const bucket = buckets.find(
      (item) => order.createdAt >= item.start && order.createdAt < item.end
    );

    if (!bucket) continue;

    bucket.orders += 1;

    if (order.status !== OrderStatus.CANCELLED) {
      bucket.salesCents += order.totalCents;
    }
  }

  return {
    sales: buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      value: bucket.salesCents,
    })),
    orderVolume: buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      value: bucket.orders,
    })),
    totalSalesCents: buckets.reduce(
      (sum, bucket) => sum + bucket.salesCents,
      0
    ),
    totalOrders: buckets.reduce((sum, bucket) => sum + bucket.orders, 0),
  };
}

function getPercent(value: number, total: number) {
  if (!total) return 0;

  return Math.round((value / total) * 100);
}

function buildServiceRequestBreakdown(
  requests: {
    status: ServiceRequestStatus;
  }[]
): ServiceBreakdownItem[] {
  const total = requests.length;

  const completed = requests.filter(
    (request) => request.status === ServiceRequestStatus.COMPLETED
  ).length;

  const pending = requests.filter(
    (request) =>
      request.status === ServiceRequestStatus.NEW ||
      request.status === ServiceRequestStatus.IN_PROGRESS
  ).length;

  const cancelled = requests.filter(
    (request) => request.status === ServiceRequestStatus.CANCELLED
  ).length;

  return [
    {
      label: 'Completed',
      value: completed,
      percent: getPercent(completed, total),
    },
    {
      label: 'Pending',
      value: pending,
      percent: getPercent(pending, total),
    },
    {
      label: 'Cancelled',
      value: cancelled,
      percent: getPercent(cancelled, total),
    },
  ];
}

function getMaxValue(points: ChartPoint[]) {
  return Math.max(...points.map((point) => point.value), 1);
}

function buildDashboardHref({
  range,
  analytics,
}: {
  range: OperationRangeKey;
  analytics: AnalyticsRangeKey;
}) {
  return `/dashboard?range=${range}&analytics=${analytics}`;
}

function FilterDropdown({
  label,
  options,
}: {
  label: string;
  options: {
    label: string;
    href: string;
    active: boolean;
  }[];
}) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-black text-neutral-700 shadow-sm transition hover:border-[#c99c38]/50 hover:bg-[#fffaf0] [&::-webkit-details-marker]:hidden">
        <CalendarDays className="size-4 text-[#c99c38]" />
        {label}
        <ChevronDown className="size-4 text-neutral-400 transition group-open:rotate-180" />
      </summary>

      <div className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-2xl border border-neutral-200 bg-white p-1 shadow-2xl">
        {options.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            className={
              option.active
                ? 'block rounded-xl bg-[#11100b] px-3 py-2 text-sm font-black text-white'
                : 'block rounded-xl px-3 py-2 text-sm font-bold text-neutral-600 hover:bg-[#f7f1e5] hover:text-[#11100b]'
            }
          >
            {option.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

function MiniLineChart({ points }: { points: ChartPoint[] }) {
  const maxValue = getMaxValue(points);

  return (
    <div className="mt-5">
      <div className="flex h-32 items-end gap-2">
        {points.map((point) => {
          const height = Math.max((point.value / maxValue) * 100, 6);

          return (
            <div
                key={point.key}
                className="flex flex-1 flex-col items-center"
              >
              <div className="flex h-24 w-full items-end">
                <div
                  className="w-full rounded-t-xl bg-gradient-to-t from-[#c99c38]/25 via-[#c99c38]/55 to-[#d6a738] shadow-[0_10px_22px_rgba(201,156,56,0.18)]"
                  style={{ height: `${height}%` }}
                />
              </div>

              <span className="mt-2 text-[10px] font-bold text-neutral-500">
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniBarChart({ points }: { points: ChartPoint[] }) {
  const maxValue = getMaxValue(points);

  return (
    <div className="mt-5">
      <div className="flex h-32 items-end gap-3">
        {points.map((point) => {
          const height = Math.max((point.value / maxValue) * 100, 8);

          return (
            <div
                key={point.key}
                className="flex flex-1 flex-col items-center"
              >
              <div className="flex h-24 w-full items-end">
                <div
                  className="mx-auto w-6 rounded-t-xl bg-gradient-to-t from-[#9d741f] via-[#c99c38] to-[#f1c66a] shadow-[0_10px_22px_rgba(201,156,56,0.18)]"
                  style={{ height: `${height}%` }}
                />
              </div>

              <span className="mt-2 text-[10px] font-bold text-neutral-500">
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DonutChart({ items }: { items: ServiceBreakdownItem[] }) {
  const completed =
    items.find((item) => item.label === 'Completed')?.percent ?? 0;
  const pending = items.find((item) => item.label === 'Pending')?.percent ?? 0;
  const cancelled =
    items.find((item) => item.label === 'Cancelled')?.percent ?? 0;

  const completedEnd = completed;
  const pendingEnd = completed + pending;
  const cancelledEnd = completed + pending + cancelled;

  return (
    <div className="mt-5 flex items-center gap-5">
      <div
        className="grid size-28 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(#c99c38 0% ${completedEnd}%, #11100b ${completedEnd}% ${pendingEnd}%, #d6d3cc ${pendingEnd}% ${cancelledEnd}%, #f4f4f5 ${cancelledEnd}% 100%)`,
        }}
      >
        <div className="grid size-16 place-items-center rounded-full bg-white">
          <span className="text-lg font-black">
            {items.reduce((sum, item) => sum + item.value, 0)}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <div className="flex items-center gap-2">
              <span
                className={
                  item.label === 'Completed'
                    ? 'size-2.5 rounded-full bg-[#c99c38]'
                    : item.label === 'Pending'
                      ? 'size-2.5 rounded-full bg-[#11100b]'
                      : 'size-2.5 rounded-full bg-neutral-300'
                }
              />

              <span className="font-bold text-neutral-600">{item.label}</span>
            </div>

            <span className="font-black">
              {item.value} ({item.percent}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LuxuryStatCard({
  label,
  value,
  caption,
  icon: Icon,
  dark = false,
}: {
  label: string;
  value: string | number;
  caption?: string;
  icon: LucideIcon;
  dark?: boolean;
}) {
  return (
    <div
      className={
        dark
          ? 'rounded-[1.75rem] border border-[#c99c38]/30 bg-[#11100b] p-5 text-white shadow-[0_18px_45px_rgba(0,0,0,0.18)]'
          : 'rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]'
      }
    >
      <div className="flex items-center gap-4">
        <span
          className={
            dark
              ? 'grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-[#f1c66a] via-[#c99c38] to-[#8f6820] text-[#090806]'
              : 'grid size-14 place-items-center rounded-2xl bg-[#f7f1e5] text-[#c99c38]'
          }
        >
          <Icon className="size-6" />
        </span>

        <div>
          <p
            className={
              dark
                ? 'text-sm font-bold text-white/70'
                : 'text-sm font-bold text-neutral-500'
            }
          >
            {label}
          </p>

          <p className="mt-1 text-3xl font-black">{value}</p>

          {caption ? (
            <p
              className={
                dark
                  ? 'mt-1 text-xs font-bold text-[#f1c66a]'
                  : 'mt-1 text-xs font-bold text-neutral-500'
              }
            >
              {caption}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default async function DashboardHome({
  searchParams,
}: {
  searchParams?: Promise<{
    range?: string;
    analytics?: string;
  }>;
}) {
  const params = await searchParams;

  const operationRangeKey = normalizeOperationRange(params?.range);
  const analyticsRangeKey = normalizeAnalyticsRange(params?.analytics);

  const operationRange = getOperationRange(operationRangeKey);
  const analyticsRange = getAnalyticsRange(analyticsRangeKey);

  const user = await requireUser();

  const permissions = await getUserDashboardPermissions(user.id, user.role);
  const canViewOverview = hasDashboardPermission(
    permissions,
    DashboardModule.OVERVIEW,
    'canView'
  );

  if (!canViewOverview) {
    const firstAllowedHref = await getFirstVisibleDashboardHref(
      user.id,
      user.role
    );

    redirect(firstAllowedHref ?? '/login');
  }

  const hotelWhere =
    user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const operationCreatedAt = {
    gte: operationRange.start,
    lt: operationRange.end,
  };

  const analyticsCreatedAt = {
    gte: analyticsRange.start,
    lt: analyticsRange.end,
  };

  const [
    ordersInRange,
    pendingRequests,
    salesAgg,
    menuInventoryCount,
    serviceInventoryCount,
    menuInventory,
    serviceInventory,
    recentOrders,
    popular,
    analyticsOrders,
    analyticsRequests,
  ] = await Promise.all([
    db.order.count({
      where: {
        ...hotelWhere,
        createdAt: operationCreatedAt,
      },
    }),

    db.serviceRequest.count({
      where: {
        ...hotelWhere,
        createdAt: operationCreatedAt,
        status: {
          in: [ServiceRequestStatus.NEW, ServiceRequestStatus.IN_PROGRESS],
        },
      },
    }),

    db.order.aggregate({
      where: {
        ...hotelWhere,
        status: {
          not: OrderStatus.CANCELLED,
        },
        createdAt: operationCreatedAt,
      },
      _sum: {
        totalCents: true,
      },
    }),

    db.menuAvailabilityStock.count({
      where: {
        ...hotelWhere,
      },
    }),

    db.serviceAvailabilityStock.count({
      where: {
        ...hotelWhere,
      },
    }),

    db.menuAvailabilityStock.findMany({
      where: {
        ...hotelWhere,
      },
      include: {
        product: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        {
          isSoldOut: 'desc',
        },
        {
          availableQty: 'asc',
        },
      ],
      take: 6,
    }),

    db.serviceAvailabilityStock.findMany({
      where: {
        ...hotelWhere,
      },
      include: {
        service: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        {
          isSoldOut: 'desc',
        },
        {
          availableQty: 'asc',
        },
      ],
      take: 6,
    }),

    db.order.findMany({
      where: {
        ...hotelWhere,
        createdAt: operationCreatedAt,
      },
      include: {
        room: true,
        location: true,
        hotel: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    }),

    db.orderItem.groupBy({
      by: ['productNameSnapshot'],
      _sum: {
        quantity: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: 5,
    }),

    db.order.findMany({
      where: {
        ...hotelWhere,
        createdAt: analyticsCreatedAt,
      },
      select: {
        createdAt: true,
        totalCents: true,
        status: true,
      },
    }),

    db.serviceRequest.findMany({
      where: {
        ...hotelWhere,
        createdAt: analyticsCreatedAt,
      },
      select: {
        status: true,
      },
    }),
  ]);

  const menuInventoryAlerts = menuInventory.filter(
    (item) => item.isSoldOut || Number(item.availableQty) <= 5
  );

  const serviceInventoryAlerts = serviceInventory.filter(
    (item) => item.isSoldOut || Number(item.availableQty) <= 5
  );

  const totalInventoryAlerts =
    menuInventoryAlerts.length + serviceInventoryAlerts.length;

 const analytics = buildOrderAnalytics(
  analyticsOrders,
  analyticsRangeKey,
  analyticsRange.start,
  analyticsRange.end
);

  const serviceBreakdown = buildServiceRequestBreakdown(analyticsRequests);

const operationOptions = [
  {
    label: 'Today',
    value: 'today',
  },
  {
    label: 'Yesterday',
    value: 'yesterday',
  },
  {
    label: 'Last 7 Days',
    value: 'last-7-days',
  },
  {
    label: 'This Month',
    value: 'this-month',
  },
  {
    label: 'Last Month',
    value: 'last-month',
  },
];

const analyticsOptions = [
  {
    label: 'Current Week',
    value: 'current-week',
  },
  {
    label: 'Last Week',
    value: 'last-week',
  },
  {
    label: 'This Month',
    value: 'this-month',
  },
  {
    label: 'Last Month',
    value: 'last-month',
  },
  {
    label: 'Last Three Months',
    value: 'last-3-months',
  },
  {
    label: 'Last Six Months',
    value: 'last-6-months',
  },
  {
    label: 'Last Twelve Months',
    value: 'last-12-months',
  },
  {
    label: `Last Year (${new Date().getFullYear() - 1})`,
    value: 'last-year',
  },
];

  return (
    <div className="space-y-7">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-[#11100b]">
              Overview
            </h1>

            <p className="mt-2 text-base font-medium text-neutral-500">
              Hotel operations summary for {operationRange.label.toLowerCase()}.
            </p>
          </div>

          <DashboardRangeSelect
                paramName="range"
                value={operationRangeKey}
                options={operationOptions}
              />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LuxuryStatCard
          label={`${operationRange.label} orders`}
          value={ordersInRange}
          caption="Orders created in selected period"
          icon={ShoppingBag}
        />

        <LuxuryStatCard
          label="Pending requests"
          value={pendingRequests}
          caption="New and in-progress requests"
          icon={ClipboardList}
        />

        <LuxuryStatCard
          label={`${operationRange.label} sales`}
          value={money(salesAgg._sum.totalCents ?? 0)}
          caption="Excludes cancelled orders"
          icon={CreditCard}
          dark
        />

        <LuxuryStatCard
          label="Inventory alerts"
          value={totalInventoryAlerts}
          caption={`${menuInventoryCount} menu · ${serviceInventoryCount} service tracked`}
          icon={Boxes}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[2rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
            <h2 className="text-xl font-black">Recent Orders</h2>

            <Link
              href="/dashboard/orders"
              className="rounded-2xl border border-neutral-200 px-4 py-2 text-xs font-black hover:bg-neutral-50"
            >
              View all orders
            </Link>
          </div>

          <div className="space-y-3 p-6">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-100 bg-neutral-50/80 p-4"
              >
                <div className="min-w-0">
                  <p className="font-black">{order.orderCode}</p>

                  <p className="mt-1 truncate text-sm text-neutral-500">
                    {order.hotel.name} ·{' '}
                    {order.room?.number ||
                      order.location?.name ||
                      'Guest location'}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <StatusBadge status={order.status} />

                  <p className="mt-1 text-sm font-black">
                    {money(order.totalCents)}
                  </p>
                </div>
              </div>
            ))}

            {!recentOrders.length ? (
              <div className="rounded-2xl border border-dashed border-neutral-200 p-6 text-center">
                <p className="font-black">No orders in this period.</p>

                <p className="mt-1 text-sm text-neutral-500">
                  Guest and POS orders will appear here.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[2rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
            <h2 className="text-xl font-black">
              Popular Products & Inventory Watch
            </h2>

            <Link
              href="/dashboard/inventory"
              className="rounded-2xl border border-neutral-200 px-4 py-2 text-xs font-black hover:bg-neutral-50"
            >
              View inventory
            </Link>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="font-black">Popular products</h3>

              {popular.map((item) => (
                <div
                  key={item.productNameSnapshot ?? 'Unknown product'}
                  className="flex items-center justify-between rounded-2xl border border-neutral-100 bg-neutral-50/80 p-3 text-sm"
                >
                  <span className="font-bold">
                    {item.productNameSnapshot ?? 'Unknown product'}
                  </span>

                  <span className="rounded-full bg-[#f7f1e5] px-3 py-1 text-xs font-black text-[#9d741f]">
                    {item._sum.quantity ?? 0} sold
                  </span>
                </div>
              ))}

              {!popular.length ? (
                <p className="rounded-2xl border border-dashed border-neutral-200 p-4 text-sm font-bold text-neutral-500">
                  No product sales yet.
                </p>
              ) : null}
            </div>

            <div className="space-y-3">
              <h3 className="font-black">Inventory watch</h3>

              {menuInventoryAlerts.slice(0, 3).map((item) => (
                <div
                  key={`menu-${item.id}`}
                  className="flex items-center justify-between rounded-2xl border border-red-100 bg-red-50/60 p-3 text-sm"
                >
                  <span className="font-bold">
                    {item.product?.name ?? 'Menu item'}
                  </span>

                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-red-600">
                    {String(item.availableQty)} left
                  </span>
                </div>
              ))}

              {serviceInventoryAlerts.slice(0, 3).map((item) => (
                <div
                  key={`service-${item.id}`}
                  className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50/70 p-3 text-sm"
                >
                  <span className="font-bold">
                    {item.service?.name ?? 'Service item'}
                  </span>

                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-orange-700">
                    {String(item.availableQty)} left
                  </span>
                </div>
              ))}

              {!menuInventoryAlerts.length && !serviceInventoryAlerts.length ? (
                <p className="rounded-2xl border border-dashed border-neutral-200 p-4 text-sm font-bold text-neutral-500">
                  No low inventory alerts.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Analytics</h2>

            <p className="mt-1 text-sm font-medium text-neutral-500">
              Sales, order volume, and service request movement for{' '}
              {analyticsRange.label.toLowerCase()}.
            </p>
          </div>

          <DashboardRangeSelect
              paramName="analytics"
              value={analyticsRangeKey}
              options={analyticsOptions}
            />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black">Sales Trend</p>

                <p className="mt-1 text-2xl font-black">
                  {money(analytics.totalSalesCents)}
                </p>
              </div>

              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                <TrendingUp className="size-3" />
                {analyticsRange.label}
              </span>
            </div>

            <MiniLineChart points={analytics.sales} />
          </div>

          <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black">Order Volume</p>

                <p className="mt-1 text-2xl font-black">
                  {analytics.totalOrders}
                </p>
              </div>

              <span className="inline-flex items-center gap-1 rounded-full bg-[#f7f1e5] px-3 py-1 text-xs font-black text-[#9d741f]">
                <TrendingUp className="size-3" />
                Orders
              </span>
            </div>

            <MiniBarChart points={analytics.orderVolume} />
          </div>

          <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black">Service Requests</p>

                <p className="mt-1 text-2xl font-black">
                  {analyticsRequests.length}
                </p>
              </div>

              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
                <TrendingDown className="size-3" />
                Status
              </span>
            </div>

            <DonutChart items={serviceBreakdown} />
          </div>
        </div>
      </section>
    </div>
  );
}