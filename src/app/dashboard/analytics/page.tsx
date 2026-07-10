import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  DashboardModule,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import {
  Activity,
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  ConciergeBell,
  CreditCard,
  Filter,
  Gauge,
  Hotel,
  Layers3,
  PackageCheck,
  PieChart,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Utensils,
  WalletCards,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import { money } from '@/lib/money';

export const dynamic = 'force-dynamic';

type AnalyticsSearchParams = {
  hotelId?: string;
  days?: string;
  stockPage?: string;
  stockPageSize?: string;
  stockQuery?: string;
  stockSort?: string;
  stockDir?: string;
  movementPage?: string;
};

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

type StockSortKey =
  | 'name'
  | 'hotel'
  | 'available'
  | 'sold'
  | 'status'
  | 'updated';

const RANGE_OPTIONS = [7, 14, 30, 90] as const;
const STOCK_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const MOVEMENT_PAGE_SIZE = 6;

const manilaDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const manilaHourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  hour: '2-digit',
  hourCycle: 'h23',
});

const shortDateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatMoneyFromCents(cents: number) {
  return money(cents);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-PH').format(value);
}

function formatDateTime(value: Date) {
  return dateTimeFormatter.format(value);
}

function getManilaDateKey(date: Date) {
  return manilaDateKeyFormatter.format(date);
}

function getLastNDays(days: number) {
  const result: {
    key: string;
    label: string;
    date: Date;
  }[] = [];

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const labelFormatter = new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    date.setHours(12, 0, 0, 0);

    result.push({
      key: getManilaDateKey(date),
      label: labelFormatter.format(date),
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

function getDeltaPercentage(current: number, previous: number) {
  if (previous <= 0) {
    return current > 0 ? 100 : 0;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function statusLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function clampPage(value: number, totalPages: number) {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.floor(value), Math.max(totalPages, 1));
}

function parseAllowedNumber<T extends readonly number[]>(
  value: string | undefined,
  allowed: T,
  fallback: T[number]
) {
  const parsed = Number(value);

  return allowed.includes(parsed as T[number])
    ? (parsed as T[number])
    : fallback;
}

function buildAnalyticsUrl(
  current: AnalyticsSearchParams,
  updates: Partial<Record<keyof AnalyticsSearchParams, string | number | null>>
) {
  const merged: Record<string, string> = {};

  for (const [key, value] of Object.entries(current)) {
    if (typeof value === 'string' && value.trim()) {
      merged[key] = value;
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '' || typeof value === 'undefined') {
      delete merged[key];
    } else {
      merged[key] = String(value);
    }
  }

  const query = new URLSearchParams(merged).toString();

  return query ? `/dashboard/analytics?${query}` : '/dashboard/analytics';
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

function getStockOrderBy(
  sort: StockSortKey,
  direction: 'asc' | 'desc'
): Prisma.MenuAvailabilityStockOrderByWithRelationInput[] {
  switch (sort) {
    case 'hotel':
      return [
        { hotel: { name: direction } },
        { product: { name: 'asc' } },
      ];

    case 'available':
      return [
        { availableQty: direction },
        { product: { name: 'asc' } },
      ];

    case 'sold':
      return [{ soldQty: direction }, { product: { name: 'asc' } }];

    case 'status':
      return [
        { isSoldOut: direction },
        { availableQty: direction === 'asc' ? 'desc' : 'asc' },
      ];

    case 'updated':
      return [{ updatedAt: direction }, { product: { name: 'asc' } }];

    case 'name':
    default:
      return [
        { product: { name: direction } },
        { hotel: { name: 'asc' } },
      ];
  }
}

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

function DeltaBadge({ value }: { value: number }) {
  const positive = value >= 0;

  return (
    <span
      className={
        positive
          ? 'inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-black text-emerald-300'
          : 'inline-flex items-center gap-1 rounded-full bg-red-400/15 px-2 py-1 text-[10px] font-black text-red-300'
      }
    >
      {positive ? (
        <ArrowUpRight className="size-3" />
      ) : (
        <ArrowDownRight className="size-3" />
      )}

      {Math.abs(value)}%
    </span>
  );
}

function HeroMetric({
  label,
  value,
  helper,
  icon,
  delta,
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon: ReactNode;
  delta?: number;
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

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <p className="text-2xl font-black tracking-tight text-white">{value}</p>
        {typeof delta === 'number' ? <DeltaBadge value={delta} /> : null}
      </div>

      {helper ? (
        <p className="mt-1 text-xs font-semibold text-white/55">{helper}</p>
      ) : null}
    </div>
  );
}

function InsightMetric({
  label,
  value,
  helper,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  tone: 'green' | 'amber' | 'red' | 'blue' | 'neutral';
  icon: ReactNode;
}) {
  const styles = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    neutral: 'border-neutral-200 bg-white text-neutral-700',
  }[tone];

  return (
    <div className={`rounded-[1.5rem] border p-4 ${styles}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] opacity-75">
          {label}
        </p>
        <span className="grid size-9 place-items-center rounded-xl bg-white/70">
          {icon}
        </span>
      </div>

      <p className="mt-3 text-2xl font-black text-neutral-950">{value}</p>
      <p className="mt-1 text-xs font-semibold leading-5 opacity-70">{helper}</p>
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
    <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-center">
      <div className="relative mx-auto size-52">
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
            <div key={segment.label} className="rounded-2xl bg-neutral-50 p-3">
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
      height - padding - (item.salesCents / maxSales) * innerHeight;

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

  const labelStep = Math.max(1, Math.ceil(data.length / 7));

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
            <circle
              key={point.label}
              cx={point.x}
              cy={point.y}
              r="4.5"
              fill="#ffffff"
              stroke="#d6a729"
              strokeWidth="3"
            >
              <title>
                {point.label}: {formatMoneyFromCents(point.salesCents)} ·{' '}
                {point.orders} orders
              </title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] font-black text-neutral-400">
        {data
          .filter(
            (_, index) =>
              index === 0 ||
              index === data.length - 1 ||
              index % labelStep === 0
          )
          .map((item) => (
            <span key={item.label}>{item.label}</span>
          ))}
      </div>
    </div>
  );
}

function HorizontalBars({
  items,
  maxValue,
  emptyText,
  valueFormatter = formatNumber,
}: {
  items: {
    label: string;
    value: number;
    helper?: string;
  }[];
  maxValue: number;
  emptyText: string;
  valueFormatter?: (value: number) => string;
}) {
  if (!items.length) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const width =
          item.value > 0 ? Math.max((item.value / maxValue) * 100, 4) : 0;

        return (
          <div
            key={`${item.label}-${index}`}
            className="rounded-2xl bg-neutral-50 p-3"
          >
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
                {valueFormatter(item.value)}
              </b>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-black"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
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

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageParam,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageParam: 'stockPage' | 'movementPage';
  searchParams: AnalyticsSearchParams;
}) {
  const firstItem = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-neutral-100 bg-neutral-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-bold text-neutral-500">
        Showing <b>{firstItem}</b>–<b>{lastItem}</b> of{' '}
        <b>{formatNumber(totalItems)}</b>
      </p>

      <div className="flex items-center gap-2">
        {currentPage > 1 ? (
          <Link
            href={buildAnalyticsUrl(
              searchParams,
              pageParam === 'stockPage'
                ? { stockPage: currentPage - 1 }
                : { movementPage: currentPage - 1 }
            )}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 transition hover:bg-neutral-100"
          >
            <ChevronLeft className="size-4" />
            Previous
          </Link>
        ) : (
          <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-300">
            <ChevronLeft className="size-4" />
            Previous
          </span>
        )}

        <span className="grid h-10 min-w-10 place-items-center rounded-xl bg-black px-3 text-xs font-black text-white">
          {currentPage} / {totalPages}
        </span>

        {currentPage < totalPages ? (
          <Link
            href={buildAnalyticsUrl(
              searchParams,
              pageParam === 'stockPage'
                ? { stockPage: currentPage + 1 }
                : { movementPage: currentPage + 1 }
            )}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 transition hover:bg-neutral-100"
          >
            Next
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-300">
            Next
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDirection,
  searchParams,
  align = 'left',
}: {
  label: string;
  sortKey: StockSortKey;
  currentSort: StockSortKey;
  currentDirection: 'asc' | 'desc';
  searchParams: AnalyticsSearchParams;
  align?: 'left' | 'right';
}) {
  const active = currentSort === sortKey;
  const nextDirection =
    active && currentDirection === 'asc' ? 'desc' : 'asc';

  return (
    <Link
      href={buildAnalyticsUrl(searchParams, {
        stockSort: sortKey,
        stockDir: nextDirection,
        stockPage: 1,
      })}
      className={`inline-flex w-full items-center gap-1.5 font-black hover:text-neutral-950 ${
        align === 'right' ? 'justify-end text-right' : 'justify-start'
      } ${active ? 'text-neutral-950' : 'text-neutral-500'}`}
    >
      {label}
      <ArrowUpDown className="size-3.5" />
    </Link>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<AnalyticsSearchParams>;
}) {
  const params = (await searchParams) ?? {};

  const user = await requireDashboardPermission(
    DashboardModule.ANALYTICS,
    'canView'
  );

  const hotels =
    user.role === 'SUPER_ADMIN'
      ? await db.hotel.findMany({
          where: {
            isActive: true,
          },
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: 'asc',
          },
        })
      : await db.hotel.findMany({
          where: {
            id: user.hotelId!,
          },
          select: {
            id: true,
            name: true,
          },
        });

  const selectedHotelId =
    user.role === 'SUPER_ADMIN'
      ? hotels.some((hotel) => hotel.id === params.hotelId)
        ? params.hotelId || ''
        : ''
      : user.hotelId!;

  const rangeDays = parseAllowedNumber(
    params.days,
    RANGE_OPTIONS,
    30
  );

  const stockPageSize = parseAllowedNumber(
    params.stockPageSize,
    STOCK_PAGE_SIZE_OPTIONS,
    20
  );

  const stockQuery = (params.stockQuery || '').trim().slice(0, 120);

  const stockSortValues: StockSortKey[] = [
    'name',
    'hotel',
    'available',
    'sold',
    'status',
    'updated',
  ];

  const stockSort = stockSortValues.includes(
    params.stockSort as StockSortKey
  )
    ? (params.stockSort as StockSortKey)
    : 'name';

  const stockDirection =
    params.stockDir === 'desc' ? ('desc' as const) : ('asc' as const);

  const days = getLastNDays(rangeDays);
  const now = new Date();
  const startDate = getStartOfDay(days[0]?.date ?? now);
  const previousStartDate = new Date(startDate);
  previousStartDate.setDate(previousStartDate.getDate() - rangeDays);
  const previousEndDate = new Date(startDate.getTime() - 1);

  const orderScope: Prisma.OrderWhereInput =
    user.role === 'SUPER_ADMIN'
      ? selectedHotelId
        ? { hotelId: selectedHotelId }
        : {}
      : { hotelId: user.hotelId! };

  const serviceScope: Prisma.ServiceRequestWhereInput =
    user.role === 'SUPER_ADMIN'
      ? selectedHotelId
        ? { hotelId: selectedHotelId }
        : {}
      : { hotelId: user.hotelId! };

  const stockScope: Prisma.MenuAvailabilityStockWhereInput =
    user.role === 'SUPER_ADMIN'
      ? selectedHotelId
        ? { hotelId: selectedHotelId }
        : {}
      : { hotelId: user.hotelId! };

  const movementScope: Prisma.MenuAvailabilityMovementWhereInput =
    user.role === 'SUPER_ADMIN'
      ? selectedHotelId
        ? { hotelId: selectedHotelId }
        : {}
      : { hotelId: user.hotelId! };

  const periodOrderWhere: Prisma.OrderWhereInput = {
    ...orderScope,
    createdAt: {
      gte: startDate,
      lte: now,
    },
  };

  const previousOrderWhere: Prisma.OrderWhereInput = {
    ...orderScope,
    createdAt: {
      gte: previousStartDate,
      lte: previousEndDate,
    },
  };

  const periodServiceWhere: Prisma.ServiceRequestWhereInput = {
    ...serviceScope,
    createdAt: {
      gte: startDate,
      lte: now,
    },
  };

  const periodMovementWhere: Prisma.MenuAvailabilityMovementWhereInput = {
    ...movementScope,
    createdAt: {
      gte: startDate,
      lte: now,
    },
  };

  const stockTableWhere: Prisma.MenuAvailabilityStockWhereInput = {
    ...stockScope,
    ...(stockQuery
      ? {
          OR: [
            {
              product: {
                name: {
                  contains: stockQuery,
                },
              },
            },
            {
              hotel: {
                name: {
                  contains: stockQuery,
                },
              },
            },
          ],
        }
      : {}),
  };

  const [
    currentSales,
    previousSales,
    currentOrderCount,
    previousOrderCount,
    requestCount,
    roomOrders,
    poolOrders,
    recentOrders,
    orderStatusGroups,
    paymentStatusGroups,
    paymentRevenueGroups,
    popularItems,
    serviceTypeGroups,
    serviceStatusGroups,
    stockTotals,
    availableStockItems,
    soldOutStockItems,
    hiddenMenuItems,
    lowStockItems,
    stockMovementUsage,
    stockTableCount,
    movementCount,
  ] = await Promise.all([
    db.order.aggregate({
      where: periodOrderWhere,
      _sum: {
        totalCents: true,
      },
    }),

    db.order.aggregate({
      where: previousOrderWhere,
      _sum: {
        totalCents: true,
      },
    }),

    db.order.count({
      where: periodOrderWhere,
    }),

    db.order.count({
      where: previousOrderWhere,
    }),

    db.serviceRequest.count({
      where: periodServiceWhere,
    }),

    db.order.count({
      where: {
        ...periodOrderWhere,
        roomId: {
          not: null,
        },
      },
    }),

    db.order.count({
      where: {
        ...periodOrderWhere,
        location: {
          type: 'POOL',
        },
      },
    }),

    db.order.findMany({
      where: periodOrderWhere,
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
      where: periodOrderWhere,
      _count: {
        _all: true,
      },
    }),

    db.order.groupBy({
      by: ['paymentStatus'],
      where: periodOrderWhere,
      _count: {
        _all: true,
      },
    }),

    db.order.groupBy({
      by: ['paymentStatus'],
      where: periodOrderWhere,
      _sum: {
        totalCents: true,
      },
      _count: {
        _all: true,
      },
    }),

    db.orderItem.groupBy({
      by: ['productNameSnapshot'],
      where: {
        order: periodOrderWhere,
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
      where: periodServiceWhere,
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
      where: periodServiceWhere,
      _count: {
        _all: true,
      },
    }),

    db.menuAvailabilityStock.aggregate({
      where: stockScope,
      _sum: {
        availableQty: true,
        soldQty: true,
      },
      _count: {
        _all: true,
      },
    }),

    db.menuAvailabilityStock.count({
      where: {
        ...stockScope,
        product: {
          isAvailable: true,
        },
        availableQty: {
          gt: 0,
        },
        isSoldOut: false,
      },
    }),

    db.menuAvailabilityStock.count({
      where: {
        ...stockScope,
        OR: [
          {
            isSoldOut: true,
          },
          {
            availableQty: {
              lte: 0,
            },
          },
        ],
      },
    }),

    db.menuAvailabilityStock.count({
      where: {
        ...stockScope,
        product: {
          isAvailable: false,
        },
      },
    }),

    db.menuAvailabilityStock.count({
      where: {
        ...stockScope,
        product: {
          isAvailable: true,
        },
        isSoldOut: false,
        availableQty: {
          gt: 0,
          lte: 5,
        },
      },
    }),

    db.menuAvailabilityMovement.groupBy({
      by: ['productId'],
      where: {
        ...periodMovementWhere,
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

    db.menuAvailabilityStock.count({
      where: stockTableWhere,
    }),

    db.menuAvailabilityMovement.count({
      where: periodMovementWhere,
    }),
  ]);

  const stockTotalPages = Math.max(
    1,
    Math.ceil(stockTableCount / stockPageSize)
  );

  const stockPage = clampPage(
    Number(params.stockPage || 1),
    stockTotalPages
  );

  const movementTotalPages = Math.max(
    1,
    Math.ceil(movementCount / MOVEMENT_PAGE_SIZE)
  );

  const movementPage = clampPage(
    Number(params.movementPage || 1),
    movementTotalPages
  );

  const movementProductIds = stockMovementUsage
    .map((item) => item.productId)
    .filter(Boolean) as string[];

  const [menuStocks, recentStockMovements, movementProducts] =
    await Promise.all([
      db.menuAvailabilityStock.findMany({
        where: stockTableWhere,
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
        orderBy: getStockOrderBy(stockSort, stockDirection),
        skip: (stockPage - 1) * stockPageSize,
        take: stockPageSize,
      }),

      db.menuAvailabilityMovement.findMany({
        where: periodMovementWhere,
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
        skip: (movementPage - 1) * MOVEMENT_PAGE_SIZE,
        take: MOVEMENT_PAGE_SIZE,
      }),

      movementProductIds.length
        ? db.menuProduct.findMany({
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
        : [],
    ]);

  const movementProductMap = new Map(
    movementProducts.map((product) => [product.id, product])
  );

  const totalSalesCents = currentSales._sum.totalCents ?? 0;
  const previousSalesCents = previousSales._sum.totalCents ?? 0;

  const averageOrderValueCents = currentOrderCount
    ? Math.round(totalSalesCents / currentOrderCount)
    : 0;

  const previousAverageOrderValueCents = previousOrderCount
    ? Math.round(previousSalesCents / previousOrderCount)
    : 0;

  const revenueDelta = getDeltaPercentage(
    totalSalesCents,
    previousSalesCents
  );

  const orderDelta = getDeltaPercentage(
    currentOrderCount,
    previousOrderCount
  );

  const averageOrderDelta = getDeltaPercentage(
    averageOrderValueCents,
    previousAverageOrderValueCents
  );

  const deliveredOrders =
    orderStatusGroups.find((item) => item.status === OrderStatus.DELIVERED)
      ?._count._all ?? 0;

  const cancelledOrders =
    orderStatusGroups.find((item) => item.status === OrderStatus.CANCELLED)
      ?._count._all ?? 0;

  const completionRate = getPercentage(
    deliveredOrders,
    currentOrderCount
  );

  const cancellationRate = getPercentage(
    cancelledOrders,
    currentOrderCount
  );

  const paidOrders =
    paymentStatusGroups.find(
      (item) => item.paymentStatus === PaymentStatus.PAID
    )?._count._all ?? 0;

  const paidRate = getPercentage(paidOrders, currentOrderCount);

  const completedServiceRequests =
    serviceStatusGroups.find(
      (item) => String(item.status) === 'COMPLETED'
    )?._count._all ?? 0;

  const activeServiceRequests = serviceStatusGroups
    .filter(
      (item) =>
        String(item.status) !== 'COMPLETED' &&
        String(item.status) !== 'CANCELLED'
    )
    .reduce((sum, item) => sum + item._count._all, 0);

  const serviceCompletionRate = getPercentage(
    completedServiceRequests,
    requestCount
  );

  const salesTrend = days.map((day) => {
    const dayOrders = recentOrders.filter(
      (order) => getManilaDateKey(order.createdAt) === day.key
    );

    return {
      label: day.label,
      salesCents: dayOrders.reduce(
        (sum, order) => sum + order.totalCents,
        0
      ),
      orders: dayOrders.length,
    };
  });

  const bestRevenueDay = salesTrend.reduce(
    (best, item) =>
      item.salesCents > best.salesCents ? item : best,
    salesTrend[0] ?? {
      label: 'No data',
      salesCents: 0,
      orders: 0,
    }
  );

  const hourCounts = new Map<number, number>();

  for (const order of recentOrders) {
    const hour = Number(manilaHourFormatter.format(order.createdAt));
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }

  const peakHourEntry = Array.from(hourCounts.entries()).sort(
    (first, second) => second[1] - first[1]
  )[0];

  const peakHour = peakHourEntry
    ? new Intl.DateTimeFormat('en-PH', {
        hour: 'numeric',
        hour12: true,
        timeZone: 'Asia/Manila',
      }).format(
        new Date(
          Date.UTC(
            2026,
            0,
            1,
            Math.max(0, peakHourEntry[0] - 8)
          )
        )
      )
    : 'No data';

  const orderStatusSegments = Object.values(OrderStatus).map((status) => ({
    label: statusLabel(status),
    value:
      orderStatusGroups.find((item) => item.status === status)?._count
        ._all ?? 0,
    color: getOrderStatusColor(status),
  }));

  const paymentStatusSegments = Object.values(PaymentStatus).map(
    (status) => ({
      label: statusLabel(status),
      value:
        paymentStatusGroups.find(
          (item) => item.paymentStatus === status
        )?._count._all ?? 0,
      color: getPaymentStatusColor(status),
    })
  );

  const destinationSegments: DonutSegment[] = [
    {
      label: 'Room Service',
      value: roomOrders,
      color: '#10b981',
    },
    {
      label: 'Poolside',
      value: poolOrders,
      color: '#f59e0b',
    },
    {
      label: 'Other',
      value: Math.max(currentOrderCount - roomOrders - poolOrders, 0),
      color: '#71717a',
    },
  ];

  const popularMenuItems = popularItems.map((item, index) => ({
    label: item.productNameSnapshot,
    value: item._sum.quantity ?? 0,
    helper: `Sales rank #${index + 1}`,
  }));

  const maxPopularQty = getMaxValue(
    popularMenuItems.map((item) => item.value)
  );

  const serviceItems = serviceTypeGroups.map((item, index) => ({
    label: item.type,
    value: item._count._all,
    helper: `Request rank #${index + 1}`,
  }));

  const maxServiceQty = getMaxValue(
    serviceItems.map((item) => item.value)
  );

  const paymentRevenueItems = paymentRevenueGroups.map((item) => ({
    label: statusLabel(item.paymentStatus),
    value: item._sum.totalCents ?? 0,
    helper: `${formatNumber(item._count._all)} orders`,
  }));

  const maxPaymentRevenue = getMaxValue(
    paymentRevenueItems.map((item) => item.value)
  );

  const totalStockRecords = stockTotals._count._all;
  const totalAvailableQty = Number(stockTotals._sum.availableQty ?? 0);
  const totalSoldQty = Number(stockTotals._sum.soldQty ?? 0);

  const stockHealthRate = getPercentage(
    availableStockItems,
    totalStockRecords
  );

  const sellThroughRate = getPercentage(
    totalSoldQty,
    totalAvailableQty + totalSoldQty
  );

  const topStockUsage = stockMovementUsage.map((item) => ({
    productName:
      movementProductMap.get(item.productId)?.name ?? item.productId,
    quantity: Number(item._sum.quantity ?? 0),
  }));

  const maxStockUsage = getMaxValue(
    topStockUsage.map((item) => item.quantity)
  );

  const selectedHotelName =
    hotels.find((hotel) => hotel.id === selectedHotelId)?.name ??
    (user.role === 'SUPER_ADMIN' ? 'All Hotels' : hotels[0]?.name ?? 'Hotel');

  return (
    <div className="space-y-7">
      <PageHeader
        title="Business Intelligence Center"
        description="Revenue, operations, guest service, menu demand, and inventory intelligence in one decision-ready dashboard."
      />

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-soft">
        <form
          method="get"
          action="/dashboard/analytics"
          className="grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-end"
        >
          {user.role === 'SUPER_ADMIN' ? (
            <label className="grid gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-neutral-500">
                Hotel Scope
              </span>
              <select
                name="hotelId"
                defaultValue={selectedHotelId}
                className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-900 outline-none focus:border-gold"
              >
                <option value="">All Hotels</option>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-400">
                Hotel Scope
              </p>
              <p className="mt-1 text-sm font-black text-neutral-950">
                {selectedHotelName}
              </p>
            </div>
          )}

          <label className="grid gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-neutral-500">
              Analysis Period
            </span>
            <select
              name="days"
              defaultValue={String(rangeDays)}
              className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-900 outline-none focus:border-gold"
            >
              {RANGE_OPTIONS.map((daysOption) => (
                <option key={daysOption} value={daysOption}>
                  Last {daysOption} days
                </option>
              ))}
            </select>
          </label>

          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white transition hover:bg-neutral-800">
            <Filter className="size-4" />
            Apply Analytics
          </button>
        </form>
      </section>

      <section className="relative overflow-hidden rounded-[2.5rem] bg-neutral-950 p-6 text-white shadow-2xl">
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-gold/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-12 size-72 rounded-full bg-emerald-500/20 blur-3xl" />

        <div className="relative z-10 grid gap-6 xl:grid-cols-[1.05fr_1.55fr] xl:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-gold">
              <Sparkles className="size-4" />
              CloudView Analytics
            </div>

            <h1 className="mt-5 max-w-2xl text-4xl font-black tracking-tight md:text-5xl">
              A clearer pulse of hotel performance.
            </h1>

            <p className="mt-4 max-w-xl text-sm font-semibold leading-7 text-white/60">
              {selectedHotelName} · {shortDateFormatter.format(startDate)} to{' '}
              {shortDateFormatter.format(now)}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <HeroMetric
              label="Revenue"
              value={formatMoneyFromCents(totalSalesCents)}
              helper={`Compared with prior ${rangeDays} days`}
              delta={revenueDelta}
              icon={<CircleDollarSign className="size-5" />}
            />

            <HeroMetric
              label="Orders"
              value={formatNumber(currentOrderCount)}
              helper={`${completionRate}% completion rate`}
              delta={orderDelta}
              icon={<ClipboardList className="size-5" />}
            />

            <HeroMetric
              label="Avg. Order"
              value={formatMoneyFromCents(averageOrderValueCents)}
              helper="Average basket value"
              delta={averageOrderDelta}
              icon={<TrendingUp className="size-5" />}
            />

            <HeroMetric
              label="Requests"
              value={formatNumber(requestCount)}
              helper={`${serviceCompletionRate}% completed`}
              icon={<ConciergeBell className="size-5" />}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <InsightMetric
          label="Paid Order Rate"
          value={`${paidRate}%`}
          helper={`${paidOrders} paid of ${currentOrderCount} orders`}
          tone="green"
          icon={<CreditCard className="size-4" />}
        />

        <InsightMetric
          label="Completion Rate"
          value={`${completionRate}%`}
          helper={`${deliveredOrders} delivered orders`}
          tone="green"
          icon={<CheckCircle2 className="size-4" />}
        />

        <InsightMetric
          label="Cancellation"
          value={`${cancellationRate}%`}
          helper={`${cancelledOrders} cancelled orders`}
          tone={cancellationRate > 10 ? 'red' : 'neutral'}
          icon={<Activity className="size-4" />}
        />

        <InsightMetric
          label="Service Resolution"
          value={`${serviceCompletionRate}%`}
          helper={`${activeServiceRequests} currently active`}
          tone="blue"
          icon={<ConciergeBell className="size-4" />}
        />

        <InsightMetric
          label="Stock Health"
          value={`${stockHealthRate}%`}
          helper={`${lowStockItems} low-stock items`}
          tone={lowStockItems > 0 ? 'amber' : 'green'}
          icon={<PackageCheck className="size-4" />}
        />

        <InsightMetric
          label="Sell-through"
          value={`${sellThroughRate}%`}
          helper={`${formatNumber(totalSoldQty)} units sold`}
          tone="amber"
          icon={<Gauge className="size-4" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
        <AnalyticsCard
          title="Revenue Performance"
          description={`Daily sales movement across the selected ${rangeDays}-day period.`}
          right={
            <span className="inline-flex items-center gap-2 rounded-full bg-black px-3 py-1 text-xs font-black text-white">
              <BarChart3 className="size-4" />
              {formatMoneyFromCents(totalSalesCents)}
            </span>
          }
        >
          <SalesAreaChart data={salesTrend} />

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <InsightMetric
              label="Best Revenue Day"
              value={bestRevenueDay.label}
              helper={formatMoneyFromCents(bestRevenueDay.salesCents)}
              tone="green"
              icon={<CalendarDays className="size-4" />}
            />

            <InsightMetric
              label="Peak Order Time"
              value={peakHour}
              helper={
                peakHourEntry
                  ? `${peakHourEntry[1]} orders in this hour`
                  : 'No order activity'
              }
              tone="amber"
              icon={<Clock3 className="size-4" />}
            />

            <InsightMetric
              label="Daily Revenue Avg."
              value={formatMoneyFromCents(
                Math.round(totalSalesCents / Math.max(rangeDays, 1))
              )}
              helper={`${formatNumber(currentOrderCount)} orders in period`}
              tone="neutral"
              icon={<TrendingUp className="size-4" />}
            />
          </div>
        </AnalyticsCard>

        <AnalyticsCard
          title="Order Status Mix"
          description="Distribution of order progress and completion."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-gold/15 text-gold">
              <PieChart className="size-5" />
            </span>
          }
        >
          <DonutChart
            segments={orderStatusSegments}
            total={currentOrderCount}
            centerLabel="Orders"
            centerValue={formatNumber(currentOrderCount)}
          />
        </AnalyticsCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <AnalyticsCard
          title="Payment Status"
          description="Paid, unpaid, and refunded order distribution."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
              <WalletCards className="size-5" />
            </span>
          }
        >
          <DonutChart
            segments={paymentStatusSegments}
            total={currentOrderCount}
            centerLabel="Payments"
            centerValue={formatNumber(currentOrderCount)}
          />
        </AnalyticsCard>

        <AnalyticsCard
          title="Order Destination Mix"
          description="Where guest orders are being served."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-blue-100 text-blue-700">
              <Hotel className="size-5" />
            </span>
          }
        >
          <DonutChart
            segments={destinationSegments}
            total={currentOrderCount}
            centerLabel="Orders"
            centerValue={formatNumber(currentOrderCount)}
          />
        </AnalyticsCard>

        <AnalyticsCard
          title="Current Stock Health"
          description="Live inventory availability across menu items."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-blue-100 text-blue-700">
              <PackageCheck className="size-5" />
            </span>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <InsightMetric
              label="Available Items"
              value={formatNumber(availableStockItems)}
              helper="Ready for ordering"
              tone="green"
              icon={<CheckCircle2 className="size-4" />}
            />

            <InsightMetric
              label="Sold Out"
              value={formatNumber(soldOutStockItems)}
              helper="Requires replenishment"
              tone="red"
              icon={<Activity className="size-4" />}
            />

            <InsightMetric
              label="Low Stock"
              value={formatNumber(lowStockItems)}
              helper="Five units or fewer"
              tone="amber"
              icon={<Gauge className="size-4" />}
            />

            <InsightMetric
              label="Hidden Items"
              value={formatNumber(hiddenMenuItems)}
              helper="Not shown to guests"
              tone="neutral"
              icon={<Layers3 className="size-4" />}
            />
          </div>
        </AnalyticsCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <AnalyticsCard
          title="Popular Menu Items"
          description="Top menu items by ordered quantity."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-gold/15 text-gold">
              <Utensils className="size-5" />
            </span>
          }
        >
          <HorizontalBars
            items={popularMenuItems}
            maxValue={maxPopularQty}
            emptyText="No product sales in this period."
          />
        </AnalyticsCard>

        <AnalyticsCard
          title="Guest Service Demand"
          description="Most requested hotel service types."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-blue-100 text-blue-700">
              <ConciergeBell className="size-5" />
            </span>
          }
        >
          <HorizontalBars
            items={serviceItems}
            maxValue={maxServiceQty}
            emptyText="No service requests in this period."
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

        <AnalyticsCard
          title="Revenue by Payment Status"
          description="Order value grouped by current payment state."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
              <CircleDollarSign className="size-5" />
            </span>
          }
        >
          <HorizontalBars
            items={paymentRevenueItems}
            maxValue={maxPaymentRevenue}
            emptyText="No payment revenue in this period."
            valueFormatter={formatMoneyFromCents}
          />
        </AnalyticsCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AnalyticsCard
          title="Stock Usage from Orders"
          description="Products with the highest inventory deductions."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-neutral-100 text-neutral-700">
              <ShoppingBag className="size-5" />
            </span>
          }
        >
          <HorizontalBars
            items={topStockUsage.map((item, index) => ({
              label: item.productName,
              value: item.quantity,
              helper: `Usage rank #${index + 1}`,
            }))}
            maxValue={maxStockUsage}
            emptyText="No order stock deductions in this period."
          />
        </AnalyticsCard>

        <AnalyticsCard
          title="Operational Scoreboard"
          description="Order status performance at a glance."
          right={
            <span className="grid size-10 place-items-center rounded-2xl bg-neutral-100 text-neutral-700">
              <Activity className="size-5" />
            </span>
          }
        >
          <div className="space-y-3">
            {Object.values(OrderStatus).map((status) => {
              const count =
                orderStatusGroups.find((item) => item.status === status)
                  ?._count._all ?? 0;

              const percentage = getPercentage(
                count,
                currentOrderCount
              );

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
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </AnalyticsCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <AnalyticsCard
          title="Menu Stock Availability"
          description="Search, sort, and review live menu inventory."
          right={
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
              {formatNumber(stockTableCount)} records
            </span>
          }
        >
          <form
            method="get"
            action="/dashboard/analytics"
            className="mb-4 grid gap-3 md:grid-cols-[1fr_140px_auto]"
          >
            {selectedHotelId ? (
              <input type="hidden" name="hotelId" value={selectedHotelId} />
            ) : null}
            <input type="hidden" name="days" value={String(rangeDays)} />
            <input type="hidden" name="stockSort" value={stockSort} />
            <input type="hidden" name="stockDir" value={stockDirection} />

            <label className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <input
                name="stockQuery"
                defaultValue={stockQuery}
                placeholder="Search menu item or hotel"
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white pl-11 pr-4 text-sm font-semibold outline-none focus:border-gold"
              />
            </label>

            <select
              name="stockPageSize"
              defaultValue={String(stockPageSize)}
              className="h-11 rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-gold"
            >
              {STOCK_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} rows
                </option>
              ))}
            </select>

            <button className="h-11 rounded-2xl bg-black px-5 text-sm font-black text-white">
              Apply
            </button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-neutral-100">
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">
                      <SortHeader
                        label="Menu Item"
                        sortKey="name"
                        currentSort={stockSort}
                        currentDirection={stockDirection}
                        searchParams={params}
                      />
                    </th>
                    <th className="px-4 py-3 text-left">
                      <SortHeader
                        label="Hotel"
                        sortKey="hotel"
                        currentSort={stockSort}
                        currentDirection={stockDirection}
                        searchParams={params}
                      />
                    </th>
                    <th className="px-4 py-3 text-right">
                      <SortHeader
                        label="Available"
                        sortKey="available"
                        currentSort={stockSort}
                        currentDirection={stockDirection}
                        searchParams={params}
                        align="right"
                      />
                    </th>
                    <th className="px-4 py-3 text-right">
                      <SortHeader
                        label="Sold"
                        sortKey="sold"
                        currentSort={stockSort}
                        currentDirection={stockDirection}
                        searchParams={params}
                        align="right"
                      />
                    </th>
                    <th className="px-4 py-3 text-right">
                      <SortHeader
                        label="Status"
                        sortKey="status"
                        currentSort={stockSort}
                        currentDirection={stockDirection}
                        searchParams={params}
                        align="right"
                      />
                    </th>
                    <th className="px-4 py-3 text-right">
                      <SortHeader
                        label="Updated"
                        sortKey="updated"
                        currentSort={stockSort}
                        currentDirection={stockDirection}
                        searchParams={params}
                        align="right"
                      />
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {menuStocks.map((stock) => {
                    const available =
                      stock.product.isAvailable &&
                      Number(stock.availableQty) > 0 &&
                      !stock.isSoldOut;

                    const lowStock =
                      available && Number(stock.availableQty) <= 5;

                    return (
                      <tr
                        key={stock.id}
                        className="border-t border-neutral-100 text-sm transition hover:bg-neutral-50/70"
                      >
                        <td className="px-4 py-3">
                          <p className="font-black text-neutral-950">
                            {stock.product.name}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-neutral-400">
                            {stock.product.isAvailable
                              ? 'Visible in menu'
                              : 'Hidden from menu'}
                          </p>
                        </td>

                        <td className="px-4 py-3 font-semibold text-neutral-600">
                          {stock.hotel.name}
                        </td>

                        <td className="px-4 py-3 text-right font-black">
                          {formatNumber(Number(stock.availableQty))}
                        </td>

                        <td className="px-4 py-3 text-right font-black">
                          {formatNumber(Number(stock.soldQty))}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <span
                            className={
                              !available
                                ? 'rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-black text-red-700'
                                : lowStock
                                  ? 'rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-700'
                                  : 'rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700'
                            }
                          >
                            {!available
                              ? 'SOLD OUT'
                              : lowStock
                                ? 'LOW STOCK'
                                : 'HEALTHY'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right text-xs font-semibold text-neutral-500">
                          {formatDateTime(stock.updatedAt)}
                        </td>
                      </tr>
                    );
                  })}

                  {!menuStocks.length ? (
                    <tr>
                      <td colSpan={6} className="p-8">
                        <EmptyState text="No menu stock records match your filters." />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={stockPage}
              totalPages={stockTotalPages}
              totalItems={stockTableCount}
              pageSize={stockPageSize}
              pageParam="stockPage"
              searchParams={params}
            />
          </div>
        </AnalyticsCard>

        <AnalyticsCard
          title="Recent Stock Movements"
          description={`Latest inventory activity in the selected ${rangeDays}-day period.`}
          right={
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
              {formatNumber(movementCount)}
            </span>
          }
        >
          <div className="space-y-3">
            {recentStockMovements.map((movement) => (
              <article
                key={movement.id}
                className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-neutral-950">
                      {statusLabel(movement.type)}
                    </p>
                    <p className="mt-1 truncate font-semibold text-neutral-600">
                      {movement.product.name}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-neutral-600">
                    Balance {formatNumber(Number(movement.balanceAfter))}
                  </span>
                </div>

                <p className="mt-2 text-xs font-semibold text-neutral-400">
                  {movement.hotel.name} · Qty{' '}
                  {formatNumber(Number(movement.quantity))}
                </p>

                {movement.reason ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-500">
                    {movement.reason}
                  </p>
                ) : null}

                <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-neutral-400">
                  {formatDateTime(movement.createdAt)}
                </p>
              </article>
            ))}

            {!recentStockMovements.length ? (
              <EmptyState text="No stock movements in this period." />
            ) : null}
          </div>

          <div className="-mx-5 -mb-5 mt-5">
            <Pagination
              currentPage={movementPage}
              totalPages={movementTotalPages}
              totalItems={movementCount}
              pageSize={MOVEMENT_PAGE_SIZE}
              pageParam="movementPage"
              searchParams={params}
            />
          </div>
        </AnalyticsCard>
      </div>
    </div>
  );
}
