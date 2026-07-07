import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Download,
  FileSpreadsheet,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';
import {
  DashboardModule,
  OrderItemStatus,
  OrderStatus,
  PaymentStatus,
  Role,
  ServiceRequestStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';

export const dynamic = 'force-dynamic';

type ReportKey =
  | 'daily'
  | 'orders'
  | 'inventory'
  | 'services'
  | 'cancellations'
  | 'guest-portal'
  | 'audit'
  | 'export';

type SearchParams = Promise<{
  report?: string;
  hotelId?: string;
  start?: string;
  end?: string;
}> | undefined;

type HotelIdFilter = string | { in: string[] };

const reportTabs: {
  key: ReportKey;
  label: string;
  description: string;
}[] = [
  {
    key: 'daily',
    label: 'Daily Operations',
    description: 'Executive summary of today or selected period.',
  },
  {
    key: 'orders',
    label: 'Orders & Sales',
    description: 'Food orders, payment status, revenue, and source tracking.',
  },
  {
    key: 'inventory',
    label: 'Inventory Health',
    description: 'Low stock, current stock, reorder levels, and suppliers.',
  },
  {
    key: 'services',
    label: 'Service Requests',
    description: 'Housekeeping, room assistance, concierge, and maintenance.',
  },
  {
    key: 'cancellations',
    label: 'Cancellations',
    description: 'Cancelled orders, cancelled items, reasons, and impact.',
  },
  {
    key: 'guest-portal',
    label: 'Guest Portal / NFC',
    description: 'NFC sessions, rooms, locations, and guest portal usage.',
  },
  {
    key: 'audit',
    label: 'Audit & Security',
    description: 'Admin actions, changes, and activity trail.',
  },
  {
    key: 'export',
    label: 'Export Center',
    description: 'Prepare printable or downloadable report exports.',
  },
];

function getParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function isReportKey(value: string | undefined): value is ReportKey {
  return reportTabs.some((tab) => tab.key === value);
}

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (!match) {
    return fallback;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return fallback;
  }

  return parsed;
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-PH').format(value);
}

function formatDateTime(date: Date | string | null | undefined) {
  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

function formatDateOnly(date: Date | string | null | undefined) {
  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
  }).format(new Date(date));
}

function formatMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0 min';
  }

  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  return `${hours}h ${remainingMinutes}m`;
}

function getRoomOrLocation(entity: {
  room?: {
    number?: string | null;
    name?: string | null;
  } | null;
  location?: {
    name?: string | null;
  } | null;
}) {
  if (entity.room?.number) {
    return `Room ${entity.room.number}`;
  }

  if (entity.room?.name) {
    return entity.room.name;
  }

  if (entity.location?.name) {
    return entity.location.name;
  }

  return '—';
}

function getRemainingOrderItemQuantity(item: {
  quantity: number;
  cancelledQty: number | null;
}) {
  return Math.max(0, item.quantity - (item.cancelledQty ?? 0));
}

function buildExportUrl(params: {
  report: ReportKey;
  hotelId: string;
  start: string;
  end: string;
  format: 'csv' | 'xlsx' | 'pdf';
}) {
  const query = new URLSearchParams({
    report: params.report,
    hotelId: params.hotelId,
    start: params.start,
    end: params.end,
    format: params.format,
  });

  return `/api/dashboard/reports/export?${query.toString()}`;
}

function buildReportUrl(params: {
  report: string;
  hotelId: string;
  start: string;
  end: string;
  format?: 'pdf' | 'csv' | 'xlsx';
}) {
  const query = new URLSearchParams({
    report: params.report,
    hotelId: params.hotelId,
    start: params.start,
    end: params.end,
  });

  let url = `/dashboard/reports?${query.toString()}`;

  if (params.format) {
    url += `&format=${params.format}`;
  }

  return url;
}

function getSelectedHotelId({
  hotelInput,
  accessibleHotelIds,
  isSuperAdmin,
}: {
  hotelInput?: string;
  accessibleHotelIds: string[];
  isSuperAdmin: boolean;
}) {
  if (hotelInput && accessibleHotelIds.includes(hotelInput)) {
    return hotelInput;
  }

  if (isSuperAdmin && hotelInput === 'ALL') {
    return 'ALL';
  }

  if (isSuperAdmin) {
    return 'ALL';
  }

  return accessibleHotelIds[0] ?? 'ALL';
}

function buildHotelFilter(
  selectedHotelId: string,
  accessibleHotelIds: string[]
): HotelIdFilter {
  return selectedHotelId === 'ALL'
    ? {
        in: accessibleHotelIds,
      }
    : selectedHotelId;
}

function normalizeDateRange(startDate: Date, endDate: Date) {
  if (startDate.getTime() <= endDate.getTime()) {
    return {
      startDate,
      endDate,
    };
  }

  return {
    startDate: startOfDay(endDate),
    endDate: endOfDay(startDate),
  };
}

function StatusPill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'green' | 'blue' | 'amber' | 'red';
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : tone === 'blue'
        ? 'bg-blue-50 text-blue-700 border-blue-100'
        : tone === 'amber'
          ? 'bg-amber-50 text-amber-700 border-amber-100'
          : tone === 'red'
            ? 'bg-red-50 text-red-700 border-red-100'
            : 'bg-neutral-100 text-neutral-600 border-neutral-200';

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${toneClass}`}
    >
      {children}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'gold',
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: typeof ReceiptText;
  tone?: 'gold' | 'green' | 'blue' | 'red' | 'amber';
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'blue'
        ? 'bg-blue-50 text-blue-700'
        : tone === 'red'
          ? 'bg-red-50 text-red-700'
          : tone === 'amber'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-[#fff8e7] text-[#b88938]';

  return (
    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.04)]">
      <div className="flex items-start gap-4">
        <span className={`grid size-12 place-items-center rounded-2xl ${toneClass}`}>
          <Icon className="size-6" />
        </span>

        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black text-neutral-950">
            {value}
          </p>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            {helper}
          </p>
        </div>
      </div>
    </div>
  );
}

function ReportTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left">
          <thead className="bg-neutral-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="border-b border-neutral-100 px-4 py-3 text-xs font-black uppercase tracking-wide text-neutral-500"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-neutral-100 last:border-b-0 hover:bg-[#fffaf0]"
                >
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-4 py-4 text-sm font-semibold text-neutral-700"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center"
                >
                  <p className="font-black text-neutral-900">
                    No report data found.
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Try changing the date range, hotel, or report type.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const user = await requireDashboardPermission(
    DashboardModule.REPORTS,
    'canView'
  );

  const resolvedSearchParams = (await searchParams) ?? {};

  const today = new Date();
  const defaultStart = startOfDay(today);
  const defaultEnd = endOfDay(today);

  const startInput = getParam(resolvedSearchParams.start);
  const endInput = getParam(resolvedSearchParams.end);
  const reportInput = getParam(resolvedSearchParams.report);
  const hotelInput = getParam(resolvedSearchParams.hotelId);

  const normalizedRange = normalizeDateRange(
    startOfDay(parseDate(startInput, defaultStart)),
    endOfDay(parseDate(endInput, defaultEnd))
  );

  const startDate = normalizedRange.startDate;
  const endDate = normalizedRange.endDate;

  const startValue = toInputDate(startDate);
  const endValue = toInputDate(endDate);

  const activeReport: ReportKey = isReportKey(reportInput)
    ? reportInput
    : 'daily';

  const hotels = await db.hotel.findMany({
    where:
      user.role === 'SUPER_ADMIN'
        ? {}
        : user.hotelId
          ? {
              id: user.hotelId,
            }
          : {
              id: '__NO_ACCESS__',
            },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  const accessibleHotelIds = hotels.map((hotel) => hotel.id);
  const selectedHotelId = getSelectedHotelId({
    hotelInput,
    accessibleHotelIds,
    isSuperAdmin: user.role === Role.SUPER_ADMIN,
  });

  const hotelFilter = buildHotelFilter(selectedHotelId, accessibleHotelIds);

  const dateRangeFilter = {
    gte: startDate,
    lte: endDate,
  };

  if (!accessibleHotelIds.length) {
    return (
      <div className="rounded-[2rem] border border-red-100 bg-red-50 p-8">
        <h1 className="text-2xl font-black text-red-800">
          No hotel access found
        </h1>
        <p className="mt-2 text-sm font-semibold text-red-700">
          Your user account is not assigned to any hotel.
        </p>
      </div>
    );
  }

  const [orders, serviceRequests, menuStocks, nfcSessions, activityLogs] =
  await Promise.all([
      db.order.findMany({
        where: {
          hotelId: hotelFilter,
          createdAt: dateRangeFilter,
        },
        include: {
          hotel: {
            select: {
              name: true,
            },
          },
          room: {
            select: {
              name: true,
              number: true,
            },
          },
          location: {
            select: {
              name: true,
            },
          },
          tag: {
            select: {
              code: true,
              label: true,
            },
          },
          items: {
            select: {
              id: true,
              productNameSnapshot: true,
              quantity: true,
              unitPriceCents: true,
              status: true,
              cancelledQty: true,
              cancelledAt: true,
              cancelReason: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),

      db.serviceRequest.findMany({
        where: {
          hotelId: hotelFilter,
          createdAt: dateRangeFilter,
        },
        include: {
          hotel: {
            select: {
              name: true,
            },
          },
          room: {
            select: {
              name: true,
              number: true,
            },
          },
          location: {
            select: {
              name: true,
            },
          },
          assignedTo: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),

      db.menuAvailabilityStock.findMany({
  where: {
    hotelId: hotelFilter,
  },
  include: {
    hotel: {
      select: {
        name: true,
      },
    },
    product: {
      select: {
        name: true,
        isAvailable: true,
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

      db.nfcGuestSession.findMany({
        where: {
          hotelId: hotelFilter,
          startedAt: dateRangeFilter,
        },
        include: {
          hotel: {
            select: {
              name: true,
            },
          },
          tag: {
            select: {
              code: true,
              label: true,
              tagType: true,
            },
          },
          room: {
            select: {
              name: true,
              number: true,
            },
          },
          location: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
      }),

      db.activityLog.findMany({
        where:
          selectedHotelId === 'ALL'
            ? {
                createdAt: dateRangeFilter,
                OR: [
                  {
                    hotelId: {
                      in: accessibleHotelIds,
                    },
                  },
                  {
                    hotelId: null,
                  },
                ],
              }
            : {
                hotelId: selectedHotelId,
                createdAt: dateRangeFilter,
              },
        include: {
          hotel: {
            select: {
              name: true,
            },
          },
          user: {
            select: {
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 100,
      }),
    ]);

  const nonCancelledOrders = orders.filter(
    (order) => order.status !== OrderStatus.CANCELLED
  );

  const cancelledOrders = orders.filter(
    (order) => order.status === OrderStatus.CANCELLED
  );

  const unpaidOrders = nonCancelledOrders.filter(
    (order) => order.paymentStatus === PaymentStatus.UNPAID
  );

  const deliveredOrders = orders.filter(
    (order) => order.status === OrderStatus.DELIVERED
  );

  const activeOrders = orders.filter(
    (order) =>
      order.status !== OrderStatus.CANCELLED &&
      order.status !== OrderStatus.DELIVERED
  );

  const totalSalesCents = nonCancelledOrders.reduce(
    (sum, order) => sum + order.totalCents,
    0
  );

  const paidSalesCents = nonCancelledOrders
    .filter((order) => order.paymentStatus === PaymentStatus.PAID)
    .reduce((sum, order) => sum + order.totalCents, 0);

  const averageOrderCents = nonCancelledOrders.length
    ? Math.round(totalSalesCents / nonCancelledOrders.length)
    : 0;

  const cancelledItems = orders.flatMap((order) =>
  order.items
    .filter(
      (item) =>
        (item.cancelledQty ?? 0) > 0 ||
        item.status === OrderItemStatus.CANCELLED ||
        item.status === OrderItemStatus.PARTIALLY_CANCELLED
    )
    .map((item) => ({
      order,
      item,
    }))
);

          const soldOutItems = menuStocks.filter(
          (stock) => stock.isSoldOut || Number(stock.availableQty) <= 0
        );

        const lowStockItems = menuStocks.filter((stock) => {
          const availableQty = Number(stock.availableQty);

          return (
            stock.product.isAvailable &&
            !stock.isSoldOut &&
            availableQty > 0 &&
            availableQty <= 5
          );
        });
  const completedServiceRequests = serviceRequests.filter(
    (request) => request.status === ServiceRequestStatus.COMPLETED
  );

  const pendingServiceRequests = serviceRequests.filter(
    (request) =>
      request.status === ServiceRequestStatus.NEW ||
      request.status === ServiceRequestStatus.IN_PROGRESS
  );

  const cancelledServiceRequests = serviceRequests.filter(
    (request) => request.status === ServiceRequestStatus.CANCELLED
  );

  const averageServiceResolutionMinutes = completedServiceRequests.length
    ? completedServiceRequests.reduce((sum, request) => {
        return (
          sum +
          Math.max(
            0,
            (request.updatedAt.getTime() - request.createdAt.getTime()) /
              60_000
          )
        );
      }, 0) / completedServiceRequests.length
    : 0;

  const topSellingItems = Array.from(
    nonCancelledOrders
      .flatMap((order) => order.items)
      .reduce((map, item) => {
        const remainingQuantity = getRemainingOrderItemQuantity(item);

        if (remainingQuantity <= 0) {
          return map;
        }

        const existing = map.get(item.productNameSnapshot) ?? {
          name: item.productNameSnapshot,
          quantity: 0,
          revenueCents: 0,
        };

        existing.quantity += remainingQuantity;
        existing.revenueCents += remainingQuantity * item.unitPriceCents;

        map.set(item.productNameSnapshot, existing);

        return map;
      }, new Map<string, { name: string; quantity: number; revenueCents: number }>())
      .values()
  )
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 10);

  const nfcByDestination = Array.from(
    nfcSessions
      .reduce((map, session) => {
        const destination = session.room?.number
          ? `Room ${session.room.number}`
          : session.location?.name || session.tag.label || session.tag.code;

        const existing = map.get(destination) ?? {
          destination,
          count: 0,
        };

        existing.count += 1;
        map.set(destination, existing);

        return map;
      }, new Map<string, { destination: string; count: number }>())
      .values()
  )
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const summaryCards = [
    {
      label: 'Total Sales',
      value: formatCurrency(totalSalesCents),
      helper: `${formatCurrency(paidSalesCents)} paid sales`,
      icon: ReceiptText,
      tone: 'green' as const,
    },
    {
      label: 'Total Orders',
      value: formatNumber(orders.length),
      helper: `${formatNumber(activeOrders.length)} active orders`,
      icon: ShoppingBag,
      tone: 'blue' as const,
    },
    {
      label: 'Service Requests',
      value: formatNumber(serviceRequests.length),
      helper: `${formatNumber(pendingServiceRequests.length)} still active`,
      icon: ClipboardList,
      tone: 'gold' as const,
    },
    {
      label: 'Attention Needed',
      value: formatNumber(
        lowStockItems.length + cancelledOrders.length + unpaidOrders.length
      ),
      helper: `${lowStockItems.length} low stock, ${unpaidOrders.length} unpaid`,
      icon: AlertTriangle,
      tone: 'red' as const,
    },
  ];

  let columns: string[] = [];
  let rows: React.ReactNode[][] = [];

  if (activeReport === 'daily') {
    columns = ['Area', 'Metric', 'Value', 'Status', 'Notes'];

    rows = [
      [
        'Sales',
        'Total Sales',
        formatCurrency(totalSalesCents),
        <StatusPill tone="green">Tracked</StatusPill>,
        `${formatNumber(nonCancelledOrders.length)} non-cancelled orders`,
      ],
      [
        'Orders',
        'Total Orders',
        formatNumber(orders.length),
        <StatusPill tone="blue">Live</StatusPill>,
        `${formatNumber(deliveredOrders.length)} delivered, ${formatNumber(cancelledOrders.length)} cancelled`,
      ],
      [
        'Payments',
        'Unpaid Orders',
        formatNumber(unpaidOrders.length),
        unpaidOrders.length ? (
          <StatusPill tone="amber">Review</StatusPill>
        ) : (
          <StatusPill tone="green">Clear</StatusPill>
        ),
        'Follow up room charge or counter payments',
      ],
      [
        'Inventory',
        'Low Stock Items',
        formatNumber(lowStockItems.length),
        lowStockItems.length ? (
          <StatusPill tone="red">Attention</StatusPill>
        ) : (
          <StatusPill tone="green">Healthy</StatusPill>
        ),
        `${formatNumber(soldOutItems.length)} sold out items`,
      ],
      [
        'Services',
        'Pending Service Requests',
        formatNumber(pendingServiceRequests.length),
        pendingServiceRequests.length ? (
          <StatusPill tone="amber">In Progress</StatusPill>
        ) : (
          <StatusPill tone="green">Clear</StatusPill>
        ),
        `Average completion: ${formatMinutes(averageServiceResolutionMinutes)}`,
      ],
      [
        'Guest Portal',
        'NFC Guest Sessions',
        formatNumber(nfcSessions.length),
        <StatusPill tone="blue">Tracked</StatusPill>,
        'Guest portal scans and access sessions',
      ],
      [
        'Security',
        'Audit Log Entries',
        formatNumber(activityLogs.length),
        <StatusPill tone="neutral">Recorded</StatusPill>,
        'Admin and system activities',
      ],
    ];
  }

  if (activeReport === 'orders') {
    columns = [
      'Order Code',
      'Hotel',
      'Room / Location',
      'Source',
      'Payment',
      'Status',
      'Items',
      'Total',
      'Created',
    ];

    rows = orders.map((order) => [
      order.orderCode,
      order.hotel.name,
      getRoomOrLocation(order),
      order.tag ? 'Guest Portal' : 'POS / Dashboard',
      <StatusPill
        tone={order.paymentStatus === PaymentStatus.PAID ? 'green' : 'red'}
      >
        {order.paymentStatus}
      </StatusPill>,
      <StatusPill
        tone={
          order.status === OrderStatus.CANCELLED
            ? 'red'
            : order.status === OrderStatus.DELIVERED
              ? 'green'
              : 'blue'
        }
      >
        {order.status}
      </StatusPill>,
      `${order.items.length} item${order.items.length === 1 ? '' : 's'}`,
      formatCurrency(order.totalCents),
      formatDateTime(order.createdAt),
    ]);
  }

  if (activeReport === 'inventory') {
  columns = [
    'Menu Item',
    'Hotel',
    'Available Qty',
    'Sold Qty',
    'Menu Visibility',
    'Stock Status',
    'Last Updated',
  ];

  rows = menuStocks.map((stock) => {
    const availableQty = Number(stock.availableQty);
    const soldQty = Number(stock.soldQty);

    const isSoldOut = stock.isSoldOut || availableQty <= 0;

    const isLow =
      stock.product.isAvailable &&
      !isSoldOut &&
      availableQty > 0 &&
      availableQty <= 5;

    return [
      stock.product.name,
      stock.hotel.name,
      formatNumber(availableQty),
      formatNumber(soldQty),
      stock.product.isAvailable ? (
        <StatusPill tone="green">Visible</StatusPill>
      ) : (
        <StatusPill tone="neutral">Hidden</StatusPill>
      ),
      isSoldOut ? (
        <StatusPill tone="red">Sold Out</StatusPill>
      ) : isLow ? (
        <StatusPill tone="amber">Low Stock</StatusPill>
      ) : (
        <StatusPill tone="green">Healthy</StatusPill>
      ),
      formatDateTime(stock.updatedAt),
    ];
  });
}

  if (activeReport === 'services') {
    columns = [
      'Request Code',
      'Hotel',
      'Room / Location',
      'Type',
      'Quantity',
      'Status',
      'Assigned Staff',
      'Resolution Time',
      'Created',
    ];

    rows = serviceRequests.map((request) => {
      const minutes =
        request.status === ServiceRequestStatus.COMPLETED
          ? (request.updatedAt.getTime() - request.createdAt.getTime()) /
            60_000
          : 0;

      return [
        request.requestCode,
        request.hotel.name,
        getRoomOrLocation(request),
        request.type,
        formatNumber(request.quantity),
        <StatusPill
          tone={
            request.status === ServiceRequestStatus.COMPLETED
              ? 'green'
              : request.status === ServiceRequestStatus.CANCELLED
                ? 'red'
                : 'blue'
          }
        >
          {request.status}
        </StatusPill>,
        request.assignedTo?.name || 'Unassigned',
        request.status === ServiceRequestStatus.COMPLETED
          ? formatMinutes(minutes)
          : '—',
        formatDateTime(request.createdAt),
      ];
    });
  }

  if (activeReport === 'cancellations') {
    columns = [
      'Reference',
      'Type',
      'Room / Location',
      'Item / Request',
      'Quantity',
      'Reason',
      'Financial Impact',
      'Cancelled At',
    ];

    const orderRows = cancelledOrders.map((order) => [
      order.orderCode,
      'Order',
      getRoomOrLocation(order),
      `${order.items.length} item${order.items.length === 1 ? '' : 's'}`,
      '—',
      order.notes || 'Cancelled order',
      formatCurrency(order.totalCents),
      formatDateTime(order.updatedAt),
    ]);

    const itemRows = cancelledItems.map(({ order, item }) => [
      order.orderCode,
      'Item',
      getRoomOrLocation(order),
      item.productNameSnapshot,
      formatNumber(item.cancelledQty ?? item.quantity),
      item.cancelReason || 'Cancelled item',
      formatCurrency((item.cancelledQty ?? item.quantity) * item.unitPriceCents),
      formatDateTime(item.cancelledAt || order.updatedAt),
    ]);

    const serviceRows = cancelledServiceRequests.map((request) => [
      request.requestCode,
      'Service Request',
      getRoomOrLocation(request),
      request.type,
      formatNumber(request.cancelledQty || request.quantity),
      request.notes || 'Cancelled service request',
      '—',
      formatDateTime(request.updatedAt),
    ]);

    rows = [...orderRows, ...itemRows, ...serviceRows];
  }

  if (activeReport === 'guest-portal') {
    columns = [
      'Started At',
      'Hotel',
      'NFC Tag',
      'Tag Type',
      'Room / Location',
      'Session Age',
      'Status',
    ];

    rows = nfcSessions.map((session) => {
      const ageMinutes =
        ((session.endedAt ?? session.lastSeenAt).getTime() -
          session.startedAt.getTime()) /
        60_000;

      return [
        formatDateTime(session.startedAt),
        session.hotel.name,
        session.tag.label || session.tag.code,
        session.tag.tagType,
        getRoomOrLocation(session),
        formatMinutes(ageMinutes),
        session.endedAt ? (
          <StatusPill tone="neutral">Ended</StatusPill>
        ) : (
          <StatusPill tone="green">Active / Recent</StatusPill>
        ),
      ];
    });
  }

  if (activeReport === 'audit') {
    columns = [
      'Date / Time',
      'User',
      'Role',
      'Hotel',
      'Action',
      'Entity',
      'Record',
      'Message',
    ];

    rows = activityLogs.map((log) => [
      formatDateTime(log.createdAt),
      log.user?.name || log.actor || 'System',
      log.user?.role || '—',
      log.hotel?.name || 'Global',
      log.action,
      log.entity,
      log.entityId || '—',
      log.message || '—',
    ]);
  }

  if (activeReport === 'export') {
    columns = ['Report', 'Best Use', 'Format', 'Status', 'Action'];

    rows = reportTabs
      .filter((tab) => tab.key !== 'export')
      .map((tab) => [
        tab.label,
        tab.description,
        'PDF / Excel / Print',
        <StatusPill tone="blue">Ready Layout</StatusPill>,
        <span className="text-xs font-black text-[#b88938]">
          Connect export route next
        </span>,
      ]);
  }

  const exportReport: ReportKey = activeReport === 'export' ? 'daily' : activeReport;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-neutral-950">Reports</h1>
          <p className="mt-2 text-sm font-medium text-neutral-500">
            CloudView Daily Operations, Sales, Inventory, Services, Guest
            Portal, and Audit reports.
          </p>
        </div>

      <div className="flex flex-wrap gap-2">
                    <a
                        href={buildExportUrl({
                        report: exportReport,
                        hotelId: selectedHotelId,
                        start: startValue,
                        end: endValue,
                        format: 'pdf',
                        })}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black transition hover:bg-neutral-50"
                    >
                        <Download className="size-4" />
                        Export PDF
                    </a>

                    <a
                        href={buildExportUrl({
                        report: exportReport,
                        hotelId: selectedHotelId,
                        start: startValue,
                        end: endValue,
                        format: 'xlsx',
                        })}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#11100b] px-4 text-sm font-black text-white transition hover:bg-black"
                    >
                        <FileSpreadsheet className="size-4 text-[#c99c38]" />
                        Export Excel
                    </a>

                    <a
                        href={buildExportUrl({
                        report: exportReport,
                        hotelId: selectedHotelId,
                        start: startValue,
                        end: endValue,
                        format: 'csv',
                        })}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#c99c38]/30 bg-[#fffaf0] px-4 text-sm font-black text-[#9d741f] transition hover:bg-[#f7f1e5]"
                    >
                        Export CSV
                    </a>
</div>
      </section>

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.04)]">
        <form className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]" method="GET">
          <div>
            <label className="text-xs font-black uppercase tracking-wide text-neutral-500">
              Start Date
            </label>
            <input
              name="start"
              type="date"
              defaultValue={startValue}
              className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold outline-none focus:border-[#c99c38]"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-neutral-500">
              End Date
            </label>
            <input
              name="end"
              type="date"
              defaultValue={endValue}
              className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold outline-none focus:border-[#c99c38]"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-neutral-500">
              Hotel
            </label>
            <select
              name="hotelId"
              defaultValue={selectedHotelId}
              className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-[#c99c38]"
            >
              {user.role === 'SUPER_ADMIN' ? (
                <option value="ALL">All Hotels</option>
              ) : null}

              {hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </option>
              ))}
            </select>
          </div>

          <input type="hidden" name="report" value={activeReport} />

          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#11100b] px-5 text-sm font-black text-white transition hover:bg-black"
            >
              <RefreshCcw className="size-4 text-[#c99c38]" />
              Apply Filters
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <SummaryCard
            key={card.label}
            label={card.label}
            value={card.value}
            helper={card.helper}
            icon={card.icon}
            tone={card.tone}
          />
        ))}
      </section>

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-3 shadow-[0_18px_45px_rgba(0,0,0,0.04)]">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {reportTabs.map((tab) => {
                    const active = tab.key === activeReport;

                    return (
                        <Link
                        key={tab.key}
                        href={buildReportUrl({
                            report: tab.key,
                            hotelId: selectedHotelId,
                            start: startValue,
                            end: endValue,
                        })}
                        className={active
                            ? 'shrink-0 rounded-2xl bg-[#11100b] px-4 py-3 text-sm font-black text-white'
                            : 'shrink-0 rounded-2xl px-4 py-3 text-sm font-black text-neutral-500 hover:bg-neutral-50'}
                        >
                        {tab.label}
                        </Link>
                    );
                    })}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-black text-neutral-950">
              {reportTabs.find((tab) => tab.key === activeReport)?.label}
            </h2>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              {reportTabs.find((tab) => tab.key === activeReport)?.description}
            </p>
          </div>

          <ReportTable columns={columns} rows={rows} />
        </div>

        <aside className="space-y-4">
          <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.04)]">
            <h3 className="flex items-center gap-2 font-black text-neutral-950">
              <AlertTriangle className="size-5 text-[#c99c38]" />
              Needs Attention
            </h3>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl bg-red-50 p-4">
                <p className="text-xs font-black uppercase text-red-700">
                  Low Stock
                </p>
                <p className="mt-1 text-2xl font-black text-red-900">
                  {formatNumber(lowStockItems.length)}
                </p>
              </div>

              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-black uppercase text-amber-700">
                  Unpaid Orders
                </p>
                <p className="mt-1 text-2xl font-black text-amber-900">
                  {formatNumber(unpaidOrders.length)}
                </p>
              </div>

              <div className="rounded-2xl bg-neutral-50 p-4">
                <p className="text-xs font-black uppercase text-neutral-500">
                  Cancelled Orders
                </p>
                <p className="mt-1 text-2xl font-black text-neutral-950">
                  {formatNumber(cancelledOrders.length)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.04)]">
            <h3 className="flex items-center gap-2 font-black text-neutral-950">
              <Activity className="size-5 text-[#c99c38]" />
              Quick Insights
            </h3>

            <div className="mt-4 space-y-4 text-sm font-semibold text-neutral-600">
              <p>
                Average Order:{' '}
                <span className="font-black text-neutral-950">
                  {formatCurrency(averageOrderCents)}
                </span>
              </p>

              <p>
                Avg. Service Completion:{' '}
                <span className="font-black text-neutral-950">
                  {formatMinutes(averageServiceResolutionMinutes)}
                </span>
              </p>

              <p>
                Guest Portal Sessions:{' '}
                <span className="font-black text-neutral-950">
                  {formatNumber(nfcSessions.length)}
                </span>
              </p>

              <p>
                Audit Events:{' '}
                <span className="font-black text-neutral-950">
                  {formatNumber(activityLogs.length)}
                </span>
              </p>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.04)]">
            <h3 className="flex items-center gap-2 font-black text-neutral-950">
              <ShieldCheck className="size-5 text-[#c99c38]" />
              Top Data
            </h3>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
                  Top Selling Items
                </p>
                <div className="mt-2 space-y-2">
                  {topSellingItems.slice(0, 4).map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-3 py-2 text-xs font-bold"
                    >
                      <span className="truncate">{item.name}</span>
                      <span>{formatCurrency(item.revenueCents)}</span>
                    </div>
                  ))}

                  {!topSellingItems.length ? (
                    <p className="text-xs text-neutral-400">
                      No sold items yet.
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
                  Most Scanned NFC
                </p>
                <div className="mt-2 space-y-2">
                  {nfcByDestination.slice(0, 4).map((item) => (
                    <div
                      key={item.destination}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-3 py-2 text-xs font-bold"
                    >
                      <span className="truncate">{item.destination}</span>
                      <span>{formatNumber(item.count)}</span>
                    </div>
                  ))}

                  {!nfcByDestination.length ? (
                    <p className="text-xs text-neutral-400">
                      No NFC sessions yet.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 text-xs font-semibold text-neutral-500 shadow-[0_18px_45px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            Report period: {formatDateOnly(startDate)} –{' '}
            {formatDateOnly(endDate)}
          </p>
          <p>Generated from live CloudView operational data.</p>
        </div>
      </section>
    </div>
  );
}