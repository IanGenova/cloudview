import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  FulfillmentTiming,
  OrderItemStatus,
  OrderStatus,
  ScheduledReleaseStatus,
} from '@prisma/client';
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
import { KitchenManualRefreshButton } from '@/components/dashboard/KitchenManualRefreshButton';

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
  fulfillmentTiming: FulfillmentTiming;
  scheduledFor: Date | null;
  releaseAt: Date | null;
  releasedAt: Date | null;
  scheduledReleaseStatus: ScheduledReleaseStatus;
  scheduledNote: string | null;
};

type KitchenDisplayMode = 'normal' | 'tv';

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

function buildKitchenModeHref({
  history,
  mode,
}: {
  history?: boolean;
  mode?: KitchenDisplayMode;
}) {
  const query = new URLSearchParams();

  if (history) {
    query.set('history', '1');
  }

  if (mode === 'tv') {
    query.set('mode', 'tv');
  }

  return query.toString()
    ? `/dashboard/kitchen?${query.toString()}`
    : '/dashboard/kitchen';
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
  displayMode,
}: {
  order: KitchenOrder;
  type: 'pending' | 'preparing' | 'ready';
  showHistory: boolean;
  displayMode: KitchenDisplayMode;
}) {
  const guestName = order.guestName?.trim() || 'Guest name not provided';
  const activeItemCount = getActiveItemCount(order.items);
  const cancelledItemCount = getCancelledItemCount(order.items);

  const isTvMode = displayMode === 'tv';
  const visibleLimit = isTvMode ? 6 : 3;

  const visibleItems = order.items.slice(0, visibleLimit);
  const hiddenItemCount = Math.max(order.items.length - visibleItems.length, 0);

  const displayStatus =
    order.status === OrderStatus.ACCEPTED
      ? OrderStatus.PREPARING
      : order.status;

  return (
    <article
      className={cn(
        'grid w-full overflow-hidden border bg-white shadow-soft dark:border-neutral-800 dark:bg-neutral-900',
        isTvMode
          ? 'rounded-[2rem] border-white/10 bg-white/95 shadow-2xl'
          : 'rounded-[1.25rem] border-neutral-200'
      )}
    >
      <div
        className={cn(
          'border-b border-neutral-100 dark:border-neutral-800',
          isTvMode ? 'p-5' : 'p-2.5'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              className={cn(
                'truncate font-black text-neutral-950 dark:text-white',
                isTvMode ? 'text-3xl' : 'text-sm'
              )}
            >
              {order.orderCode}
            </h3>

            <p
              className={cn(
                'mt-1 truncate font-bold text-neutral-500 dark:text-neutral-400',
                isTvMode ? 'text-lg' : 'text-[11px]'
              )}
            >
              {roomOrLocation(order)}
            </p>
          </div>

          <div className="shrink-0 text-center">
            <StatusBadge status={displayStatus} />
            <KitchenRunningTimer startedAt={order.createdAt.toISOString()} />
          </div>
        </div>

        <div
          className={cn(
            'mt-3 grid gap-1 rounded-xl bg-neutral-50 dark:bg-neutral-950',
            isTvMode ? 'p-4 text-base' : 'p-2 text-[11px]'
          )}
        >
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

          <div className="mt-2 flex flex-wrap gap-1">
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

      <div className={cn('space-y-2', isTvMode ? 'p-5' : 'p-2.5')}>
        {visibleItems.map((item) => (
          <KitchenOrderItemLine key={item.id} item={item} />
        ))}

        {hiddenItemCount > 0 ? (
          <div
            className={cn(
              'rounded-xl border border-dashed border-neutral-200 bg-neutral-50 text-center font-black text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400',
              isTvMode ? 'px-4 py-3 text-base' : 'px-3 py-2 text-xs'
            )}
          >
            +{hiddenItemCount} more item{hiddenItemCount === 1 ? '' : 's'}
          </div>
        ) : null}

        {order.notes ? (
          <div
            className={cn(
              'line-clamp-2 rounded-xl bg-yellow-50 text-yellow-900 dark:bg-yellow-500/10 dark:text-yellow-200',
              isTvMode ? 'p-4 text-base' : 'p-2 text-xs'
            )}
          >
            <b>Guest note:</b> {order.notes}
          </div>
        ) : null}
      </div>

      {!isTvMode ? (
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
      ) : null}
    </article>
  );
}

function KitchenScheduledOrderCard({ order }: { order: KitchenOrder }) {
  const guestName = order.guestName?.trim() || 'Guest name not provided';
  const activeItemCount = getActiveItemCount(order.items);
  const previewItems = order.items
    .filter((item) => getActiveItemQuantity(item) > 0)
    .slice(0, 2);

  return (
    <article className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-black">{order.orderCode}</h3>

          <p className="mt-1 text-xs font-bold opacity-70">
            {roomOrLocation(order)} · {guestName}
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-amber-600 px-3 py-1 text-[10px] font-black uppercase text-white">
          Scheduled
        </span>
      </div>

      <div className="mt-3 grid gap-2 rounded-2xl bg-white/70 p-3 text-xs dark:bg-black/20">
        <p>
          <b>Scheduled For:</b>{' '}
          {order.scheduledFor ? formatDateTime(order.scheduledFor) : '—'}
        </p>

        <p>
          <b>Release At:</b>{' '}
          {order.releaseAt ? formatDateTime(order.releaseAt) : '—'}
        </p>

        <p>
          <b>Items:</b> {activeItemCount}
        </p>
      </div>

      {previewItems.length > 0 ? (
        <div className="mt-3 space-y-1">
          {previewItems.map((item) => (
            <p key={item.id} className="text-xs font-bold opacity-80">
              {getActiveItemQuantity(item)}× {item.productNameSnapshot}
            </p>
          ))}

          {order.items.length > previewItems.length ? (
            <p className="text-xs font-black opacity-60">
              +{order.items.length - previewItems.length} more item
              {order.items.length - previewItems.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      ) : null}

      {order.scheduledNote ? (
        <p className="mt-3 rounded-2xl bg-white/70 p-3 text-xs font-semibold dark:bg-black/20">
          <b>Schedule note:</b> {order.scheduledNote}
        </p>
      ) : null}
    </article>
  );
}

function KitchenScheduledLane({
  orders,
}: {
  orders: KitchenOrder[];
}) {
  if (!orders.length) {
    return null;
  }

  return (
    <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-amber-950 dark:text-amber-100">
            Scheduled Orders
          </h2>

          <p className="mt-1 text-sm font-semibold text-amber-800/70 dark:text-amber-100/60">
            Upcoming food pre-orders not yet released to the kitchen.
          </p>
        </div>

        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-600 text-sm font-black text-white">
          {orders.length}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {orders.map((order) => (
          <KitchenScheduledOrderCard key={order.id} order={order} />
        ))}
      </div>
    </section>
  );
}
function KitchenLane({
  title,
  description,
  orders,
  type,
  showHistory,
  displayMode,
}: {
  title: string;
  description: string;
  orders: KitchenOrder[];
  type: 'pending' | 'preparing' | 'ready';
  showHistory: boolean;
  displayMode: KitchenDisplayMode;
}) {
  const isTvMode = displayMode === 'tv';

  const laneTheme =
    type === 'pending'
      ? 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10'
      : type === 'preparing'
        ? 'border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10'
        : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10';

  return (
    <section
      className={cn(
        'overflow-hidden rounded-[2rem] border',
        isTvMode
          ? laneTheme
          : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900'
      )}
    >
      <div className={cn('flex items-center justify-between gap-3', isTvMode ? 'px-5 pt-5' : 'px-4 pt-4')}>
        <div>
          <h2
            className={cn(
              'font-black text-neutral-950 dark:text-white',
              isTvMode ? 'text-4xl' : 'text-xl md:text-2xl'
            )}
          >
            {title}
          </h2>

          <p
            className={cn(
              'mt-1 font-semibold text-neutral-500 dark:text-neutral-400',
              isTvMode ? 'text-base' : 'text-xs md:text-sm'
            )}
          >
            {description}
          </p>
        </div>

        <span
          className={cn(
            'grid shrink-0 place-items-center rounded-full bg-black font-black text-white dark:bg-gold dark:text-black',
            isTvMode ? 'size-14 text-2xl' : 'size-9 text-sm'
          )}
        >
          {orders.length}
        </span>
      </div>

      <div className={cn(isTvMode ? 'px-5 pb-5 pt-5' : 'px-4 pb-4 pt-4')}>
        {orders.length === 0 ? (
          <div
            className={cn(
              'grid w-full place-items-center rounded-[1.5rem] border border-dashed border-neutral-200 bg-white text-center dark:border-neutral-800 dark:bg-neutral-950',
              isTvMode ? 'min-h-40 p-8' : 'min-h-24 p-5'
            )}
          >
            <p
              className={cn(
                'font-black text-neutral-500 dark:text-neutral-400',
                isTvMode ? 'text-xl' : 'text-sm'
              )}
            >
              No {title.toLowerCase()} orders
            </p>
          </div>
        ) : (
          <div
            className="grid items-start justify-start gap-4"
            style={{
              gridTemplateColumns: isTvMode
                ? 'repeat(auto-fit, minmax(min(100%, 390px), 1fr))'
                : 'repeat(auto-fit, minmax(min(100%, 300px), 380px))',
            }}
          >
            {orders.map((order) => (
              <KitchenOrderCard
                key={order.id}
                order={order}
                type={type}
                showHistory={showHistory}
                displayMode={displayMode}
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
  mode?: string;
  success?: string;
  error?: string;
}>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const showHistory = params?.history === '1';
  const message = getKitchenMessage(params?.success, params?.error);
  const displayMode: KitchenDisplayMode =
  params?.mode === 'tv' ? 'tv' : 'normal';

  const isTvMode = displayMode === 'tv';

  const baseWhere =
    user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

 const activeKitchenStatuses = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
] as const;



const [liveOrders, scheduledOrders, historyOrders] = await Promise.all([
  db.order.findMany({
    where: {
      ...baseWhere,
      status: {
        in: [...activeKitchenStatuses],
      },
      OR: [
        {
          fulfillmentTiming: FulfillmentTiming.ASAP,
        },
        {
          releasedAt: {
            not: null,
          },
        },
      ],
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
        in: [...activeKitchenStatuses],
      },
      fulfillmentTiming: FulfillmentTiming.SCHEDULED,
      releasedAt: null,
      scheduledReleaseStatus: ScheduledReleaseStatus.SCHEDULED,
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
    orderBy: [
      {
        scheduledFor: 'asc',
      },
      {
        createdAt: 'asc',
      },
    ],
    take: 30,
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
            className={cn(
              'min-h-[100dvh] overflow-y-auto text-neutral-950 dark:text-white',
              isTvMode
                ? 'bg-neutral-950 p-5'
                : 'bg-white px-4 pb-28 pt-4 dark:bg-neutral-950 xl:px-6'
            )}
          >
                <RealtimeKitchenRefresh />
      <KitchenToast message={message} showHistory={showHistory} />

      <div
  className={cn(
    'mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between',
    isTvMode && 'rounded-[2rem] border border-white/10 bg-white/5 p-5'
  )}
>
  {isTvMode ? (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-gold">
        TV Display Mode
      </p>

      <h1 className="mt-2 text-5xl font-black tracking-tight text-white">
        Kitchen Display
      </h1>

      <p className="mt-2 text-base font-semibold text-white/50">
        Large-screen live view for pending, preparing, ready, and scheduled orders.
      </p>
    </div>
  ) : (
    <PageHeader
      title="Kitchen Display"
      description="Live kitchen workflow for pending, preparing, ready, and item-level cancellation updates."
    />
  )}

  <div className="flex flex-wrap gap-2">
    <KitchenManualRefreshButton />

    <KitchenFullscreenButton targetId="kitchen-display-fullscreen" />

    <Link
      href={
        isTvMode
          ? buildKitchenModeHref({
              history: showHistory,
              mode: 'normal',
            })
          : buildKitchenModeHref({
              history: showHistory,
              mode: 'tv',
            })
      }
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition',
        isTvMode
          ? 'bg-gold text-black hover:bg-gold/80'
          : 'border border-neutral-200 bg-white text-black hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800'
      )}
    >
      {isTvMode ? 'Normal Mode' : 'TV Mode'}
    </Link>

    {!isTvMode ? (
      <Link
        href={
          showHistory
            ? buildKitchenModeHref({
                mode: displayMode,
              })
            : buildKitchenModeHref({
                history: true,
                mode: displayMode,
              })
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
    ) : null}
  </div>
</div>

      <div
        className={cn(
          'grid gap-4',
          showHistory && !isTvMode
            ? 'xl:grid-cols-[minmax(0,1fr)_360px]'
            : 'xl:grid-cols-1'
        )}
      >
        <main
        className={cn(
          'flex flex-col',
          isTvMode ? 'gap-5' : 'gap-4',
          showHistory && !isTvMode ? 'hidden xl:flex' : 'flex'
        )}
      >
          <KitchenLane
            title="Pending"
            description="New orders waiting for accept or reject."
            orders={pendingOrders}
            type="pending"
            showHistory={showHistory}
            displayMode={displayMode}
          />

         <KitchenLane
              title="Preparing"
              description="Accepted orders and orders currently being prepared."
              orders={preparingOrders}
              type="preparing"
              showHistory={showHistory}
              displayMode={displayMode}
            />
          <KitchenLane
          title="Ready"
          description="Orders ready to be delivered to the guest."
          orders={readyOrders}
          type="ready"
          showHistory={showHistory}
          displayMode={displayMode}
        />

          <KitchenScheduledLane orders={scheduledOrders} />

        </main>

        <aside
            className={cn(
              'h-fit',
              showHistory && !isTvMode ? 'block xl:sticky xl:top-4' : 'hidden'
            )}
          >
          <section className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-soft dark:border-neutral-800 dark:bg-neutral-900">
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
