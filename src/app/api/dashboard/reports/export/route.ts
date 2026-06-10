import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  OrderItemStatus,
  OrderStatus,
  PaymentStatus,
  ServiceRequestStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';
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

type ExportFormat = 'csv' | 'xlsx' | 'pdf';

type ReportData = {
  title: string;
  description: string;
  reportKey: ReportKey;
  startDate: Date;
  endDate: Date;
  hotelName: string;
  columns: string[];
  rows: string[][];
  summary: {
    label: string;
    value: string;
  }[];
};

function isReportKey(value: string | null): value is ReportKey {
  return (
    value === 'daily' ||
    value === 'orders' ||
    value === 'inventory' ||
    value === 'services' ||
    value === 'cancellations' ||
    value === 'guest-portal' ||
    value === 'audit' ||
    value === 'export'
  );
}

function getReportKey(value: string | null): ReportKey {
  return isReportKey(value) ? value : 'daily';
}

function getExportFormat(value: string | null): ExportFormat {
  if (value === 'xlsx' || value === 'excel') {
    return 'xlsx';
  }

  if (value === 'pdf') {
    return 'pdf';
  }

  return 'csv';
}

function parseDate(value: string | null, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed;
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

function sanitizeFileName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getReportTitle(reportKey: ReportKey) {
  if (reportKey === 'orders') return 'Orders & Sales Report';
  if (reportKey === 'inventory') return 'Inventory Health Report';
  if (reportKey === 'services') return 'Service Request Report';
  if (reportKey === 'cancellations') return 'Cancellation Report';
  if (reportKey === 'guest-portal') return 'Guest Portal & NFC Report';
  if (reportKey === 'audit') return 'Audit & Security Report';
  if (reportKey === 'export') return 'Export Center Report';

  return 'Daily Operations Report';
}

function getReportDescription(reportKey: ReportKey) {
  if (reportKey === 'orders') {
    return 'Food orders, payment status, order status, room/location, source, and revenue.';
  }

  if (reportKey === 'inventory') {
    return 'Current stock, reorder levels, low-stock status, suppliers, and last updates.';
  }

  if (reportKey === 'services') {
    return 'Guest service requests, status, assignment, resolution time, and request volume.';
  }

  if (reportKey === 'cancellations') {
    return 'Cancelled orders, cancelled order items, cancelled services, reasons, and financial impact.';
  }

  if (reportKey === 'guest-portal') {
    return 'NFC guest sessions, scanned tags, rooms, locations, and guest portal access activity.';
  }

  if (reportKey === 'audit') {
    return 'Admin/system activity logs, user actions, changed records, and security trail.';
  }

  if (reportKey === 'export') {
    return 'Available export layouts and report types.';
  }

  return 'Executive daily summary of sales, orders, service requests, inventory health, cancellations, guest portal activity, and audit events.';
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  const view = new Uint8Array(arrayBuffer);
  view.set(buffer);
  return arrayBuffer;
}

async function buildReportData(request: NextRequest): Promise<ReportData> {
  const user = await requireUser();
  const searchParams = request.nextUrl.searchParams;

  const reportKey = getReportKey(searchParams.get('report'));
  const hotelInput = searchParams.get('hotelId');

  const today = new Date();
  const startDate = startOfDay(parseDate(searchParams.get('start'), today));
  const endDate = endOfDay(parseDate(searchParams.get('end'), today));

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

  if (!accessibleHotelIds.length) {
    throw new Error('No hotel access found.');
  }

  const selectedHotelId =
    hotelInput && accessibleHotelIds.includes(hotelInput) ? hotelInput : 'ALL';

  const hotelIdFilter: string | { in: string[] } =
    selectedHotelId === 'ALL'
      ? {
          in: accessibleHotelIds,
        }
      : selectedHotelId;

  const hotelName =
    selectedHotelId === 'ALL'
      ? 'All Hotels'
      : hotels.find((hotel) => hotel.id === selectedHotelId)?.name ??
        'Selected Hotel';

  const dateRangeFilter = {
    gte: startDate,
    lte: endDate,
  };

  const [orders, serviceRequests, inventoryItems, nfcSessions, activityLogs] =
    await Promise.all([
      db.order.findMany({
        where: {
          hotelId: hotelIdFilter,
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
          hotelId: hotelIdFilter,
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

      db.inventoryItem.findMany({
        where: {
          hotelId: hotelIdFilter,
        },
        include: {
          hotel: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      }),

      db.nfcGuestSession.findMany({
        where: {
          hotelId: hotelIdFilter,
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
        take: 500,
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
          Boolean(item.cancelledQty) ||
          item.status === OrderItemStatus.CANCELLED
      )
      .map((item) => ({
        order,
        item,
      }))
  );

  const lowStockItems = inventoryItems.filter((item) => {
    const stock = Number(item.stockQuantity);
    const reorderLevel = Number(item.reorderLevel);

    if (reorderLevel <= 0) {
      return stock <= 0;
    }

    return stock <= reorderLevel;
  });

  const soldOutItems = inventoryItems.filter(
    (item) => Number(item.stockQuantity) <= 0
  );

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

  const summary = [
    {
      label: 'Report',
      value: getReportTitle(reportKey),
    },
    {
      label: 'Hotel',
      value: hotelName,
    },
    {
      label: 'Period',
      value: `${formatDateOnly(startDate)} - ${formatDateOnly(endDate)}`,
    },
    {
      label: 'Total Sales',
      value: formatCurrency(totalSalesCents),
    },
    {
      label: 'Paid Sales',
      value: formatCurrency(paidSalesCents),
    },
    {
      label: 'Total Orders',
      value: formatNumber(orders.length),
    },
    {
      label: 'Active Orders',
      value: formatNumber(activeOrders.length),
    },
    {
      label: 'Unpaid Orders',
      value: formatNumber(unpaidOrders.length),
    },
    {
      label: 'Cancelled Orders',
      value: formatNumber(cancelledOrders.length),
    },
    {
      label: 'Service Requests',
      value: formatNumber(serviceRequests.length),
    },
    {
      label: 'Low Stock Items',
      value: formatNumber(lowStockItems.length),
    },
    {
      label: 'Guest Portal Sessions',
      value: formatNumber(nfcSessions.length),
    },
    {
      label: 'Average Order',
      value: formatCurrency(averageOrderCents),
    },
    {
      label: 'Average Service Resolution',
      value: formatMinutes(averageServiceResolutionMinutes),
    },
  ];

  let columns: string[] = [];
  let rows: string[][] = [];

  if (reportKey === 'daily') {
    columns = ['Area', 'Metric', 'Value', 'Status', 'Notes'];

    rows = [
      [
        'Sales',
        'Total Sales',
        formatCurrency(totalSalesCents),
        'Tracked',
        `${formatNumber(nonCancelledOrders.length)} non-cancelled orders`,
      ],
      [
        'Orders',
        'Total Orders',
        formatNumber(orders.length),
        'Live',
        `${formatNumber(deliveredOrders.length)} delivered, ${formatNumber(cancelledOrders.length)} cancelled`,
      ],
      [
        'Payments',
        'Unpaid Orders',
        formatNumber(unpaidOrders.length),
        unpaidOrders.length ? 'Review' : 'Clear',
        'Follow up room charge or counter payments',
      ],
      [
        'Inventory',
        'Low Stock Items',
        formatNumber(lowStockItems.length),
        lowStockItems.length ? 'Attention' : 'Healthy',
        `${formatNumber(soldOutItems.length)} sold out items`,
      ],
      [
        'Services',
        'Pending Service Requests',
        formatNumber(pendingServiceRequests.length),
        pendingServiceRequests.length ? 'In Progress' : 'Clear',
        `Average completion: ${formatMinutes(averageServiceResolutionMinutes)}`,
      ],
      [
        'Guest Portal',
        'NFC Guest Sessions',
        formatNumber(nfcSessions.length),
        'Tracked',
        'Guest portal scans and access sessions',
      ],
      [
        'Security',
        'Audit Log Entries',
        formatNumber(activityLogs.length),
        'Recorded',
        'Admin and system activities',
      ],
    ];
  }

  if (reportKey === 'orders') {
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
      order.paymentStatus,
      order.status,
      `${order.items.length} item${order.items.length === 1 ? '' : 's'}`,
      formatCurrency(order.totalCents),
      formatDateTime(order.createdAt),
    ]);
  }

  if (reportKey === 'inventory') {
    columns = [
      'Item',
      'Hotel',
      'Current Stock',
      'Reorder Level',
      'Unit',
      'Supplier',
      'Status',
      'Last Updated',
    ];

    rows = inventoryItems.map((item) => {
      const stock = Number(item.stockQuantity);
      const reorderLevel = Number(item.reorderLevel);
      const isSoldOut = stock <= 0;
      const isLow = reorderLevel > 0 ? stock <= reorderLevel : stock <= 0;

      return [
        item.name,
        item.hotel.name,
        formatNumber(stock),
        formatNumber(reorderLevel),
        item.unit,
        item.supplier || '—',
        isSoldOut ? 'Sold Out' : isLow ? 'Low Stock' : 'Healthy',
        formatDateTime(item.updatedAt),
      ];
    });
  }

  if (reportKey === 'services') {
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
        request.status,
        request.assignedTo?.name || 'Unassigned',
        request.status === ServiceRequestStatus.COMPLETED
          ? formatMinutes(minutes)
          : '—',
        formatDateTime(request.createdAt),
      ];
    });
  }

  if (reportKey === 'cancellations') {
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

  if (reportKey === 'guest-portal') {
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
        session.endedAt ? 'Ended' : 'Active / Recent',
      ];
    });
  }

  if (reportKey === 'audit') {
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

  if (reportKey === 'export') {
    columns = ['Report', 'Best Use', 'Format', 'Status'];

    rows = [
      [
        'Daily Operations',
        'Executive daily operations summary',
        'PDF / Excel / CSV',
        'Available',
      ],
      [
        'Orders & Sales',
        'Order tracking, payment, source, and revenue',
        'PDF / Excel / CSV',
        'Available',
      ],
      [
        'Inventory Health',
        'Stock levels, low stock, suppliers, reorder review',
        'PDF / Excel / CSV',
        'Available',
      ],
      [
        'Service Requests',
        'Guest service request handling and staff performance',
        'PDF / Excel / CSV',
        'Available',
      ],
      [
        'Cancellations',
        'Cancelled orders/items/services and reasons',
        'PDF / Excel / CSV',
        'Available',
      ],
      [
        'Guest Portal / NFC',
        'NFC scans and guest portal engagement',
        'PDF / Excel / CSV',
        'Available',
      ],
      [
        'Audit & Security',
        'Admin activity and operational audit trail',
        'PDF / Excel / CSV',
        'Available',
      ],
    ];
  }

  return {
    title: getReportTitle(reportKey),
    description: getReportDescription(reportKey),
    reportKey,
    startDate,
    endDate,
    hotelName,
    columns,
    rows,
    summary,
  };
}

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function createCsv(data: ReportData) {
  const lines = [
    [data.title],
    [data.description],
    [`Hotel: ${data.hotelName}`],
    [`Period: ${formatDateOnly(data.startDate)} - ${formatDateOnly(data.endDate)}`],
    [],
    ['Summary'],
    ['Label', 'Value'],
    ...data.summary.map((item) => [item.label, item.value]),
    [],
    data.columns,
    ...data.rows,
  ];

  return `\uFEFF${lines
    .map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(','))
    .join('\r\n')}`;
}

async function createExcelBuffer(data: ReportData) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'CloudView';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Report');

  worksheet.addRow([data.title]);
  worksheet.addRow([data.description]);
  worksheet.addRow([`Hotel: ${data.hotelName}`]);
  worksheet.addRow([
    `Period: ${formatDateOnly(data.startDate)} - ${formatDateOnly(data.endDate)}`,
  ]);
  worksheet.addRow([]);

  worksheet.addRow(['Summary']);
  worksheet.addRow(['Label', 'Value']);

  for (const item of data.summary) {
    worksheet.addRow([item.label, item.value]);
  }

  worksheet.addRow([]);
  worksheet.addRow(data.columns);

  for (const row of data.rows) {
    worksheet.addRow(row);
  }

  worksheet.getRow(1).font = {
    bold: true,
    size: 18,
  };

  worksheet.getRow(6).font = {
    bold: true,
  };

  worksheet.getRow(7).font = {
    bold: true,
  };

  const tableHeaderRowNumber = 8 + data.summary.length + 1;

  worksheet.getRow(tableHeaderRowNumber).font = {
    bold: true,
    color: {
      argb: 'FFFFFFFF',
    },
  };

  worksheet.getRow(tableHeaderRowNumber).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: {
      argb: 'FF11100B',
    },
  };

  worksheet.columns.forEach((column) => {
    column.width = 22;
  });

  worksheet.views = [
    {
      state: 'frozen',
      ySplit: tableHeaderRowNumber,
    },
  ];

  const buffer = await workbook.xlsx.writeBuffer();

  return Buffer.from(buffer);
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function createPdfBuffer(data: ReportData) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 32,
    });

    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on('error', reject);

    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111');
    doc.text(data.title);

    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).fillColor('#555555');
    doc.text(data.description);
    doc.text(`Hotel: ${data.hotelName}`);
    doc.text(
      `Period: ${formatDateOnly(data.startDate)} - ${formatDateOnly(data.endDate)}`
    );
    doc.text(`Generated: ${formatDateTime(new Date())}`);

    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111');
    doc.text('Summary');

    doc.moveDown(0.4);

    const summaryColumnWidth = pageWidth / 4;
    let summaryX = doc.page.margins.left;
    let summaryY = doc.y;

    data.summary.slice(0, 12).forEach((item, index) => {
      if (index > 0 && index % 4 === 0) {
        summaryX = doc.page.margins.left;
        summaryY += 38;
      }

      doc
        .roundedRect(summaryX, summaryY, summaryColumnWidth - 8, 30, 6)
        .strokeColor('#e5e5e5')
        .lineWidth(0.5)
        .stroke();

      doc.font('Helvetica').fontSize(6.5).fillColor('#777777');
      doc.text(item.label, summaryX + 7, summaryY + 6, {
        width: summaryColumnWidth - 22,
        lineBreak: false,
      });

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111');
      doc.text(item.value, summaryX + 7, summaryY + 17, {
        width: summaryColumnWidth - 22,
        lineBreak: false,
      });

      summaryX += summaryColumnWidth;
    });

    doc.y = summaryY + 48;
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111');
    doc.text('Report Table');

    doc.moveDown(0.5);

    const columns = data.columns;
    const rows = data.rows;

    const columnWidth = pageWidth / columns.length;
    const rowHeight = 22;

    function drawHeader() {
      let x = doc.page.margins.left;
      const y = doc.y;

      doc.rect(x, y, pageWidth, rowHeight).fill('#11100B');

      columns.forEach((column) => {
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#FFFFFF');
        doc.text(truncateText(column, 18), x + 4, y + 7, {
          width: columnWidth - 8,
          lineBreak: false,
        });

        x += columnWidth;
      });

      doc.y = y + rowHeight;
    }

    function drawRow(row: string[], index: number) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - rowHeight) {
        doc.addPage();
        drawHeader();
      }

      let x = doc.page.margins.left;
      const y = doc.y;

      if (index % 2 === 0) {
        doc.rect(x, y, pageWidth, rowHeight).fill('#FAFAFA');
      }

      row.forEach((cell) => {
        doc.font('Helvetica').fontSize(6.3).fillColor('#222222');
        doc.text(truncateText(String(cell), 28), x + 4, y + 7, {
          width: columnWidth - 8,
          lineBreak: false,
        });

        x += columnWidth;
      });

      doc.y = y + rowHeight;
    }

    drawHeader();

    rows.forEach((row, index) => {
      drawRow(row, index);
    });

    doc.end();
  });
}

function getFileName(data: ReportData, format: ExportFormat) {
  const start = data.startDate.toISOString().slice(0, 10);
  const end = data.endDate.toISOString().slice(0, 10);
  const name = sanitizeFileName(data.title);

  return `cloudview-${name}-${start}-to-${end}.${format === 'xlsx' ? 'xlsx' : format}`;
}

export async function GET(request: NextRequest) {
  try {
    const format = getExportFormat(request.nextUrl.searchParams.get('format'));
    const data = await buildReportData(request);
    const fileName = getFileName(data, format);

    if (format === 'csv') {
      const csv = createCsv(data);

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'xlsx') {
  const buffer = await createExcelBuffer(data);

  return new Response(bufferToArrayBuffer(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}

    const buffer = await createPdfBuffer(data);

return new Response(bufferToArrayBuffer(buffer), {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'no-store',
  },
});
  } catch (error) {
    console.error('Report export failed:', error);

    return NextResponse.json(
      {
        error: 'Unable to export report.',
      },
      {
        status: 500,
      }
    );
  }
}