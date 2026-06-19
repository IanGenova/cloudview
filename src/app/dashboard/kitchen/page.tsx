import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { OrderItemStatus, OrderStatus } from '@prisma/client';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  RefreshCcw,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { KitchenRunningTimer } from '@/components/dashboard/KitchenRunningTimer';
import { KitchenFullscreenButton } from '@/components/dashboard/KitchenFullscreenButton';
import { RealtimeKitchenRefresh } from '@/components/dashboard/RealtimeKitchenRefresh';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';
import { updateOrderStatusAction } from '../orders/actions';
import { KitchenStatusActionButton } from '@/components/dashboard/KitchenStatusActionButton';

type KitchenToastMessage =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

type KitchenOrderItem = {
  id: string;
  quantity: number;
  productNameSnapshot: string;
  notes: string | null;
  isBundleSnapshot: boolean;
  status: OrderItemStatus;
  cancelledQty: number;
  cancelledAt: Date | null;
  cancelReason: string | null;
  bundleComponents: {
    id: string;
    componentNameSnapshot: string;
    quantity: number;
  }[];
};

type KitchenOrder = {
  id: string;
  orderCode: string;
  status: OrderStatus;
  guestName: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalCents: number;
  room: { number: string } | null;
  location: { name: string } | null;
  items: KitchenOrderItem[];
};

function getKitchenSuccessCode(status: OrderStatus) {
  if (status === OrderStatus.PREPARING) {
    return 'order-accepted';
  }

  if (status === OrderStatus.READY) {
    return 'order-ready';
  }

  if (status === OrderStatus.DELIVERED) {
    return 'order-delivered';
  }

  if (status === OrderStatus.CANCELLED) {
    return 'order-cancelled';
  }

  return 'order-updated';
}

function getKitchenMessage(success?: string, error?: string): KitchenToastMessage {
  if (success) {
    const messages: Record<string, string> = {
      'order-accepted': 'Order accepted and moved to Preparing.',
      'order-ready': 'Order marked as Ready.',
      'order-delivered': 'Order marked as Delivered.',
      'order-cancelled': 'Order was rejected/cancelled successfully.',
      'order-updated': 'Kitchen order was updated successfully.',
    };

    return {
      type: 'success',
      text: messages[success] ?? 'Kitchen action completed successfully.',
    };
  }

  if (error) {
    const messages: Record<string, string> = {
      'status-update-failed':
        'Unable to update the kitchen order. Please refresh and try again.',
    };

    return {
      type: 'error',
      text: messages[error] ?? 'Something went wrong.',
    };
  }

  return null;
}

function buildKitchenRedirectUrl({
  success,
  error,
  history,
}: {
  success?: string;
  error?: string;
  history?: string;
}) {
  const query = new URLSearchParams();

  if (history) {
    query.set('history', history);
  }

  if (success) {
    query.set('success', success);
  }

  if (error) {
    query.set('error', error);
  }

  return query.toString()
    ? `/dashboard/kitchen?${query.toString()}`
    : '/dashboard/kitchen';
}

// Ensure the cache busts so the data updates without a hard reload
async function updateKitchenOrderStatusAction(formData: FormData) {
  'use server';

  const status = formData.get('status') as OrderStatus;
  const history = String(formData.get('history') || '');

  await updateOrderStatusAction(formData);
  
  // Revalidate the path to clear Next.js cache and show fresh DB data instantly
  revalidatePath('/dashboard/kitchen');

  redirect(
    buildKitchenRedirectUrl({
      success: getKitchenSuccessCode(status),
      history,
    })
  );
}

// Server action specifically for soft-refreshing the kitchen board
async function refreshKitchenAction(formData: FormData) {
  'use server';
  
  // Forces a server re-render of this page
  revalidatePath('/dashboard/kitchen');
  
  const history = formData.get('history');
  
  // Soft redirects preserve browser state (like Fullscreen API)
  if (history === '1') {
    redirect('/dashboard/kitchen?history=1');
  } else {
    redirect('/dashboard/kitchen');
  }
}

function KitchenToast({
  message,
  showHistory,
}: {
  message: KitchenToastMessage;
  showHistory: boolean;
}) {
  if (!message) {
    return null;
  }

  const closeHref = showHistory
    ? '/dashboard/kitchen?history=1'
    : '/dashboard/kitchen';

  return (
    <div className="fixed right-5 top-5 z-[9999] w-[calc(100vw-2.5rem)] max-w-md">
      <div
        className={
          message.type === 'success'
            ? 'flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-2xl dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100'
            : 'flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-2xl dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'
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
            <AlertTriangle className="size-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">
            {message.type === 'success' ? 'Success' : 'Action failed'}
          </p>
          <p className="mt-1 text-sm font-bold leading-6">{message.text}</p>
        </div>

        <Link
          href={closeHref}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 hover:bg-white dark:bg-white/10 dark:hover:bg-white/20"
          aria-label="Close notification"
        >
          <X className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function roomOrLocation(order: {
  room: { number: string } | null;
  location: { name: string } | null;
}) {
  if (order.room) return `Room ${order.room.number}`;
  if (order.location) return order.location.name;
  return 'Guest location';
}

function getActiveItemQuantity(item: {
  quantity: number;
  cancelledQty?: number | null;
}) {
  return Math.max(item.quantity - (item.cancelledQty ?? 0), 0);
}

function isCancelledKitchenItem(item: KitchenOrderItem) {
  return (
    item.status === OrderItemStatus.CANCELLED ||
    getActiveItemQuantity(item) <= 0
  );
}

function getItemStatusClass(item: KitchenOrderItem) {
  if (isCancelledKitchenItem(item)) {
    return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200';
  }

  if (item.status === OrderItemStatus.PARTIALLY_CANCELLED) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200';
  }

  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200';
}

function getActiveItemCount(items: KitchenOrderItem[]) {
  return items.reduce((sum, item) => sum + getActiveItemQuantity(item), 0);
}

function getCancelledItemCount(items: KitchenOrderItem[]) {
  return items.filter((item) => isCancelledKitchenItem(item)).length;
}

function OrderActionButton({
  orderId,
  status,
  label,
  tone = 'dark',
  history,
}: {
  orderId: string;
  status: OrderStatus;
  label: string;
  tone?: 'dark' | 'danger' | 'gold' | 'light';
  history?: string;
}) {
  return (
    <form action={updateKitchenOrderStatusAction} className="w-full">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="history" value={history ?? ''} />
      <input
        type="hidden"
        name="note"
        value={`Kitchen display changed status to ${status.replaceAll(
          '_',
          ' '
        )}`}
      />

      <button
        type="submit"
        className={cn(
          'min-h-10 w-full rounded-xl border px-3 py-2 text-xs font-black shadow-sm transition active:scale-[0.98]',
          tone === 'dark' &&
            'border-black bg-black text-white hover:bg-neutral-800 dark:border-gold dark:bg-gold dark:text-black dark:hover:bg-gold/80',
          tone === 'danger' &&
            'border-red-600 bg-red-600 text-white hover:bg-red-700',
          tone === 'gold' &&
            'border-gold bg-gold text-black hover:bg-gold/80',
          tone === 'light' &&
            'border-neutral-300 bg-white text-black hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800'
        )}
      >
        {label}
      </button>
    </form>
  );
}

function KitchenOrderItemLine({ item }: { item: KitchenOrderItem }) {
  const activeQty = getActiveItemQuantity(item);
  const isCancelled = isCancelledKitchenItem(item);

  return (
    <div
      className={
        isCancelled
          ? 'rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs dark:border-red-500/20 dark:bg-red-500/10'
          : 'rounded-xl bg-neutral-50 px-3 py-2 text-xs dark:bg-neutral-950'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <b
              className={
                isCancelled
                  ? 'text-red-700 line-through decoration-red-400 dark:text-red-200'
                  : 'text-neutral-950 dark:text-white'
              }
            >
              {isCancelled ? item.quantity : activeQty}×{' '}
              {item.productNameSnapshot}
            </b>

            {item.isBundleSnapshot ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                Bundle
              </span>
            ) : null}

            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${getItemStatusClass(
                item
              )}`}
            >
              {item.status.replaceAll('_', ' ')}
            </span>
          </div>

          {item.cancelledQty > 0 ? (
            <p className="mt-1 text-[11px] font-black text-red-700 dark:text-red-200">
              Cancelled qty: {item.cancelledQty}
            </p>
          ) : null}

          {item.cancelReason ? (
            <p className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-200">
              Reason: {item.cancelReason}
            </p>
          ) : null}

          {item.notes ? (
            <p className="mt-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Note: {item.notes}
            </p>
          ) : null}
        </div>
      </div>

      {item.isBundleSnapshot ? (
        <div
          className={
            isCancelled
              ? 'mt-2 rounded-lg bg-red-100/80 p-2 dark:bg-red-500/10'
              : 'mt-2 rounded-lg bg-amber-50 p-2 dark:bg-amber-500/10'
          }
        >
          <p
            className={
              isCancelled
                ? 'text-[10px] font-black uppercase tracking-[0.14em] text-red-700 dark:text-red-200'
                : 'text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200'
            }
          >
            Includes
          </p>

          {item.bundleComponents.length ? (
            <div className="mt-1 space-y-0.5">
              {item.bundleComponents.map((component) => (
                <p
                  key={component.id}
                  className={
                    isCancelled
                      ? 'text-[11px] font-bold text-red-800 dark:text-red-200'
                      : 'text-[11px] font-bold text-amber-900 dark:text-amber-100'
                  }
                >
                  {component.quantity}× {component.componentNameSnapshot}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] font-bold text-neutral-500">
              No bundle component snapshot.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
const KITCHEN_VISIBLE_ITEM_LIMIT = 3;

function KitchenOrderCard({
  order,
  type,
  showHistory,
}: {
  order: KitchenOrder;
  type: 'pending' | 'preparing' | 'ready';
  showHistory: boolean;
}) {
  const guestName = order.guestName?.trim() || 'Guest name not provided';
  const activeItemCount = getActiveItemCount(order.items);
  const cancelledItemCount = getCancelledItemCount(order.items);

  const visibleItems = order.items.slice(0, KITCHEN_VISIBLE_ITEM_LIMIT);
  const hiddenItemCount = Math.max(order.items.length - visibleItems.length, 0);

  const displayStatus =
    order.status === OrderStatus.ACCEPTED
      ? OrderStatus.PREPARING
      : order.status;

  const historyParam = showHistory ? '1' : '';

  return (
  <article className="grid w-full max-w-[380px] self-start overflow-hidden rounded-[1.25rem] border border-neutral-200 bg-white shadow-soft dark:border-neutral-800 dark:bg-neutral-900">
      <div className="min-h-0 border-b border-neutral-100 p-2.5 dark:border-neutral-800">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black text-neutral-950 dark:text-white">
              {order.orderCode}
            </h3>

            <p className="mt-0.5 truncate text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
              {roomOrLocation(order)}
            </p>
          </div>

          <div className="shrink-0 text-center">
            <StatusBadge status={displayStatus} />
            <KitchenRunningTimer startedAt={order.createdAt.toISOString()} />
          </div>
        </div>

        <div className="mt-2 grid gap-1 rounded-xl bg-neutral-50 p-2 text-[11px] dark:bg-neutral-950">
          <p className="truncate">
            <span className="font-black text-neutral-950 dark:text-white">
              Guest:
            </span>{' '}
            <span className="font-semibold text-neutral-600 dark:text-neutral-400">
              {guestName}
            </span>
          </p>

          <p>
            <span className="font-black text-neutral-950 dark:text-white">
              Order Time:
            </span>{' '}
            <span className="font-semibold text-neutral-600 dark:text-neutral-400">
              {formatTime(order.createdAt)}
            </span>
          </p>

          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
              {activeItemCount} active
            </span>

            {cancelledItemCount > 0 ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700 dark:bg-red-500/15 dark:text-red-200">
                {cancelledItemCount} cancelled
              </span>
            ) : null}
          </div>
        </div>
      </div>

    <div className="space-y-1 overflow-hidden p-2.5">
        {visibleItems.map((item) => (
          <KitchenOrderItemLine key={item.id} item={item} />
        ))}

        {hiddenItemCount > 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2 text-center text-xs font-black text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
            +{hiddenItemCount} more item{hiddenItemCount === 1 ? '' : 's'}
          </div>
        ) : null}

        {order.notes ? (
          <div className="line-clamp-2 rounded-xl bg-yellow-50 p-2 text-xs text-yellow-900 dark:bg-yellow-500/10 dark:text-yellow-200">
            <b>Guest note:</b> {order.notes}
          </div>
        ) : null}
      </div>

      <div className="border-t border-neutral-100 bg-neutral-50 p-2.5 dark:border-neutral-800 dark:bg-neutral-950">
        {type === 'pending' ? (
          <div className="grid grid-cols-2 gap-2">
           <KitchenStatusActionButton
              orderId={order.id}
              status={OrderStatus.PREPARING}
              label="Accept"
              tone="dark"
            />

           <KitchenStatusActionButton
            orderId={order.id}
            status={OrderStatus.CANCELLED}
            label="Reject"
            tone="danger"
          />
          </div>
        ) : null}

        {type === 'preparing' ? (
          <KitchenStatusActionButton
              orderId={order.id}
              status={OrderStatus.READY}
              label="Done / Ready"
              tone="dark"
            />
        ) : null}

        {type === 'ready' ? (
         <KitchenStatusActionButton
            orderId={order.id}
            status={OrderStatus.DELIVERED}
            label="Mark Delivered"
            tone="dark"
          />
        ) : null}
      </div>
    </article>
  );
}

function KitchenLane({
  title,
  description,
  orders,
  type,
  showHistory,
}: {
  title: string;
  description: string;
  orders: KitchenOrder[];
  type: 'pending' | 'preparing' | 'ready';
  showHistory: boolean;
}) {
  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <div>
          <h2 className="text-xl font-black text-neutral-950 dark:text-white md:text-2xl">
            {title}
          </h2>

          <p className="mt-0.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400 md:text-sm">
            {description}
          </p>
        </div>

        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-black text-sm font-black text-white dark:bg-gold dark:text-black">
          {orders.length}
        </span>
      </div>

      <div className="px-4 pb-4 pt-4">
        {orders.length === 0 ? (
          <div className="grid min-h-32 w-full place-items-center rounded-[1.5rem] border border-dashed border-neutral-200 bg-white p-6 text-center dark:border-neutral-800 dark:bg-neutral-950">
            <p className="font-black text-neutral-500 dark:text-neutral-400">
              No {title.toLowerCase()} orders
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,380px))] items-start justify-start gap-3">
            {orders.map((order) => (
              <KitchenOrderCard
                key={order.id}
                order={order}
                type={type}
                showHistory={showHistory}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function KitchenHistoryItemLine({ item }: { item: KitchenOrderItem }) {
  const activeQty = getActiveItemQuantity(item);
  const isCancelled = isCancelledKitchenItem(item);

  return (
    <div
      className={
        isCancelled
          ? 'rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs dark:border-red-500/20 dark:bg-red-500/10'
          : 'rounded-xl bg-neutral-50 px-3 py-2 text-xs dark:bg-neutral-900'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <p
          className={
            isCancelled
              ? 'font-bold text-red-700 line-through decoration-red-400 dark:text-red-200'
              : 'font-bold text-neutral-950 dark:text-white'
          }
        >
          {isCancelled ? item.quantity : activeQty}× {item.productNameSnapshot}
        </p>

        {item.isBundleSnapshot ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
            Bundle
          </span>
        ) : null}

        {isCancelled ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700 dark:bg-red-500/15 dark:text-red-200">
            Cancelled
          </span>
        ) : null}
      </div>

      {item.cancelReason ? (
        <p className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-200">
          Reason: {item.cancelReason}
        </p>
      ) : null}
    </div>
  );
}

export default async function KitchenDisplayPage({
  searchParams,
}: {
  searchParams?: Promise<{
    history?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const showHistory = params?.history === '1';
  const message = getKitchenMessage(params?.success, params?.error);

  const baseWhere =
    user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const [liveOrders, historyOrders] = await Promise.all([
    db.order.findMany({
      where: {
        ...baseWhere,
        status: {
          in: [
            OrderStatus.PENDING,
            OrderStatus.ACCEPTED,
            OrderStatus.PREPARING,
            OrderStatus.READY,
          ],
        },
      },
      include: {
        room: true,
        location: true,
        items: {
          include: {
            bundleComponents: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    }),

    db.order.findMany({
      where: {
        ...baseWhere,
        status: {
          in: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
        },
      },
      include: {
        room: true,
        location: true,
        items: {
          include: {
            bundleComponents: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 30,
    }),
  ]);

  const pendingOrders = liveOrders.filter(
    (order) => order.status === OrderStatus.PENDING
  );

  const preparingStatuses: readonly OrderStatus[] = [
    OrderStatus.ACCEPTED,
    OrderStatus.PREPARING,
  ];

  const preparingOrders = liveOrders.filter((order) =>
    preparingStatuses.includes(order.status)
  );

  const readyOrders = liveOrders.filter(
    (order) => order.status === OrderStatus.READY
  );

  return (
    <div
      id="kitchen-display-fullscreen"
      className="flex h-screen flex-col overflow-hidden bg-white p-6 text-neutral-950 dark:bg-neutral-950 dark:text-white"
    >
      <RealtimeKitchenRefresh />
      <KitchenToast message={message} showHistory={showHistory} />

      <div className="mb-6 shrink-0 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <PageHeader
          title="Kitchen Display"
          description="Live kitchen workflow for pending, preparing, ready, and item-level cancellation updates."
        />

        <div className="flex flex-wrap gap-2">
          {/* Changed standard form submission to utilize a soft Server Action */}
          <form action={refreshKitchenAction}>
            {showHistory && <input type="hidden" name="history" value="1" />}
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-black hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
            >
              <RefreshCcw className="size-4" />
              Refresh
            </button>
          </form>

          <KitchenFullscreenButton targetId="kitchen-display-fullscreen" />

          <Link
            href={
              showHistory
                ? '/dashboard/kitchen'
                : '/dashboard/kitchen?history=1'
            }
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition',
              showHistory
                ? 'bg-black text-white dark:bg-gold dark:text-black'
                : 'border border-neutral-200 bg-white text-black hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800'
            )}
          >
            <History className="size-4" />
            {showHistory ? 'Live Orders' : 'History'}
          </Link>
        </div>
      </div>

      <div
            className={cn(
              'min-h-0 flex-1 grid gap-4',
              showHistory
                ? 'xl:grid-cols-[minmax(0,1fr)_340px]'
                : 'xl:grid-cols-1'
            )}
          >
        <main
          className={cn(
            'min-h-0 flex-col gap-3',
            showHistory ? 'hidden xl:flex' : 'flex'
          )}
        >
          <KitchenLane
            title="Pending"
            description="New orders waiting for accept or reject."
            orders={pendingOrders}
            type="pending"
            showHistory={showHistory}
          />

          <KitchenLane
            title="Preparing"
            description="Accepted orders and orders currently being prepared."
            orders={preparingOrders}
            type="preparing"
            showHistory={showHistory}
          />

          <KitchenLane
            title="Ready"
            description="Orders ready to be delivered to the guest."
            orders={readyOrders}
            type="ready"
            showHistory={showHistory}
          />
        </main>

        <aside
            className={cn(
              'min-h-0 h-full',
              showHistory ? 'block' : 'hidden'
            )}
          >
          <section className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-soft dark:border-neutral-800 dark:bg-neutral-900">
            <div className="border-b border-neutral-100 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-neutral-950 dark:text-white">
                    Order History
                  </h2>

                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    Delivered and cancelled kitchen orders.
                  </p>
                </div>

                <Clock className="size-6 text-neutral-400" />
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {!showHistory ? (
                <div className="grid h-full min-h-72 place-items-center rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center dark:border-neutral-800 dark:bg-neutral-950">
                  <div>
                    <History className="mx-auto size-9 text-neutral-400" />

                    <p className="mt-3 font-black text-neutral-600 dark:text-neutral-300">
                      Click History to view order history
                    </p>

                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      This keeps the live board focused on active kitchen
                      orders.
                    </p>
                  </div>
                </div>
              ) : null}

              {showHistory && historyOrders.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center dark:border-neutral-800 dark:bg-neutral-950">
                  <p className="font-black text-neutral-500 dark:text-neutral-400">
                    No history yet
                  </p>
                </div>
              ) : null}

              {showHistory
                ? historyOrders.map((order) => (
                    <article
                      key={order.id}
                      className="rounded-[1.5rem] border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-black text-neutral-950 dark:text-white">
                            {order.orderCode}
                          </h3>

                          <p className="mt-1 text-xs font-bold text-neutral-500 dark:text-neutral-400">
                            {roomOrLocation(order)} ·{' '}
                            {formatDateTime(order.updatedAt)}
                          </p>
                        </div>

                        <StatusBadge status={order.status} />
                      </div>

                      <div className="mt-3 space-y-1">
                        {order.items.map((item) => (
                          <KitchenHistoryItemLine key={item.id} item={item} />
                        ))}
                      </div>

                      <div className="mt-3 flex justify-between border-t border-neutral-100 pt-3 text-sm dark:border-neutral-800">
                        <span className="font-bold text-neutral-500 dark:text-neutral-400">
                          Total
                        </span>

                        <span className="font-black text-neutral-950 dark:text-white">
                          {money(order.totalCents)}
                        </span>
                      </div>
                    </article>
                  ))
                : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
