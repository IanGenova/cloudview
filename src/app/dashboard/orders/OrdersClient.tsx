'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChefHat,
  Clock,
  CreditCard,
  PackageCheck,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Truck,
  Utensils,
  X,
} from 'lucide-react';
import {
  cancelOrderItemAction,
  markOrderPaidAction,
  updateOrderStatusAction,
} from './actions';

type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED';

type PaymentStatus =
  | 'UNPAID'
  | 'PAID'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'REFUND_FAILED';

type PaymentMethod =
  | 'ROOM_CHARGE'
  | 'PAY_AT_COUNTER'
  | 'CASH'
  | 'POS'
  | 'PAYMONGO' // Legacy transactions retained after the Xendit migration.
  | 'XENDIT';

type OrderItemStatus = 'ACTIVE' | 'PARTIALLY_CANCELLED' | 'CANCELLED';

type OrderItem = {
  id: string;
  quantity: number;
  productNameSnapshot: string;
  unitPriceCents: number;
  notes: string;
  isBundleSnapshot?: boolean;
  status?: OrderItemStatus;
  cancelledQty?: number;
  cancelledAt?: string;
  cancelReason?: string;
  bundleComponents?: {
    id: string;
    componentNameSnapshot: string;
    quantity: number;
  }[];
};

type OrderStatusHistory = {
  id: string;
  status: OrderStatus;
  note: string;
  createdAt: string;
  userName: string;
};

type RestoreMovement = {
  id: string;
  productName: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
};

type DashboardOrder = {
  id: string;
  orderCode: string;
  hotelName: string;
  roomLabel: string;
  guestName: string;
  guestPhone: string;
  notes: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  guestXenditStatus?: string;
  refundedAmountCents?: number;
  refundErrorMessage?: string;
  totalCents: number;
  subtotalCents: number;
  serviceChargeCents: number;
  taxCents: number;
  createdAt: string;
  updatedAt: string;
  tagCode: string;
  items: OrderItem[];
  statusHistory: OrderStatusHistory[];
  restoreMovements?: RestoreMovement[];
};

type StatusCounts = {
  ALL: number;
  PENDING: number;
  ACCEPTED: number;
  PREPARING: number;
  READY: number;
  DELIVERED: number;
  CANCELLED: number;
};

type Summary = {
  activeOrders: number;
  unpaidOrders: number;
  cancelledOrders: number;
  totalSalesCents: number;
};

type StatusFilter = 'ALL' | OrderStatus;
type PaymentFilter = 'ALL' | 'PAID' | 'UNPAID';

type Message =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;
  
type ClientOrderAction = (formData: FormData) => void | Promise<void>;

const statusOptions: StatusFilter[] = [
  'ALL',
  'PENDING',
  'PREPARING',
  'READY',
  'DELIVERED',
  'CANCELLED',
];

const activeOrderStatuses: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
];

const cancelReasons = [
  'Item unavailable',
  'Guest cancelled this item',
  'Duplicate item',
  'Wrong item selected',
  'Kitchen cannot fulfill this item',
  'Other',
];

function money(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100);
}

function formatDateTime(value: string) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function label(value: string) {
  return value.replaceAll('_', ' ');
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getStatusClass(status: OrderStatus) {
  if (status === 'DELIVERED') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'CANCELLED') {
    return 'bg-red-100 text-red-700';
  }

  if (status === 'PREPARING' || status === 'READY') {
    return 'bg-amber-100 text-amber-800';
  }

  if (status === 'ACCEPTED') {
    return 'bg-blue-100 text-blue-700';
  }

  return 'bg-neutral-100 text-neutral-700';
}

function getItemStatusClass(status?: OrderItemStatus) {
  if (status === 'CANCELLED') {
    return 'bg-red-100 text-red-700';
  }

  if (status === 'PARTIALLY_CANCELLED') {
    return 'bg-amber-100 text-amber-800';
  }

  return 'bg-emerald-100 text-emerald-700';
}

function getPaymentClass(status: PaymentStatus) {
  if (status === 'PAID') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'REFUND_PENDING') {
    return 'bg-amber-100 text-amber-800';
  }

  if (status === 'PARTIALLY_REFUNDED' || status === 'REFUNDED') {
    return 'bg-blue-100 text-blue-700';
  }

  return 'bg-red-100 text-red-700';
}

function isFinanciallySettled(status: PaymentStatus) {
  return status !== 'UNPAID';
}

function canManuallyMarkPaid(order: DashboardOrder) {
  return order.paymentStatus === 'UNPAID' && order.paymentMethod !== 'XENDIT';
}

function canStartOrderProcessing(order: DashboardOrder) {
  if (order.paymentMethod !== 'XENDIT') {
    return true;
  }

  return (
    order.paymentStatus === 'PAID' ||
    order.paymentStatus === 'PARTIALLY_REFUNDED'
  );
}

function getStaffReviewItems(order: DashboardOrder) {
  const activeItems = getItemCount(order.items);
  const paymentReady = canStartOrderProcessing(order);

  return [
    {
      label: 'Payment verification',
      ready: paymentReady,
      detail:
        order.paymentMethod === 'XENDIT'
          ? paymentReady
            ? 'Verified Xendit payment received.'
            : 'Wait for the Xendit webhook before preparing.'
          : `${label(order.paymentMethod)} follows the hotel collection workflow.`,
    },
    {
      label: 'Active items',
      ready: activeItems > 0,
      detail:
        activeItems > 0
          ? `${activeItems} active item${activeItems === 1 ? '' : 's'} to fulfill.`
          : 'No active items remain in this order.',
    },
    {
      label: 'Processing stage',
      ready: order.status !== 'DELIVERED' && order.status !== 'CANCELLED',
      detail:
        order.status === 'PENDING'
          ? 'Review the order, then accept it for preparation.'
          : `Current stage: ${label(order.status)}.`,
    },
  ];
}

function getNextActions(status: OrderStatus) {
  if (status === 'PENDING') {
    return [
      {
        status: 'PREPARING' as OrderStatus,
        label: 'Accept & Prepare',
        className: 'bg-black text-white hover:bg-neutral-800',
      },
      {
        status: 'CANCELLED' as OrderStatus,
        label: 'Reject',
        className: 'bg-red-600 text-white hover:bg-red-700',
      },
    ];
  }

  if (status === 'ACCEPTED') {
    return [
      {
        status: 'PREPARING' as OrderStatus,
        label: 'Start',
        className: 'bg-amber-500 text-white hover:bg-amber-600',
      },
      {
        status: 'CANCELLED' as OrderStatus,
        label: 'Cancel',
        className: 'bg-red-600 text-white hover:bg-red-700',
      },
    ];
  }

  if (status === 'PREPARING') {
    return [
      {
        status: 'READY' as OrderStatus,
        label: 'Ready',
        className: 'bg-amber-500 text-white hover:bg-amber-600',
      },
      {
        status: 'CANCELLED' as OrderStatus,
        label: 'Cancel',
        className: 'bg-red-600 text-white hover:bg-red-700',
      },
    ];
  }

  if (status === 'READY') {
    return [
      {
        status: 'DELIVERED' as OrderStatus,
        label: 'Delivered',
        className: 'bg-emerald-600 text-white hover:bg-emerald-700',
      },
      {
        status: 'CANCELLED' as OrderStatus,
        label: 'Cancel',
        className: 'bg-red-600 text-white hover:bg-red-700',
      },
    ];
  }

  return [];
}

function getActiveItemQuantity(item: OrderItem) {
  return Math.max(item.quantity - (item.cancelledQty ?? 0), 0);
}

function getItemCount(items: OrderItem[]) {
  return items.reduce((sum, item) => sum + getActiveItemQuantity(item), 0);
}

function getOrderPreview(items: OrderItem[]) {
  const activeItems = items.filter((item) => getActiveItemQuantity(item) > 0);

  if (!activeItems.length) {
    return 'All items cancelled';
  }

  const preview = activeItems
    .slice(0, 2)
    .map((item) => `${getActiveItemQuantity(item)}× ${item.productNameSnapshot}`)
    .join(', ');

  return `${preview}${
    activeItems.length > 2 ? ` +${activeItems.length - 2} more` : ''
  }`;
}

function getCurrentStatusStartedAt(order: DashboardOrder) {
  const history = [...order.statusHistory]
    .reverse()
    .find((item) => item.status === order.status);

  return history?.createdAt ?? order.createdAt;
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function getOrderAgeLabel(order: DashboardOrder, now: number) {
  const startAt = getCurrentStatusStartedAt(order);
  const endAt = activeOrderStatuses.includes(order.status)
    ? now
    : new Date(order.updatedAt).getTime();

  return formatDuration(endAt - new Date(startAt).getTime());
}

function getOrderAgeClass(order: DashboardOrder, now: number) {
  if (!activeOrderStatuses.includes(order.status)) {
    return 'bg-neutral-100 text-neutral-600';
  }

  const startAt = getCurrentStatusStartedAt(order);
  const minutes = Math.floor((now - new Date(startAt).getTime()) / 60000);

  if (minutes >= 45) {
    return 'bg-red-100 text-red-700';
  }

  if (minutes >= 20) {
    return 'bg-amber-100 text-amber-800';
  }

  return 'bg-blue-100 text-blue-700';
}

function getOrderTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareOrdersNewestFirst(
  left: DashboardOrder,
  right: DashboardOrder
) {
  const createdDifference =
    getOrderTimestamp(right.createdAt) - getOrderTimestamp(left.createdAt);

  if (createdDifference !== 0) {
    return createdDifference;
  }

  const updatedDifference =
    getOrderTimestamp(right.updatedAt) - getOrderTimestamp(left.updatedAt);

  if (updatedDifference !== 0) {
    return updatedDifference;
  }

  return right.orderCode.localeCompare(left.orderCode);
}

function buildPrintableReceiptHtml(order: DashboardOrder) {
  const itemRows = order.items
    .map((item) => {
      const activeQty = getActiveItemQuantity(item);
      const isCancelled = activeQty <= 0 || item.status === 'CANCELLED';

      const bundleRows = item.isBundleSnapshot
        ? `
          <div style="margin:6px 0 0 16px;font-size:12px;color:#555;">
            <strong>Includes:</strong>
            ${(item.bundleComponents ?? [])
              .map(
                (component) =>
                  `<div>${escapeHtml(component.quantity)}× ${escapeHtml(
                    component.componentNameSnapshot
                  )}</div>`
              )
              .join('')}
          </div>
        `
        : '';

      return `
        <div style="border-bottom:1px solid #eee;padding:8px 0;opacity:${
          isCancelled ? 0.55 : 1
        };">
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <div>
              <strong>${escapeHtml(activeQty)}× ${escapeHtml(
                item.productNameSnapshot
              )}</strong>
              ${
                item.isBundleSnapshot
                  ? '<span style="margin-left:6px;font-size:10px;background:#fef3c7;padding:2px 6px;border-radius:999px;">Bundle</span>'
                  : ''
              }
              ${
                isCancelled
                  ? '<span style="margin-left:6px;font-size:10px;background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:999px;">Cancelled</span>'
                  : ''
              }
              ${
                item.notes
                  ? `<div style="font-size:12px;color:#555;margin-top:3px;">Note: ${escapeHtml(
                      item.notes
                    )}</div>`
                  : ''
              }
              ${
                item.cancelReason
                  ? `<div style="font-size:12px;color:#991b1b;margin-top:3px;">Cancel reason: ${escapeHtml(
                      item.cancelReason
                    )}</div>`
                  : ''
              }
              ${bundleRows}
            </div>
            <strong>${escapeHtml(money(activeQty * item.unitPriceCents))}</strong>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <title>Receipt ${escapeHtml(order.orderCode)}</title>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 24px;
            color: #111;
          }
          .header {
            border-bottom: 2px solid #111;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .muted {
            color: #666;
            font-size: 13px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin: 6px 0;
          }
          .total {
            border-top: 2px solid #111;
            padding-top: 8px;
            margin-top: 8px;
            font-size: 18px;
            font-weight: 800;
          }
          @media print {
            button {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <button onclick="window.print()" style="margin-bottom:16px;padding:10px 14px;border-radius:10px;border:1px solid #ddd;background:#111;color:#fff;font-weight:700;">
          Print
        </button>

        <div class="header">
          <h1 style="margin:0;">CloudView Order Receipt</h1>
          <div class="muted">Order Code: ${escapeHtml(order.orderCode)}</div>
          <div class="muted">Hotel: ${escapeHtml(order.hotelName)}</div>
          <div class="muted">Room / Location: ${escapeHtml(order.roomLabel)}</div>
          <div class="muted">Ordered: ${escapeHtml(formatDateTime(order.createdAt))}</div>
        </div>

        <div>
          <div><strong>Status:</strong> ${escapeHtml(label(order.status))}</div>
          <div><strong>Payment:</strong> ${escapeHtml(
            label(order.paymentMethod)
          )} · ${escapeHtml(label(order.paymentStatus))}</div>
          ${
            order.guestName
              ? `<div><strong>Guest:</strong> ${escapeHtml(order.guestName)}</div>`
              : ''
          }
          ${
            order.guestPhone
              ? `<div><strong>Phone:</strong> ${escapeHtml(order.guestPhone)}</div>`
              : ''
          }
          ${
            order.notes
              ? `<div style="margin-top:8px;"><strong>Notes:</strong><br/>${escapeHtml(
                  order.notes
                ).replaceAll('\n', '<br/>')}</div>`
              : ''
          }
        </div>

        <h3 style="margin-top:20px;">Items</h3>
        ${itemRows}

        <div style="margin-top:16px;">
          <div class="row"><span>Subtotal</span><strong>${escapeHtml(
            money(order.subtotalCents)
          )}</strong></div>
          <div class="row"><span>Service Charge</span><strong>${escapeHtml(
            money(order.serviceChargeCents)
          )}</strong></div>
          <div class="row"><span>Tax</span><strong>${escapeHtml(
            money(order.taxCents)
          )}</strong></div>
          <div class="row total"><span>Total</span><span>${escapeHtml(
            money(order.totalCents)
          )}</span></div>
        </div>
      </body>
    </html>
  `;
}

function printOrder(order: DashboardOrder) {
  const printWindow = window.open('', '_blank', 'width=820,height=720');

  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildPrintableReceiptHtml(order));
  printWindow.document.close();
  printWindow.focus();
}

function Toast({ message }: { message?: Message }) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }

    setVisible(true);

    const timeout = window.setTimeout(() => {
      setVisible(false);
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [message?.text, message?.type]);

  if (!message || !visible) {
    return null;
  }

  return (
    <div className="fixed right-5 top-5 z-[90] w-[calc(100vw-2.5rem)] max-w-md">
      <div
        className={
          message.type === 'success'
            ? 'flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-2xl'
            : 'flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-2xl'
        }
      >
        <div
          className={
            message.type === 'success'
              ? 'grid size-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white'
              : 'grid size-9 shrink-0 place-items-center rounded-full bg-red-600 text-white'
          }
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <X className="size-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">
            {message.type === 'success' ? 'Success' : 'Action failed'}
          </p>
          <p className="mt-1 text-sm font-bold leading-6">{message.text}</p>
        </div>

        <button
          type="button"
          onClick={() => setVisible(false)}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 hover:bg-white"
          aria-label="Close notification"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'green' | 'red' | 'blue';
}) {
  return (
    <div
      className={
        tone === 'green'
          ? 'rounded-3xl border border-emerald-200 bg-emerald-50 p-5'
          : tone === 'red'
            ? 'rounded-3xl border border-red-200 bg-red-50 p-5'
            : tone === 'blue'
              ? 'rounded-3xl border border-blue-200 bg-blue-50 p-5'
              : 'rounded-3xl border border-neutral-200 bg-white p-5'
      }
    >
      <p
        className={
          tone === 'green'
            ? 'text-sm font-bold text-emerald-700'
            : tone === 'red'
              ? 'text-sm font-bold text-red-700'
              : tone === 'blue'
                ? 'text-sm font-bold text-blue-700'
                : 'text-sm font-bold text-neutral-500'
        }
      >
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function OrderItemsList({
  order,
  onCancelItem,
}: {
  order: DashboardOrder;
  onCancelItem: (item: OrderItem) => void;
}) {
  return (
    <div className="space-y-2">
      {order.items.map((item) => {
        const activeQty = getActiveItemQuantity(item);
        const isCancelled = activeQty <= 0 || item.status === 'CANCELLED';
        const canCancel =
          order.status === 'PENDING' && !isCancelled && activeQty > 0;

        return (
          <div
            key={item.id}
            className={
              isCancelled
                ? 'rounded-2xl bg-red-50 p-3 text-sm opacity-80'
                : 'rounded-2xl bg-neutral-50 p-3 text-sm'
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black text-neutral-950">
                    {activeQty}× {item.productNameSnapshot}
                  </p>

                  {item.isBundleSnapshot ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                      Bundle
                    </span>
                  ) : null}

                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black ${getItemStatusClass(
                      item.status
                    )}`}
                  >
                    {label(item.status ?? 'ACTIVE')}
                  </span>
                </div>

                {item.cancelledQty ? (
                  <p className="mt-1 text-xs font-bold text-red-700">
                    Cancelled quantity: {item.cancelledQty}
                  </p>
                ) : null}

                {item.cancelReason ? (
                  <p className="mt-1 text-xs font-medium text-red-700">
                    Reason: {item.cancelReason}
                  </p>
                ) : null}

                {item.notes ? (
                  <p className="mt-1 text-xs font-medium text-neutral-500">
                    Note: {item.notes}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <p className="font-black">
                  {money(activeQty * item.unitPriceCents)}
                </p>

                {canCancel ? (
                  <button
                    type="button"
                    onClick={() => onCancelItem(item)}
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-red-600 px-3 text-[10px] font-black text-white hover:bg-red-700"
                  >
                    <Ban className="size-3" />
                    Cancel Item
                  </button>
                ) : null}
              </div>
            </div>

            {item.isBundleSnapshot ? (
              <div className="mt-3 rounded-xl bg-amber-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">
                  Includes
                </p>

                {item.bundleComponents?.length ? (
                  <div className="mt-2 space-y-1">
                    {item.bundleComponents.map((component) => (
                      <p
                        key={component.id}
                        className="text-xs font-bold text-amber-900"
                      >
                        {component.quantity}× {component.componentNameSnapshot}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-bold text-amber-800">
                    No bundle component snapshot.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function OrderTimeline({ history }: { history: OrderStatusHistory[] }) {
  if (!history.length) {
    return null;
  }

  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-neutral-400">
        Status History
      </p>

      <div className="space-y-2">
        {history.map((item) => (
          <div key={item.id} className="text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-black text-neutral-800">
                {label(item.status)}
              </p>
              <p className="font-semibold text-neutral-400">
                {formatDateTime(item.createdAt)}
              </p>
            </div>

            {item.userName || item.note ? (
              <p className="mt-1 text-neutral-500">
                {item.userName ? `By ${item.userName}` : ''}
                {item.userName && item.note ? ' · ' : ''}
                {item.note}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function RestoreAudit({ movements }: { movements: RestoreMovement[] }) {
  if (!movements.length) {
    return (
      <div className="rounded-2xl bg-neutral-50 p-4 text-sm font-bold text-neutral-500">
        No stock restore movement was recorded for this cancelled order yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <RotateCcw className="size-4 text-emerald-700" />
        <p className="text-sm font-black text-emerald-800">
          Stock Restore Audit
        </p>
      </div>

      <div className="space-y-2">
        {movements.map((movement) => (
          <div
            key={movement.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/75 p-3 text-sm"
          >
            <div>
              <p className="font-black text-neutral-900">
                +{movement.quantity} {movement.productName}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-neutral-500">
                {movement.type.replaceAll('_', ' ')} ·{' '}
                {formatDateTime(movement.createdAt)}
              </p>
            </div>

            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
              Balance: {movement.balanceAfter}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CancelSubmitButton({
  label = 'Confirm Cancel',
}: {
  label?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-2xl bg-red-600 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Cancelling...' : label}
    </button>
  );
}

function CancelOrderItemModal({
  order,
  item,
  onClose,
  action,
}: {
  order: DashboardOrder;
  item: OrderItem;
  onClose: () => void;
  action: ClientOrderAction;
}) {
  const [reason, setReason] = useState(cancelReasons[0]);
  const [customReason, setCustomReason] = useState('');

  const finalReason =
    reason === 'Other' ? customReason.trim() || 'Other' : reason;

    async function handleCancelItem(formData: FormData) {
  await action(formData);
  onClose();
}

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Cancel Food Item</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Cancel <b>{item.productNameSnapshot}</b> from order{' '}
              <b>{order.orderCode}</b>.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full bg-neutral-100 hover:bg-neutral-200"
            aria-label="Close cancel item modal"
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={handleCancelItem} className="space-y-4">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="orderItemId" value={item.id} />
          <input type="hidden" name="reason" value={finalReason} />

          <label className="grid gap-2">
            <span className="text-sm font-black text-neutral-800">
              Cancellation Reason
            </span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none"
            >
              {cancelReasons.map((itemReason) => (
                <option key={itemReason} value={itemReason}>
                  {itemReason}
                </option>
              ))}
            </select>
          </label>

          {reason === 'Other' ? (
            <label className="grid gap-2">
              <span className="text-sm font-black text-neutral-800">
                Custom Reason
              </span>
              <textarea
                value={customReason}
                onChange={(event) => setCustomReason(event.target.value)}
                placeholder="Type reason..."
                className="min-h-24 resize-none rounded-2xl border border-neutral-200 bg-white p-4 text-sm font-semibold outline-none"
              />
            </label>
          ) : null}

          <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            This cancels only this food item. Stock is restored automatically.
            For a paid Xendit order, CloudView also requests the matching
            partial refund through Xendit.
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-2xl border border-neutral-200 bg-white text-sm font-black hover:bg-neutral-50"
            >
              Close
            </button>

            <CancelSubmitButton />
          </div>
        </form>
      </div>
    </div>
  );
}

function CancelOrderModal({
  order,
  onClose,
  action,
}: {
  order: DashboardOrder;
  onClose: () => void;
  action: ClientOrderAction;
}) {
  const wholeOrderReasons = [
    'Item unavailable',
    'Guest cancelled',
    'Duplicate order',
    'Payment issue',
    'Kitchen cannot fulfill',
    'Wrong room or location',
    'Other',
  ];

  const [reason, setReason] = useState(wholeOrderReasons[0]);
  const [customReason, setCustomReason] = useState('');

  const finalReason =
    reason === 'Other' ? customReason.trim() || 'Other' : reason;

    async function handleCancelOrder(formData: FormData) {
  await action(formData);
  onClose();
}

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Cancel / Reject Order</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Please provide a reason for cancelling {order.orderCode}.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full bg-neutral-100 hover:bg-neutral-200"
            aria-label="Close modal"
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={handleCancelOrder} className="space-y-4">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="redirectTo" value="orders" />
          <input type="hidden" name="status" value="CANCELLED" />
          <input
            type="hidden"
            name="note"
            value={`Cancelled reason: ${finalReason}`}
          />

          <label className="grid gap-2">
            <span className="text-sm font-black text-neutral-800">
              Cancellation Reason
            </span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none"
            >
              {wholeOrderReasons.map((itemReason) => (
                <option key={itemReason} value={itemReason}>
                  {itemReason}
                </option>
              ))}
            </select>
          </label>

          {reason === 'Other' ? (
            <label className="grid gap-2">
              <span className="text-sm font-black text-neutral-800">
                Custom Reason
              </span>
              <textarea
                value={customReason}
                onChange={(event) => setCustomReason(event.target.value)}
                placeholder="Type cancellation reason..."
                className="min-h-24 resize-none rounded-2xl border border-neutral-200 p-4 text-sm font-bold outline-none"
              />
            </label>
          ) : null}

          <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            Cancelling this order restores its deducted stock. When the order
            was paid through Xendit, CloudView also requests the remaining
            refundable balance automatically.
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-2xl border border-neutral-200 bg-white text-sm font-black hover:bg-neutral-50"
            >
              Close
            </button>

           <CancelSubmitButton />
          </div>
        </form>
      </div>
    </div>
  );
}

function OrderDetailsModal({
  order,
  now,
  onClose,
  onCancel,
  onMarkPaid,
  onStatusChange,
  onCancelItemAction,
}: {
  order: DashboardOrder;
  now: number;
  onClose: () => void;
  onCancel: (order: DashboardOrder) => void;
  onMarkPaid: ClientOrderAction;
  onStatusChange: ClientOrderAction;
  onCancelItemAction: ClientOrderAction;
}) {
  const [cancelItem, setCancelItem] = useState<OrderItem | null>(null);
  const nextActions = getNextActions(order.status);
  const staffReviewItems = getStaffReviewItems(order);
  const canProcess = canStartOrderProcessing(order);

  return (
    <>
      <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 px-4">
        <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
          <div className="sticky top-0 z-10 border-b border-neutral-100 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-black">{order.orderCode}</h2>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${getStatusClass(
                      order.status
                    )}`}
                  >
                    {label(order.status)}
                  </span>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${getPaymentClass(
                      order.paymentStatus
                    )}`}
                  >
                    {label(order.paymentStatus)}
                  </span>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${getOrderAgeClass(
                      order,
                      now
                    )}`}
                  >
                    {activeOrderStatuses.includes(order.status)
                      ? `Waiting ${getOrderAgeLabel(order, now)}`
                      : `Duration ${getOrderAgeLabel(order, now)}`}
                  </span>
                </div>

                <p className="mt-1 text-sm font-semibold text-neutral-500">
                  {order.hotelName} · {order.roomLabel} ·{' '}
                  {order.tagCode ? 'Guest Portal' : 'POS Terminal'}
                </p>

                <p className="mt-1 text-xs font-bold text-neutral-400">
                  Ordered {formatDateTime(order.createdAt)}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 hover:bg-neutral-200"
                aria-label="Close details"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-black text-neutral-950">
                  Ordered Items
                </p>
                <OrderItemsList order={order} onCancelItem={setCancelItem} />
              </div>

              {order.guestName || order.guestPhone || order.notes ? (
                <div className="rounded-2xl bg-neutral-50 p-4 text-sm">
                  {order.guestName ? (
                    <p>
                      <b>Guest:</b> {order.guestName}
                    </p>
                  ) : null}

                  {order.guestPhone ? (
                    <p className="mt-1">
                      <b>Phone:</b> {order.guestPhone}
                    </p>
                  ) : null}

                  {order.notes ? (
                    <p className="mt-2 whitespace-pre-line">
                      <b>Notes:</b> {order.notes}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {order.restoreMovements?.length || order.status === 'CANCELLED' ? (
                <RestoreAudit movements={order.restoreMovements ?? []} />
              ) : null}

              <OrderTimeline history={order.statusHistory} />
            </div>

            <aside className="space-y-3">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm font-black text-blue-950">
                  Staff Review Checklist
                </p>
                <p className="mt-1 text-xs font-semibold text-blue-700">
                  Review these requirements before preparing the order.
                </p>

                <div className="mt-3 space-y-2">
                  {staffReviewItems.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl bg-white/80 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <b className="text-neutral-900">{item.label}</b>
                        <span
                          className={
                            item.ready
                              ? 'rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700'
                              : 'rounded-full bg-red-100 px-2 py-1 text-[10px] font-black text-red-700'
                          }
                        >
                          {item.ready ? 'READY' : 'REVIEW'}
                        </span>
                      </div>
                      <p className="mt-1 font-semibold text-neutral-500">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-neutral-50 p-4">
                <p className="text-sm font-black text-neutral-950">
                  Price Breakdown
                </p>

                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Subtotal</span>
                    <b>{money(order.subtotalCents)}</b>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-neutral-500">Service Charge</span>
                    <b>{money(order.serviceChargeCents)}</b>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-neutral-500">Tax</span>
                    <b>{money(order.taxCents)}</b>
                  </div>

                  <div className="border-t border-neutral-200 pt-2">
                    <div className="flex justify-between text-base">
                      <span className="font-black">Total</span>
                      <span className="font-black">
                        {money(order.totalCents)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {order.paymentMethod === 'XENDIT' ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-black text-amber-900">
                    Xendit online payment
                  </p>
                  <p className="mt-1 text-xs font-bold text-amber-700">
                    Payment: {label(order.paymentStatus)}
                  </p>
                  {order.refundedAmountCents ? (
                    <p className="mt-2 text-xs font-black text-blue-700">
                      Refunded: {money(order.refundedAmountCents)}
                    </p>
                  ) : null}
                  {order.refundErrorMessage ? (
                    <p className="mt-2 rounded-xl bg-red-100 p-2 text-xs font-bold text-red-700">
                      {order.refundErrorMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => printOrder(order)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white text-sm font-black hover:bg-neutral-50"
              >
                <Printer className="size-4" />
                Print Receipt
              </button>

              {canManuallyMarkPaid(order) ? (
                <form action={onMarkPaid}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="redirectTo" value="orders" />  
                  <button
                    type="submit"
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-black text-white hover:bg-emerald-700"
                  >
                    <CreditCard className="size-4" />
                    Mark Paid
                  </button>
                </form>
              ) : null}

              {nextActions.length ? (
                <div className="grid gap-2">
                  {nextActions.map((action) =>
                    action.status === 'CANCELLED' ? (
                      <button
                        key={`${order.id}-${action.status}`}
                        type="button"
                        onClick={() => onCancel(order)}
                        className={`flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black ${action.className}`}
                      >
                        <Ban className="size-4" />
                        {action.label}
                      </button>
                    ) : (
                     <form
                          key={`${order.id}-${action.status}`}
                          action={onStatusChange}
                        >
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="redirectTo" value="orders" />
                        <input
                          type="hidden"
                          name="status"
                          value={action.status}
                        />
                        <input
                          type="hidden"
                          name="note"
                          value={`Dashboard status changed to ${label(
                            action.status
                          )}`}
                        />

                        <button
                          type="submit"
                          disabled={!canProcess}
                          title={
                            canProcess
                              ? undefined
                              : 'Wait for verified Xendit payment before preparing.'
                          }
                          className={`flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black disabled:cursor-not-allowed disabled:opacity-45 ${action.className}`}
                        >
                          {action.status === 'ACCEPTED' ? (
                            <CheckCircle2 className="size-4" />
                          ) : action.status === 'PREPARING' ? (
                            <ChefHat className="size-4" />
                          ) : action.status === 'READY' ? (
                            <PackageCheck className="size-4" />
                          ) : action.status === 'DELIVERED' ? (
                            <Truck className="size-4" />
                          ) : (
                            <Utensils className="size-4" />
                          )}
                          {action.label}
                        </button>
                      </form>
                    )
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-neutral-50 p-4 text-sm font-bold text-neutral-500">
                  This order is already {label(order.status).toLowerCase()}.
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>

      {cancelItem ? (
        <CancelOrderItemModal
              order={order}
              item={cancelItem}
              onClose={() => setCancelItem(null)}
              action={onCancelItemAction}
            />
      ) : null}
    </>
  );
}


const workflowSteps: OrderStatus[] = [
  'PENDING',
  'PREPARING',
  'READY',
  'DELIVERED',
];

const statusToneMap: Record<OrderStatus, string> = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-900',
  ACCEPTED: 'border-blue-200 bg-blue-50 text-blue-900',
  PREPARING: 'border-sky-200 bg-sky-50 text-sky-900',
  READY: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  DELIVERED: 'border-neutral-200 bg-neutral-50 text-neutral-900',
  CANCELLED: 'border-red-200 bg-red-50 text-red-900',
};

const statusAccentMap: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-500',
  ACCEPTED: 'bg-blue-500',
  PREPARING: 'bg-sky-500',
  READY: 'bg-emerald-500',
  DELIVERED: 'bg-neutral-500',
  CANCELLED: 'bg-red-500',
};

function getSourceLabel(order: DashboardOrder) {
  return order.tagCode ? 'Guest Portal' : 'POS Terminal';
}

function getWorkflowProgressIndex(status: OrderStatus) {
  const workflowStatus = status === 'ACCEPTED' ? 'PREPARING' : status;

  return Math.max(workflowSteps.indexOf(workflowStatus), 0);
}

function getOrderFocusLabel(order: DashboardOrder) {
  if (order.status === 'PENDING') {
    return 'Needs acceptance';
  }

  if (order.status === 'READY') {
    return 'Ready for delivery';
  }

  if (order.paymentStatus === 'REFUND_PENDING') {
    return 'Refund pending';
  }

  if (order.paymentStatus === 'REFUND_FAILED') {
    return 'Refund needs review';
  }

  if (order.paymentStatus === 'PARTIALLY_REFUNDED') {
    return 'Partially refunded';
  }

  if (order.paymentStatus === 'REFUNDED') {
    return 'Refunded';
  }

  if (order.paymentStatus === 'UNPAID') {
    return 'Payment pending';
  }

  if (order.status === 'PREPARING') {
    return 'Kitchen active';
  }

  if (order.status === 'ACCEPTED') {
    return 'Kitchen active';
  }

  if (order.status === 'DELIVERED') {
    return 'Completed';
  }

  return 'Cancelled';
}

function getPrimaryNextStatus(status: OrderStatus): OrderStatus | null {
  if (status === 'PENDING') {
    return 'PREPARING';
  }

  if (status === 'ACCEPTED') {
    return 'PREPARING';
  }

  if (status === 'PREPARING') {
    return 'READY';
  }

  if (status === 'READY') {
    return 'DELIVERED';
  }

  return null;
}

function getPrimaryActionText(status: OrderStatus) {
  if (status === 'PENDING') {
    return 'Accept & Prepare';
  }

  if (status === 'ACCEPTED') {
    return 'Start Prep';
  }

  if (status === 'PREPARING') {
    return 'Mark Ready';
  }

  if (status === 'READY') {
    return 'Deliver';
  }

  return 'No action';
}

function OrderMetricTile({
  icon,
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  helper: string;
  tone?: 'neutral' | 'green' | 'red' | 'blue' | 'amber';
}) {
  const tileClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-900'
        : tone === 'blue'
          ? 'border-blue-200 bg-blue-50 text-blue-900'
          : tone === 'amber'
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-neutral-200 bg-white text-neutral-950';

  const iconClass =
    tone === 'green'
      ? 'bg-emerald-100 text-emerald-700'
      : tone === 'red'
        ? 'bg-red-100 text-red-700'
        : tone === 'blue'
          ? 'bg-blue-100 text-blue-700'
          : tone === 'amber'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-[#fff8e7] text-[#b88938]';

  return (
    <div className={`rounded-[1.75rem] border p-4 ${tileClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
            {label}
          </p>
          <p className="mt-2 text-3xl font-black">{value}</p>
          <p className="mt-1 text-xs font-bold opacity-70">{helper}</p>
        </div>

        <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${iconClass}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

function WorkflowProgress({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED') {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
        <p className="text-xs font-black text-red-700">Order cancelled</p>
      </div>
    );
  }

  const currentIndex = getWorkflowProgressIndex(status);

  return (
    <div className="grid grid-cols-5 gap-1">
      {workflowSteps.map((step, index) => {
        const isActive = index <= currentIndex;

        return (
          <div key={step} className="space-y-1">
            <div
              className={
                isActive
                  ? `h-1.5 rounded-full ${statusAccentMap[step]}`
                  : 'h-1.5 rounded-full bg-neutral-200'
              }
            />
            <p
              className={
                index === currentIndex
                  ? 'truncate text-[9px] font-black uppercase text-neutral-900'
                  : 'truncate text-[9px] font-black uppercase text-neutral-400'
              }
            >
              {label(step)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function OrderActionButton({
  order,
  status,
  action,
  children,
  className,
  disabled = false,
}: {
  order: DashboardOrder;
  status: OrderStatus;
  action: ClientOrderAction;
  children: ReactNode;
  className: string;
  disabled?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="redirectTo" value="orders" />
      <input type="hidden" name="status" value={status} />
      <input
        type="hidden"
        name="note"
        value={`Dashboard status changed to ${label(status)}`}
      />
      <button
        type="submit"
        disabled={disabled}
        className={`${className} disabled:cursor-not-allowed disabled:opacity-45`}
      >
        {children}
      </button>
    </form>
  );
}

function MarkPaidButton({
  order,
  action,
  compact = false,
}: {
  order: DashboardOrder;
  action: ClientOrderAction;
  compact?: boolean;
}) {
  if (!canManuallyMarkPaid(order)) {
    return null;
  }

  return (
    <form action={action}>
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="redirectTo" value="orders" />
      <button
        type="submit"
        className={
          compact
            ? 'inline-flex h-9 items-center justify-center gap-2 rounded-full bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700'
            : 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700'
        }
      >
        <CreditCard className={compact ? 'size-3.5' : 'size-4'} />
        Mark Paid
      </button>
    </form>
  );
}

function OrderCard({
  order,
  now,
  onView,
  onPrint,
  onMarkPaid,
  onStatusChange,
  onCancel,
}: {
  order: DashboardOrder;
  now: number;
  onView: () => void;
  onPrint: () => void;
  onMarkPaid: ClientOrderAction;
  onStatusChange: ClientOrderAction;
  onCancel: () => void;
}) {
  const itemCount = getItemCount(order.items);
  const preview = getOrderPreview(order.items);
  const waitingLabel = getOrderAgeLabel(order, now);
  const nextStatus = getPrimaryNextStatus(order.status);
  const canProcess = canStartOrderProcessing(order);
  const hasAction = Boolean(nextStatus) && canProcess;
  const isAttentionOrder =
    order.status === 'PENDING' ||
    order.status === 'READY' ||
    order.paymentStatus === 'UNPAID';

  return (
    <article
      className={
        isAttentionOrder
          ? `overflow-hidden rounded-[1.75rem] border bg-white shadow-sm ${statusToneMap[order.status]}`
          : 'overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-sm'
      }
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-xl font-black text-neutral-950">
                {order.orderCode}
              </h3>

              <span
                className={`rounded-full px-3 py-1 text-[10px] font-black ${getStatusClass(
                  order.status
                )}`}
              >
                {label(order.status)}
              </span>
            </div>

            <p className="mt-1 truncate text-xs font-black uppercase tracking-wide text-neutral-500">
              {order.roomLabel || 'Guest location'} ·{' '}
              {order.guestName || 'Guest name not provided'}
            </p>

            <p className="mt-1 text-xs font-semibold text-neutral-400">
              {order.hotelName} · {getSourceLabel(order)}
            </p>
          </div>

          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black ${getOrderAgeClass(
              order,
              now
            )}`}
          >
            {activeOrderStatuses.includes(order.status)
              ? `Waiting ${waitingLabel}`
              : `Duration ${waitingLabel}`}
          </span>
        </div>

        <div className="mt-4">
          <WorkflowProgress status={order.status} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/70 p-3">
            <p className="text-[10px] font-black uppercase text-neutral-400">
              Total
            </p>
            <p className="mt-1 text-sm font-black text-neutral-950">
              {money(order.totalCents)}
            </p>
          </div>

          <div className="rounded-2xl bg-white/70 p-3">
            <p className="text-[10px] font-black uppercase text-neutral-400">
              Payment
            </p>
            <p className="mt-1 truncate text-sm font-black text-neutral-950">
              {label(order.paymentMethod)}
            </p>
          </div>

          <div className="rounded-2xl bg-white/70 p-3">
            <p className="text-[10px] font-black uppercase text-neutral-400">
              Items
            </p>
            <p className="mt-1 text-sm font-black text-neutral-950">
              {itemCount}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-2xl bg-white/70 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black ${getPaymentClass(
                order.paymentStatus
              )}`}
            >
              {label(order.paymentStatus)}
            </span>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black text-neutral-600">
              {getOrderFocusLabel(order)}
            </span>
          </div>

          <p className="mt-2 line-clamp-2 text-xs font-bold leading-5 text-neutral-600">
            {preview}
          </p>
        </div>

        {!canProcess && order.paymentMethod === 'XENDIT' ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
            Kitchen processing is locked until Xendit confirms the payment.
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 border-t border-neutral-100 bg-white p-3 sm:grid-cols-2">
        {hasAction && nextStatus ? (
          <OrderActionButton
            order={order}
            status={nextStatus}
            action={onStatusChange}
            disabled={!canProcess}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-black text-xs font-black text-white hover:bg-neutral-800"
          >
            {nextStatus === 'ACCEPTED' ? (
              <CheckCircle2 className="size-4" />
            ) : nextStatus === 'PREPARING' ? (
              <ChefHat className="size-4" />
            ) : nextStatus === 'READY' ? (
              <PackageCheck className="size-4" />
            ) : (
              <Truck className="size-4" />
            )}
            {getPrimaryActionText(order.status)}
          </OrderActionButton>
        ) : (
          <button
            type="button"
            onClick={onView}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-black text-xs font-black text-white hover:bg-neutral-800"
          >
            View Details
          </button>
        )}

        <button
          type="button"
          onClick={onView}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white text-xs font-black text-neutral-800 hover:bg-neutral-50"
        >
          <ReceiptText className="size-4" />
          Details
        </button>

        {order.status === 'PENDING' ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-red-600 text-xs font-black text-white hover:bg-red-700"
          >
            <Ban className="size-4" />
            Reject
          </button>
        ) : null}

        <button
          type="button"
          onClick={onPrint}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white text-xs font-black text-neutral-800 hover:bg-neutral-50"
        >
          <Printer className="size-4" />
          Print
        </button>

        {canManuallyMarkPaid(order) ? (
          <div className="sm:col-span-2">
            <MarkPaidButton order={order} action={onMarkPaid} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PriorityQueue({
  orders,
  now,
  onSelectOrder,
}: {
  orders: DashboardOrder[];
  now: number;
  onSelectOrder: (order: DashboardOrder) => void;
}) {
  const priorityOrders = orders
    .filter(
      (order) =>
        order.status === 'PENDING' ||
        order.status === 'READY' ||
        order.paymentStatus === 'UNPAID'
    )
    .sort(compareOrdersNewestFirst)
    .slice(0, 6);

  return (
    <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
      <section className="rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b88938]">
              Focus Queue
            </p>
            <h3 className="mt-1 text-lg font-black">Needs Attention</h3>
          </div>

          <span className="rounded-full bg-black px-3 py-1 text-xs font-black text-white">
            {priorityOrders.length}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {priorityOrders.length ? (
            priorityOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => onSelectOrder(order)}
                className="block w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-left transition hover:border-[#c99c38] hover:bg-[#fffaf0]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-neutral-950">
                      {order.orderCode}
                    </p>
                    <p className="mt-1 truncate text-[11px] font-black uppercase tracking-wide text-neutral-500">
                      {order.roomLabel || 'Guest location'}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${getStatusClass(
                      order.status
                    )}`}
                  >
                    {label(order.status)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-[9px] font-black ${getPaymentClass(
                      order.paymentStatus
                    )}`}
                  >
                    {label(order.paymentStatus)}
                  </span>

                  <span
                    className={`rounded-full px-2 py-1 text-[9px] font-black ${getOrderAgeClass(
                      order,
                      now
                    )}`}
                  >
                    {getOrderAgeLabel(order, now)}
                  </span>
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-5 text-center">
              <p className="text-sm font-black text-neutral-700">
                No urgent order right now.
              </p>
              <p className="mt-1 text-xs font-semibold text-neutral-500">
                Pending, ready, or unpaid orders will appear here.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
          Status Breakdown
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {statusOptions
            .filter((status) => status !== 'ALL')
            .map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  const firstOrderWithStatus = orders.find(
                    (order) => order.status === status
                  );

                  if (firstOrderWithStatus) {
                    onSelectOrder(firstOrderWithStatus);
                  }
                }}
                disabled={!orders.some((order) => order.status === status)}
                className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-left disabled:cursor-not-allowed disabled:opacity-40"
              >
                <p className="text-[10px] font-black uppercase text-neutral-400">
                  {label(status)}
                </p>
                <p className="mt-1 text-xl font-black text-neutral-950">
                  {orders.filter((order) => order.status === status).length}
                </p>
              </button>
            ))}
        </div>
      </section>
    </aside>
  );
}

export function OrdersClient({
  message,
  summary,
  statusCounts,
  orders,
}: {
  message?: Message;
  summary: Summary;
  statusCounts: StatusCounts;
  orders: DashboardOrder[];
}) {
  const router = useRouter();

  const [localOrders, setLocalOrders] = useState<DashboardOrder[]>(orders);
  const [clientMessage, setClientMessage] = useState<Message>(null);
  const [isMutating, setIsMutating] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<DashboardOrder | null>(
    null
  );
  const [cancelOrder, setCancelOrder] = useState<DashboardOrder | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage, setOrdersPerPage] = useState(6);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const newestOrders = [...orders].sort(compareOrdersNewestFirst);

    setLocalOrders(newestOrders);
    setSelectedOrder((current) =>
      current
        ? newestOrders.find((order) => order.id === current.id) ?? null
        : null
    );
    setCancelOrder((current) =>
      current
        ? newestOrders.find((order) => order.id === current.id) ?? null
        : null
    );
  }, [orders]);

  useEffect(() => {
    function refreshLatestOrders() {
      if (document.visibilityState !== 'visible' || isMutating) {
        return;
      }

      router.refresh();
    }

    const interval = window.setInterval(refreshLatestOrders, 15_000);

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refreshLatestOrders();
      }
    }

    window.addEventListener('focus', refreshLatestOrders);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshLatestOrders);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isMutating, router]);

  const filteredOrders = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return localOrders.filter((order) => {
      const orderText = [
        order.orderCode,
        order.hotelName,
        order.roomLabel,
        order.guestName,
        order.guestPhone,
        order.notes,
        order.status,
        order.paymentStatus,
        order.paymentMethod,
        ...order.items.map((item) => item.productNameSnapshot),
        ...order.items.flatMap((item) =>
          (item.bundleComponents ?? []).map(
            (component) => component.componentNameSnapshot
          )
        ),
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !searchText || orderText.includes(searchText);

      const matchesStatus =
        statusFilter === 'ALL' || order.status === statusFilter;

      const matchesPayment =
        paymentFilter === 'ALL' ||
        (paymentFilter === 'PAID' && isFinanciallySettled(order.paymentStatus)) ||
        (paymentFilter === 'UNPAID' && order.paymentStatus === 'UNPAID');

      return matchesSearch && matchesStatus && matchesPayment;
    });
  }, [localOrders, paymentFilter, search, statusFilter]);

  const sortedOrders = useMemo(
    () => [...filteredOrders].sort(compareOrdersNewestFirst),
    [filteredOrders]
  );

  const totalPages = Math.max(
    1,
    Math.ceil(sortedOrders.length / ordersPerPage)
  );

  const pageStartIndex = (currentPage - 1) * ordersPerPage;
  const pageEndIndex = Math.min(
    pageStartIndex + ordersPerPage,
    sortedOrders.length
  );

  const paginatedOrders = useMemo(
    () => sortedOrders.slice(pageStartIndex, pageEndIndex),
    [pageEndIndex, pageStartIndex, sortedOrders]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [ordersPerPage, paymentFilter, search, statusFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(page, 1), totalPages));
  }, [totalPages]);

  function changePage(page: number) {
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(nextPage);

    window.requestAnimationFrame(() => {
      document
        .getElementById('orders-list')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const attentionCount = localOrders.filter(
    (order) =>
      order.status === 'PENDING' ||
      order.status === 'READY' ||
      order.paymentStatus === 'UNPAID'
  ).length;

  const kitchenQueueCount = localOrders.filter((order) =>
    ['ACCEPTED', 'PREPARING', 'READY'].includes(order.status)
  ).length;

  function getClientActionError(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Something went wrong. Please try again.';
  }

  function updateLocalOrder(
    orderId: string,
    updater: (order: DashboardOrder) => DashboardOrder
  ) {
    setLocalOrders((currentOrders) =>
      currentOrders.map((order) =>
        order.id === orderId ? updater(order) : order
      )
    );

    setSelectedOrder((currentOrder) =>
      currentOrder?.id === orderId ? updater(currentOrder) : currentOrder
    );

    setCancelOrder((currentOrder) =>
      currentOrder?.id === orderId ? updater(currentOrder) : currentOrder
    );
  }

  async function runOrderClientAction({
    formData,
    action,
    successText,
    optimisticUpdate,
  }: {
    formData: FormData;
    action: (formData: FormData) => Promise<unknown>;
    successText: string;
    optimisticUpdate?: () => void;
  }): Promise<boolean> {
    if (isMutating) {
      return false;
    }

    const previousOrders = localOrders;
    const previousSelectedOrder = selectedOrder;
    const previousCancelOrder = cancelOrder;

    setClientMessage(null);
    setIsMutating(true);

    try {
      optimisticUpdate?.();

      await action(formData);

      setClientMessage({
        type: 'success',
        text: successText,
      });

      router.refresh();
      return true;
    } catch (error) {
      setLocalOrders(previousOrders);
      setSelectedOrder(previousSelectedOrder);
      setCancelOrder(previousCancelOrder);

      setClientMessage({
        type: 'error',
        text: getClientActionError(error),
      });

      return false;
    } finally {
      setIsMutating(false);
    }
  }

  async function handleMarkPaid(formData: FormData) {
    const orderId = String(formData.get('orderId') || '');

    await runOrderClientAction({
      formData,
      action: markOrderPaidAction,
      successText: 'Order payment marked as paid.',
      optimisticUpdate: () => {
        updateLocalOrder(orderId, (order) => ({
          ...order,
          paymentStatus: 'PAID',
        }));
      },
    });
  }

  async function handleStatusChange(formData: FormData) {
    const orderId = String(formData.get('orderId') || '');
    const requestedStatus = String(formData.get('status') || '') as OrderStatus;
    const nextStatus = requestedStatus === 'ACCEPTED' ? 'PREPARING' : requestedStatus;
    const currentStatus =
      localOrders.find((order) => order.id === orderId)?.status ?? null;

    await runOrderClientAction({
      formData,
      action: updateOrderStatusAction,
      successText:
        currentStatus === 'PENDING' && nextStatus === 'PREPARING'
          ? 'Order accepted and moved directly to Preparing.'
          : `Order status updated to ${label(nextStatus)}.`,
      optimisticUpdate: () => {
        updateLocalOrder(orderId, (order) => ({
          ...order,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        }));
      },
    });
  }

  async function handleCancelOrderItem(formData: FormData) {
    const orderId = String(formData.get('orderId') || '');
    const orderItemId = String(formData.get('orderItemId') || '');
    const reason = String(formData.get('reason') || 'Cancelled');

    await runOrderClientAction({
      formData,
      action: cancelOrderItemAction,
      successText: 'Food item cancelled.',
      optimisticUpdate: () => {
        updateLocalOrder(orderId, (order) => ({
          ...order,
          items: order.items.map((item) =>
            item.id === orderItemId
              ? {
                  ...item,
                  status: 'CANCELLED',
                  cancelledQty: item.quantity,
                  cancelReason: reason,
                  cancelledAt: new Date().toISOString(),
                }
              : item
          ),
        }));
      },
    });
  }

  return (
    <>
      <Toast message={clientMessage ?? message} />

      <section className="overflow-hidden rounded-[2.25rem] border border-neutral-200 bg-white shadow-[0_20px_55px_rgba(0,0,0,0.06)]">
        <div className="relative overflow-hidden bg-[#11100b] p-6 text-white">
          <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[#c99c38]/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-10 size-72 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-[#c99c38]/35 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f1c66a]">
                <ReceiptText className="size-4" />
                Order Command Center
              </p>

              <h2 className="mt-5 text-4xl font-black tracking-tight">
                Order Operations Board
              </h2>

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-white/60">
                Prioritize pending approvals, kitchen movement, ready-for-delivery
                orders, unpaid balances, and receipts from one cleaner workflow.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-[1.5rem] border border-white/10 bg-white/10 p-3 text-sm font-bold text-white/75">
              <div className="rounded-2xl bg-black/20 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-[#f1c66a]">
                  Attention
                </p>
                <p className="mt-1 text-2xl font-black text-white">
                  {attentionCount}
                </p>
              </div>
              <div className="rounded-2xl bg-black/20 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-[#f1c66a]">
                  Kitchen Queue
                </p>
                <p className="mt-1 text-2xl font-black text-white">
                  {kitchenQueueCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-t border-neutral-100 bg-neutral-50 p-4 md:grid-cols-2 xl:grid-cols-4">
          <OrderMetricTile
            icon={<Clock className="size-5" />}
            label="Active Orders"
            value={summary.activeOrders}
            helper="Pending to ready"
            tone="blue"
          />

          <OrderMetricTile
            icon={<CreditCard className="size-5" />}
            label="Unpaid Orders"
            value={summary.unpaidOrders}
            helper="Needs payment follow-up"
            tone="red"
          />

          <OrderMetricTile
            icon={<Ban className="size-5" />}
            label="Cancelled"
            value={summary.cancelledOrders}
            helper="Cancelled orders"
            tone="amber"
          />

          <OrderMetricTile
            icon={<ReceiptText className="size-5" />}
            label="Total Sales"
            value={money(summary.totalSalesCents)}
            helper="Paid and recorded totals"
            tone="green"
          />
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b88938]">
              Workflow Filters
            </p>
            <h2 className="mt-1 text-xl font-black">Order Queue</h2>
            <p className="mt-1 text-sm font-semibold text-neutral-500">
              Use one-tap status filters, search, and payment filters before
              opening details.
            </p>
          </div>

          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {statusOptions.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={
                  statusFilter === status
                    ? 'shrink-0 rounded-full bg-black px-4 py-2 text-xs font-black text-white'
                    : 'shrink-0 rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-black text-neutral-700 transition hover:bg-neutral-50'
                }
              >
                {status === 'ALL' ? 'All' : label(status)}{' '}
                <span className="opacity-70">
                  {status === 'ALL'
                    ? statusCounts.ALL
                    : statusCounts[status]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="grid gap-1">
            <span className="text-xs font-black uppercase text-neutral-500">
              Search Orders
            </span>
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4">
              <Search className="size-4 shrink-0 text-neutral-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search code, room, guest, item, note, payment..."
                className="w-full bg-transparent text-sm font-bold outline-none"
              />
            </div>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black uppercase text-neutral-500">
              Payment Filter
            </span>
            <select
              value={paymentFilter}
              onChange={(event) =>
                setPaymentFilter(event.target.value as PaymentFilter)
              }
              className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
            >
              <option value="ALL">All Payments</option>
              <option value="PAID">Paid</option>
              <option value="UNPAID">Unpaid</option>
            </select>
          </label>
        </div>
      </section>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section id="orders-list" className="scroll-mt-24">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                {sortedOrders.length
                  ? `Showing ${pageStartIndex + 1}-${pageEndIndex} of ${sortedOrders.length} filtered orders`
                  : 'Showing 0 filtered orders'}
                {sortedOrders.length !== localOrders.length
                  ? ` · ${localOrders.length} total`
                  : ''}
              </p>
              <h3 className="mt-1 text-lg font-black">Orders</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-black text-neutral-600">
                Per page
                <select
                  value={ordersPerPage}
                  onChange={(event) =>
                    setOrdersPerPage(Number(event.target.value))
                  }
                  className="bg-transparent font-black text-neutral-950 outline-none"
                  aria-label="Orders per page"
                >
                  <option value={6}>6</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </label>

              <span className="rounded-full bg-neutral-100 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-neutral-500">
                Newest first
              </span>

              <button
                type="button"
                onClick={() => router.refresh()}
                className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-black text-neutral-700 hover:bg-neutral-50"
              >
                <RefreshCw className="size-3.5" />
                Refresh latest
              </button>

              {(search || statusFilter !== 'ALL' || paymentFilter !== 'ALL') ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('ALL');
                    setPaymentFilter('ALL');
                  }}
                  className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-black text-neutral-700 hover:bg-neutral-50"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-2">
            {paginatedOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                now={now}
                onView={() => setSelectedOrder(order)}
                onPrint={() => printOrder(order)}
                onMarkPaid={handleMarkPaid}
                onStatusChange={handleStatusChange}
                onCancel={() => setCancelOrder(order)}
              />
            ))}

            {!sortedOrders.length ? (
              <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-10 text-center lg:col-span-2">
                <p className="font-black">No orders found.</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Try changing your search or filters.
                </p>
              </div>
            ) : null}
          </div>

          {sortedOrders.length > ordersPerPage ? (
            <nav
              className="mt-5 flex flex-col gap-3 rounded-[1.5rem] border border-neutral-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              aria-label="Orders pagination"
            >
              <p className="text-center text-xs font-bold text-neutral-500 sm:text-left">
                Page <span className="font-black text-neutral-950">{currentPage}</span>{' '}
                of <span className="font-black text-neutral-950">{totalPages}</span>
              </p>

              <div className="grid grid-cols-4 gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => changePage(1)}
                  disabled={currentPage === 1}
                  className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  First
                </button>

                <button
                  type="button"
                  onClick={() => changePage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                  Previous
                </button>

                <button
                  type="button"
                  onClick={() => changePage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-black px-3 text-xs font-black text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="size-4" />
                </button>

                <button
                  type="button"
                  onClick={() => changePage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Last
                </button>
              </div>
            </nav>
          ) : null}
        </section>

        <PriorityQueue
          orders={localOrders}
          now={now}
          onSelectOrder={(order) => setSelectedOrder(order)}
        />
      </div>

      {selectedOrder ? (
        <OrderDetailsModal
          order={selectedOrder}
          now={now}
          onClose={() => setSelectedOrder(null)}
          onCancel={(order) => {
            setSelectedOrder(null);
            setCancelOrder(order);
          }}
          onMarkPaid={handleMarkPaid}
          onStatusChange={handleStatusChange}
          onCancelItemAction={handleCancelOrderItem}
        />
      ) : null}

      {cancelOrder ? (
        <CancelOrderModal
          order={cancelOrder}
          onClose={() => setCancelOrder(null)}
          action={handleStatusChange}
        />
      ) : null}
    </>
  );
}