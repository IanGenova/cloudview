'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Ban,
  CheckCircle2,
  ChefHat,
  Clock,
  CreditCard,
  PackageCheck,
  Printer,
  ReceiptText,
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

type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';

type PaymentMethod = 'ROOM_CHARGE' | 'PAY_AT_COUNTER' | 'CASH' | 'POS';

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
  notes: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
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


const statusOptions: StatusFilter[] = [
  'ALL',
  'PENDING',
  'ACCEPTED',
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

  if (status === 'REFUNDED') {
    return 'bg-blue-100 text-blue-700';
  }

  return 'bg-red-100 text-red-700';
}

function getNextActions(status: OrderStatus) {
  if (status === 'PENDING') {
    return [
      {
        status: 'ACCEPTED' as OrderStatus,
        label: 'Accept',
        className: 'bg-blue-600 text-white hover:bg-blue-700',
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
}: {
  order: DashboardOrder;
  item: OrderItem;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(cancelReasons[0]);
  const [customReason, setCustomReason] = useState('');

  const finalReason =
    reason === 'Other' ? customReason.trim() || 'Other' : reason;

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

        <form action={cancelOrderItemAction} className="space-y-4">
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
            This will cancel only this food item. Other food items in this
            order will remain active. Stock will be restored automatically.
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
}: {
  order: DashboardOrder;
  onClose: () => void;
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

        <form action={updateOrderStatusAction} className="space-y-4">
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
            Cancelling this order will restore deducted stock when restore
            movements are available.
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
}: {
  order: DashboardOrder;
  now: number;
  onClose: () => void;
  onCancel: (order: DashboardOrder) => void;
}) {
  const [cancelItem, setCancelItem] = useState<OrderItem | null>(null);
  const nextActions = getNextActions(order.status);

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

              {order.guestName || order.notes ? (
                <div className="rounded-2xl bg-neutral-50 p-4 text-sm">
                  {order.guestName ? (
                    <p>
                      <b>Guest:</b> {order.guestName}
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

              <button
                type="button"
                onClick={() => printOrder(order)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white text-sm font-black hover:bg-neutral-50"
              >
                <Printer className="size-4" />
                Print Receipt
              </button>

              {order.paymentStatus !== 'PAID' ? (
                <form action={markOrderPaidAction}>
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
                        action={updateOrderStatusAction}
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
                          className={`flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black ${action.className}`}
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
        />
      ) : null}
    </>
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<DashboardOrder | null>(
    null
  );
  const [cancelOrder, setCancelOrder] = useState<DashboardOrder | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  const filteredOrders = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return orders.filter((order) => {
      const orderText = [
        order.orderCode,
        order.hotelName,
        order.roomLabel,
        order.guestName,
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
        (paymentFilter === 'PAID' && order.paymentStatus === 'PAID') ||
        (paymentFilter === 'UNPAID' && order.paymentStatus !== 'PAID');

      return matchesSearch && matchesStatus && matchesPayment;
    });
  }, [orders, paymentFilter, search, statusFilter]);

  return (
    <>
     <Toast message={message} />
      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <SummaryCard
          label="Active Orders"
          value={summary.activeOrders}
          tone="blue"
        />
        <SummaryCard
          label="Unpaid Orders"
          value={summary.unpaidOrders}
          tone="red"
        />
        <SummaryCard
          label="Cancelled"
          value={summary.cancelledOrders}
          tone="red"
        />
        <SummaryCard
          label="Total Sales"
          value={money(summary.totalSalesCents)}
          tone="green"
        />
      </div>

      <div className="mb-5 rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black">Order Management</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Small order cards. Details open in a modal.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={
                  statusFilter === status
                    ? 'rounded-full bg-black px-4 py-2 text-xs font-black text-white'
                    : 'rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-black text-neutral-700 hover:bg-neutral-50'
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

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_200px]">
          <label className="grid gap-1">
            <span className="text-xs font-black uppercase text-neutral-500">
              Search Orders
            </span>
            <div className="flex h-11 items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4">
              <Search className="size-4 shrink-0 text-neutral-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search order code, room, guest, item, bundle component..."
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
              className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none"
            >
              <option value="ALL">All Payments</option>
              <option value="PAID">Paid</option>
              <option value="UNPAID">Unpaid</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {filteredOrders.map((order) => {
          const itemCount = getItemCount(order.items);
          const preview = getOrderPreview(order.items);
          const sourceLabel = order.tagCode ? 'Guest Portal' : 'POS Terminal';
          const waitingLabel = getOrderAgeLabel(order, now);

          return (
            <article
              key={order.id}
              className="rounded-[1.5rem] border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black">
                    {order.orderCode}
                  </h3>
                  <p className="mt-1 truncate text-xs font-bold text-neutral-500">
                    {order.hotelName} · {order.roomLabel}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-neutral-400">
                    {sourceLabel}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black ${getStatusClass(
                    order.status
                  )}`}
                >
                  {label(order.status)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-black ${getPaymentClass(
                    order.paymentStatus
                  )}`}
                >
                  {label(order.paymentStatus)}
                </span>

                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-black ${getOrderAgeClass(
                    order,
                    now
                  )}`}
                >
                  {activeOrderStatuses.includes(order.status)
                    ? `Waiting ${waitingLabel}`
                    : `Duration ${waitingLabel}`}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-neutral-50 p-3">
                  <p className="text-[10px] font-black uppercase text-neutral-400">
                    Total
                  </p>
                  <p className="mt-1 text-sm font-black">
                    {money(order.totalCents)}
                  </p>
                </div>

                <div className="rounded-2xl bg-neutral-50 p-3">
                  <p className="text-[10px] font-black uppercase text-neutral-400">
                    Payment
                  </p>
                  <p className="mt-1 text-sm font-black">
                    {label(order.paymentMethod)}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-neutral-50 p-3">
                <p className="text-[10px] font-black uppercase text-neutral-400">
                  Active Items
                </p>
                <p className="mt-1 line-clamp-2 text-xs font-bold text-neutral-600">
                  {itemCount} item{itemCount === 1 ? '' : 's'} · {preview}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                  className="h-10 rounded-2xl bg-black text-xs font-black text-white hover:bg-neutral-800"
                >
                  View Details
                </button>

                <button
                  type="button"
                  onClick={() => printOrder(order)}
                  className="flex h-10 items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white text-xs font-black hover:bg-neutral-50"
                >
                  <Printer className="size-4" />
                  Print
                </button>
              </div>
            </article>
          );
        })}

        {!filteredOrders.length ? (
          <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-10 text-center md:col-span-2 2xl:col-span-3">
            <p className="font-black">No orders found.</p>
            <p className="mt-1 text-sm text-neutral-500">
              Try changing your search or filters.
            </p>
          </div>
        ) : null}
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
        />
      ) : null}

      {cancelOrder ? (
        <CancelOrderModal
          order={cancelOrder}
          onClose={() => setCancelOrder(null)}
        />
      ) : null}
    </>
  );
}