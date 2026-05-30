'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  PackageCheck,
  Printer,
  ReceiptText,
  Search,
  ShoppingBag,
  X,
  XCircle,
} from 'lucide-react';
import { markOrderPaidAction, updateOrderStatusAction } from './actions';

type OrderStatusValue =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED';

type PaymentStatusValue = 'UNPAID' | 'PAID' | 'REFUNDED';
type PaymentMethodValue = 'CASH' | 'POS' | 'ROOM_CHARGE' | 'PAY_AT_COUNTER';

type OrderItem = {
  id: string;
  quantity: number;
  productNameSnapshot: string;
  unitPriceCents: number;
  notes: string;
};

type StatusHistoryItem = {
  id: string;
  status: OrderStatusValue;
  note: string;
  createdAt: string;
  userName: string;
};

type OrderItemData = {
  id: string;
  orderCode: string;
  hotelName: string;
  roomLabel: string;
  guestName: string;
  notes: string;
  status: OrderStatusValue;
  paymentStatus: PaymentStatusValue;
  paymentMethod: PaymentMethodValue;
  totalCents: number;
  subtotalCents: number;
  serviceChargeCents: number;
  taxCents: number;
  createdAt: string;
  updatedAt: string;
  tagCode: string;
  items: OrderItem[];
  statusHistory: StatusHistoryItem[];
};

type StatusFilter = 'ALL' | OrderStatusValue;
type TabValue = 'LIVE' | 'ALL' | 'UNPAID' | 'HISTORY';

const statusFilters: Array<{
  value: StatusFilter;
  label: string;
}> = [
  { value: 'ALL', label: 'All Orders' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'PREPARING', label: 'Preparing' },
  { value: 'READY', label: 'Ready' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const liveStatuses: OrderStatusValue[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
];

function money(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

function getStatusClass(status: OrderStatusValue) {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200';
    case 'ACCEPTED':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200';
    case 'PREPARING':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-200';
    case 'READY':
      return 'bg-gold/20 text-ink dark:bg-gold/20 dark:text-gold';
    case 'DELIVERED':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200';
    case 'CANCELLED':
      return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200';
    default:
      return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
  }
}

function getPaymentClass(status: PaymentStatusValue) {
  if (status === 'PAID') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200';
  }

  if (status === 'REFUNDED') {
    return 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300';
  }

  return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200';
}

function getOrderSource(order: OrderItemData) {
  if (order.tagCode) return 'Guest Portal';
  if (order.roomLabel !== 'Guest location') return 'POS / Room Charge';
  return 'POS / Walk-in';
}

function extractOrderType(notes: string) {
  if (!notes) return '';

  const line = notes
    .split('\n')
    .find((item) => item.toLowerCase().startsWith('order type:'));

  if (!line) return '';

  return line.replace(/^Order Type:\s*/i, '').trim();
}

function nextActionsForStatus(status: OrderStatusValue) {
  switch (status) {
    case 'PENDING':
      return [
        {
          label: 'Accept Order',
          status: 'ACCEPTED' as OrderStatusValue,
          tone: 'primary' as const,
        },
        {
          label: 'Reject',
          status: 'CANCELLED' as OrderStatusValue,
          tone: 'danger' as const,
        },
      ];

    case 'ACCEPTED':
      return [
        {
          label: 'Start Preparing',
          status: 'PREPARING' as OrderStatusValue,
          tone: 'primary' as const,
        },
        {
          label: 'Cancel',
          status: 'CANCELLED' as OrderStatusValue,
          tone: 'danger' as const,
        },
      ];

    case 'PREPARING':
      return [
        {
          label: 'Mark Ready',
          status: 'READY' as OrderStatusValue,
          tone: 'primary' as const,
        },
        {
          label: 'Cancel',
          status: 'CANCELLED' as OrderStatusValue,
          tone: 'danger' as const,
        },
      ];

    case 'READY':
      return [
        {
          label: 'Mark Delivered',
          status: 'DELIVERED' as OrderStatusValue,
          tone: 'primary' as const,
        },
      ];

    default:
      return [];
  }
}

function ActionButton({
  orderId,
  status,
  label,
  tone,
}: {
  orderId: string;
  status: OrderStatusValue;
  label: string;
  tone: 'primary' | 'danger';
}) {
  return (
    <form action={updateOrderStatusAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value={status} />

      <button
        type="submit"
        className={
          tone === 'danger'
            ? 'h-10 w-full rounded-2xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-700'
            : 'h-10 w-full rounded-2xl bg-black px-4 text-sm font-black text-white transition hover:bg-neutral-800 dark:bg-gold dark:text-black dark:hover:bg-gold/80'
        }
      >
        {label}
      </button>
    </form>
  );
}

function MarkPaidButton({ orderId }: { orderId: string }) {
  return (
    <form action={markOrderPaidAction}>
      <input type="hidden" name="orderId" value={orderId} />

      <button
        type="submit"
        className="h-10 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:hover:bg-neutral-800"
      >
        Mark Paid
      </button>
    </form>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'gold' | 'red' | 'green';
}) {
  return (
    <div
      className={
        tone === 'red'
          ? 'rounded-[2rem] border border-red-200 bg-red-50 p-5 dark:border-red-500/20 dark:bg-red-500/10'
          : tone === 'green'
            ? 'rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/10'
            : 'rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900'
      }
    >
      <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-black text-white dark:bg-gold dark:text-black">
        <Icon className="size-5" />
      </div>

      <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400">
        {label}
      </p>

      <p className="mt-1 text-3xl font-black text-neutral-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: OrderStatusValue }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[10px] font-black ${getStatusClass(
        status
      )}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function PaymentPill({ status }: { status: PaymentStatusValue }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[10px] font-black ${getPaymentClass(
        status
      )}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function CompactOrderCard({
  order,
  onOpen,
}: {
  order: OrderItemData;
  onOpen: () => void;
}) {
  const firstItems = order.items
    .slice(0, 2)
    .map((item) => `${item.quantity}× ${item.productNameSnapshot}`)
    .join(', ');

  const actions = nextActionsForStatus(order.status);
  const orderType = extractOrderType(order.notes);

  return (
    <article className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-black text-neutral-950 dark:text-white">
              {order.orderCode}
            </h3>

            <StatusPill status={order.status} />
            <PaymentPill status={order.paymentStatus} />
          </div>

          <p className="mt-1 text-xs font-bold text-neutral-500 dark:text-neutral-400">
            {order.roomLabel} · {formatTime(order.createdAt)} ·{' '}
            {getOrderSource(order)}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
          aria-label="View order details"
        >
          <Eye className="size-4" />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {orderType ? (
          <div className="rounded-2xl bg-neutral-50 p-3 text-sm dark:bg-neutral-950">
            <p className="font-black text-neutral-950 dark:text-white">
              {orderType}
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Order fulfillment type
            </p>
          </div>
        ) : null}

        <div className="rounded-2xl bg-neutral-50 p-3 text-sm dark:bg-neutral-950">
          <p className="font-black text-neutral-950 dark:text-white">
            {order.items.length} item{order.items.length === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {firstItems || 'No items'}
            {order.items.length > 2 ? '…' : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-950">
            <p className="text-xs font-black uppercase text-neutral-400">
              Payment
            </p>
            <p className="mt-1 text-sm font-black text-neutral-950 dark:text-white">
              {statusLabel(order.paymentMethod)}
            </p>
          </div>

          <div className="rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-950">
            <p className="text-xs font-black uppercase text-neutral-400">
              Total
            </p>
            <p className="mt-1 text-sm font-black text-neutral-950 dark:text-white">
              {money(order.totalCents)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {actions.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {actions.map((action) => (
              <ActionButton
                key={`${order.id}-${action.status}`}
                orderId={order.id}
                status={action.status}
                label={action.label}
                tone={action.tone}
              />
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="h-10 rounded-2xl border border-neutral-200 bg-white text-sm font-black text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:hover:bg-neutral-800"
          >
            View Details
          </button>
        )}

        {order.paymentStatus !== 'PAID' && order.status !== 'CANCELLED' ? (
          <MarkPaidButton orderId={order.id} />
        ) : null}
      </div>
    </article>
  );
}

function LiveLane({
  title,
  description,
  orders,
  onOpen,
}: {
  title: string;
  description: string;
  orders: OrderItemData[];
  onOpen: (order: OrderItemData) => void;
}) {
  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-neutral-950 dark:text-white">
            {title}
          </h2>
          <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
            {description}
          </p>
        </div>

        <span className="grid size-9 place-items-center rounded-full bg-black text-sm font-black text-white dark:bg-gold dark:text-black">
          {orders.length}
        </span>
      </div>

      <div className="space-y-3">
        {orders.map((order) => (
          <CompactOrderCard
            key={order.id}
            order={order}
            onOpen={() => onOpen(order)}
          />
        ))}

        {!orders.length ? (
          <div className="rounded-[1.5rem] border border-dashed border-neutral-300 bg-white p-6 text-center text-sm font-bold text-neutral-400 dark:border-neutral-800 dark:bg-neutral-950">
            No {title.toLowerCase()} orders.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function OrderDetailsModal({
  order,
  onClose,
}: {
  order: OrderItemData;
  onClose: () => void;
}) {
  const actions = nextActionsForStatus(order.status);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-neutral-950">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-black text-neutral-950 dark:text-white">
                {order.orderCode}
              </h2>
              <StatusPill status={order.status} />
              <PaymentPill status={order.paymentStatus} />
            </div>

            <p className="mt-1 text-sm font-bold text-neutral-500 dark:text-neutral-400">
              {order.hotelName} · {order.roomLabel} ·{' '}
              {formatDateTime(order.createdAt)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <main className="space-y-4">
            <section className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="mb-3 flex items-center gap-2 font-black text-neutral-950 dark:text-white">
                <ReceiptText className="size-5 text-gold" />
                Order Items
              </h3>

              <div className="space-y-2">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between gap-3 rounded-2xl bg-white p-3 text-sm dark:bg-neutral-950"
                  >
                    <div>
                      <p className="font-black text-neutral-950 dark:text-white">
                        {item.quantity}× {item.productNameSnapshot}
                      </p>

                      {item.notes ? (
                        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                          Note: {item.notes}
                        </p>
                      ) : null}
                    </div>

                    <p className="font-black text-neutral-950 dark:text-white">
                      {money(item.quantity * item.unitPriceCents)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {order.notes ? (
              <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-black">Guest Note</p>
                <p className="mt-2 whitespace-pre-line leading-6">
                  {order.notes}
                </p>
              </section>
            ) : null}

            <section className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="mb-3 font-black text-neutral-950 dark:text-white">
                Status History
              </h3>

              <div className="space-y-2">
                {order.statusHistory.map((history) => (
                  <div
                    key={history.id}
                    className="rounded-2xl bg-white p-3 text-sm dark:bg-neutral-950"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <StatusPill status={history.status} />
                      <span className="text-xs font-bold text-neutral-400">
                        {formatDateTime(history.createdAt)}
                      </span>
                    </div>

                    {history.note ? (
                      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                        {history.note}
                      </p>
                    ) : null}

                    {history.userName ? (
                      <p className="mt-1 text-xs font-bold text-neutral-400">
                        By {history.userName}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </main>

          <aside className="space-y-4">
            <section className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="mb-3 flex items-center gap-2 font-black text-neutral-950 dark:text-white">
                <CreditCard className="size-5 text-gold" />
                Payment
              </h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Method
                  </span>
                  <b className="text-neutral-950 dark:text-white">
                    {statusLabel(order.paymentMethod)}
                  </b>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Subtotal
                  </span>
                  <b className="text-neutral-950 dark:text-white">
                    {money(order.subtotalCents)}
                  </b>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Service Charge
                  </span>
                  <b className="text-neutral-950 dark:text-white">
                    {money(order.serviceChargeCents)}
                  </b>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Tax
                  </span>
                  <b className="text-neutral-950 dark:text-white">
                    {money(order.taxCents)}
                  </b>
                </div>

                <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
                  <div className="flex justify-between text-lg">
                    <span className="font-black text-neutral-950 dark:text-white">
                      Total
                    </span>
                    <span className="font-black text-neutral-950 dark:text-white">
                      {money(order.totalCents)}
                    </span>
                  </div>
                </div>
              </div>

              {order.paymentStatus !== 'PAID' && order.status !== 'CANCELLED' ? (
                <div className="mt-4">
                  <MarkPaidButton orderId={order.id} />
                </div>
              ) : null}
            </section>

            <section className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="mb-3 flex items-center gap-2 font-black text-neutral-950 dark:text-white">
                <PackageCheck className="size-5 text-gold" />
                Actions
              </h3>

              <div className="grid gap-2">
                {actions.map((action) => (
                  <ActionButton
                    key={`${order.id}-${action.status}`}
                    orderId={order.id}
                    status={action.status}
                    label={action.label}
                    tone={action.tone}
                  />
                ))}

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="h-10 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:hover:bg-neutral-800"
                >
                  <Printer className="mr-2 inline size-4" />
                  Print Ticket
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function OrdersClient({
  summary,
  statusCounts,
  orders,
}: {
  summary: {
    activeOrders: number;
    unpaidOrders: number;
    cancelledOrders: number;
    totalSalesCents: number;
  };
  statusCounts: Record<string, number>;
  orders: OrderItemData[];
}) {
  const [activeTab, setActiveTab] = useState<TabValue>('LIVE');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderItemData | null>(null);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesTab =
        activeTab === 'ALL' ||
        (activeTab === 'LIVE' && liveStatuses.includes(order.status)) ||
        (activeTab === 'UNPAID' && order.paymentStatus !== 'PAID') ||
        (activeTab === 'HISTORY' &&
          (order.status === 'DELIVERED' || order.status === 'CANCELLED'));

      const matchesStatus =
        statusFilter === 'ALL' || order.status === statusFilter;

      const matchesSearch =
        !query ||
        [
          order.orderCode,
          order.hotelName,
          order.roomLabel,
          order.guestName,
          order.paymentMethod,
          order.paymentStatus,
          ...order.items.map((item) => item.productNameSnapshot),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);

      return matchesTab && matchesStatus && matchesSearch;
    });
  }, [activeTab, orders, search, statusFilter]);

  const pendingOrders = orders.filter((order) => order.status === 'PENDING');

  const preparingOrders = orders.filter(
    (order) => order.status === 'ACCEPTED' || order.status === 'PREPARING'
  );

  const readyOrders = orders.filter((order) => order.status === 'READY');

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Active Orders"
          value={summary.activeOrders}
          icon={ShoppingBag}
        />

        <SummaryCard
          label="Needs Payment"
          value={summary.unpaidOrders}
          icon={CreditCard}
          tone="red"
        />

        <SummaryCard
          label="Orders Total"
          value={money(summary.totalSalesCents)}
          icon={CheckCircle2}
          tone="green"
        />

        <SummaryCard
          label="Cancelled"
          value={summary.cancelledOrders}
          icon={AlertTriangle}
          tone="red"
        />
      </div>

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-neutral-950 dark:text-white">
              Order Command Center
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Use tabs for workflow, filters for searching, and cards for next
              valid actions only.
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-3 md:flex-row">
            <label className="relative min-w-0 md:w-[360px]">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search order, room, guest, item..."
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white pl-11 pr-4 text-sm font-bold text-neutral-900 outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
              />
            </label>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
            >
              {statusFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label} ({statusCounts[filter.value] ?? 0})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {[
            { value: 'LIVE', label: 'Live Orders', icon: Clock },
            { value: 'ALL', label: 'All Orders', icon: ReceiptText },
            { value: 'UNPAID', label: 'Unpaid', icon: CreditCard },
            { value: 'HISTORY', label: 'History', icon: PackageCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.value;

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value as TabValue)}
                className={
                  active
                    ? 'inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white dark:bg-gold dark:text-black'
                    : 'inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-5 text-sm font-black text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:hover:bg-neutral-800'
                }
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === 'LIVE' && statusFilter === 'ALL' && !search.trim() ? (
        <div className="grid gap-5 xl:grid-cols-3">
          <LiveLane
            title="Pending"
            description="Accept or reject new orders."
            orders={pendingOrders}
            onOpen={setSelectedOrder}
          />

          <LiveLane
            title="Preparing"
            description="Accepted and kitchen-active orders."
            orders={preparingOrders}
            onOpen={setSelectedOrder}
          />

          <LiveLane
            title="Ready"
            description="Ready for delivery."
            orders={readyOrders}
            onOpen={setSelectedOrder}
          />
        </div>
      ) : (
        <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-neutral-950 dark:text-white">
                Filtered Orders
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Showing {filteredOrders.length} order
                {filteredOrders.length === 1 ? '' : 's'}.
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {filteredOrders.map((order) => (
              <CompactOrderCard
                key={order.id}
                order={order}
                onOpen={() => setSelectedOrder(order)}
              />
            ))}

            {!filteredOrders.length ? (
              <div className="rounded-[1.5rem] border border-dashed border-neutral-300 p-8 text-center text-sm font-bold text-neutral-400 dark:border-neutral-800 xl:col-span-2 2xl:col-span-3">
                No orders match your current filters.
              </div>
            ) : null}
          </div>
        </section>
      )}

      {selectedOrder ? (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      ) : null}
    </div>
  );
}