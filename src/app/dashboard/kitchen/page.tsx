import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  DashboardModule,
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
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { KitchenRunningTimer } from '@/components/dashboard/KitchenRunningTimer';
import { KitchenFullscreenButton } from '@/components/dashboard/KitchenFullscreenButton';
import { RealtimeKitchenRefresh } from '@/components/dashboard/RealtimeKitchenRefresh';
import { db } from '@/lib/db';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';
import { updateOrderStatusAction } from '../orders/actions';
import { KitchenStatusActionButton } from '@/components/dashboard/KitchenStatusActionButton';
import { KitchenManualRefreshButton } from '@/components/dashboard/KitchenManualRefreshButton';
import { KitchenTvPagedLane } from '@/components/dashboard/KitchenTvPagedLane';
import { KitchenSwipeDragController } from '@/components/dashboard/KitchenSwipeDragController';
import { KitchenFocusOrderScroller } from '@/components/dashboard/KitchenFocusOrderScroller';

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
  room: { number: string; name?: string | null } | null;
  location: { name: string } | null;
  items: KitchenOrderItem[];
  fulfillmentTiming: FulfillmentTiming;
  scheduledFor: Date | null;
  releaseAt: Date | null;
  releasedAt: Date | null;
  scheduledReleaseStatus: ScheduledReleaseStatus;
  scheduledNote: string | null;
};

type KitchenDisplayMode = 'normal' | 'tv' | 'rush';
type KitchenViewMode = 'live' | 'scheduled';

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


const rushMetaPillClass =
  'inline-flex max-w-full items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200';

function getKitchenDragFormId(orderId: string, targetStatus: OrderStatus) {
  const safeOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, '_');

  return `kitchen-drag-status-${safeOrderId}-${targetStatus}`;
}

function KitchenDragStatusForm({
  orderId,
  targetStatus,
  history,
}: {
  orderId: string;
  targetStatus: OrderStatus;
  history?: string;
}) {
  return (
    <form
      id={getKitchenDragFormId(orderId, targetStatus)}
      action={updateKitchenOrderStatusAction}
      className="hidden"
      data-kitchen-status-form="true"
      data-order-id={orderId}
      data-target-status={targetStatus}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value={targetStatus} />
      <input type="hidden" name="history" value={history ?? ''} />
      <input
        type="hidden"
        name="note"
        value={`Kitchen display swipe/drag moved order to ${targetStatus.replaceAll(
          '_',
          ' '
        )}`}
      />
    </form>
  );
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
  view = 'live',
}: {
  history?: boolean;
  mode?: KitchenDisplayMode;
  view?: KitchenViewMode;
}) {
  const query = new URLSearchParams();

  if (history) {
    query.set('history', '1');
  }

  if (mode && mode !== 'normal') {
    query.set('mode', mode);
  }

  if (view !== 'live') {
    query.set('view', view);
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
async function updateKitchenOrderStatusAction(formData: FormData): Promise<void> {
  'use server';

  await updateOrderStatusAction(formData);

  revalidatePath('/dashboard/kitchen');
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
  room: { number: string; name?: string | null } | null;
  location: { name: string } | null;
}) {
  if (order.room) {
    return `Room ${order.room.number}${
      order.room.name ? ` — ${order.room.name}` : ''
    }`;
  }

  if (order.location) return order.location.name;
  return 'Guest location';
}

function roomNumberOnly(order: {
  room: { number: string; name?: string | null } | null;
  location: { name: string } | null;
}) {
  if (order.room) {
    return `Room ${order.room.number}`;
  }

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

function getRushItemIndicatorClass(item: KitchenOrderItem) {
  if (isCancelledKitchenItem(item)) {
    return 'bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.12)]';
  }

  if (item.status === OrderItemStatus.PARTIALLY_CANCELLED) {
    return 'bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.12)]';
  }

  return 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]';
}

function getActiveItemCount(items: KitchenOrderItem[]) {
  return items.reduce((sum, item) => sum + getActiveItemQuantity(item), 0);
}

function getCancelledItemCount(items: KitchenOrderItem[]) {
  return items.filter((item) => isCancelledKitchenItem(item)).length;
}



function getDisplayGuestNote(notes?: string | null) {
  const rawNote = notes?.trim();

  if (!rawNote) {
    return '';
  }

  const cleanedNote = rawNote
    .replace(
      /Order Type:.*?Guest confirmed the selected order type before placing this order\.?/gis,
      ''
    )
    .replace(/^Order Type:.*$/gim, '')
    .replace(
      /Guest confirmed the selected order type before placing this order\.?/gi,
      ''
    )
    .replace(/^Guest note:\s*/gim, '')
    .trim();

  return cleanedNote;
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

function KitchenOrderItemLine({
  item,
  compact = false,
}: {
  item: KitchenOrderItem;
  compact?: boolean;
}) {
  const activeQty = getActiveItemQuantity(item);
  const isCancelled = isCancelledKitchenItem(item);
  const shouldShowItemStatusBadge = !compact;
  const indicatorLabel = isCancelled
    ? 'Cancelled item'
    : item.status === OrderItemStatus.PARTIALLY_CANCELLED
      ? 'Partially cancelled item'
      : 'Active item';

  return (
    <div
      className={cn(
        isCancelled
          ? 'border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10'
          : 'bg-neutral-50 dark:bg-neutral-950',
        compact ? 'rounded-md px-2 py-1 text-[10px]' : 'rounded-xl px-3 py-2 text-xs'
      )}
    >
      <div className={cn('flex flex-wrap items-center justify-between', compact ? 'gap-0.5' : 'gap-2')}>
        <div className="min-w-0">
          <div className={cn('flex min-w-0 flex-wrap items-center', compact ? 'gap-1' : 'gap-2')}>
            <span
              className={cn(
                'shrink-0 rounded-full',
                compact ? 'size-2' : 'size-2.5',
                compact
                  ? getRushItemIndicatorClass(item)
                  : isCancelled
                    ? 'bg-red-500'
                    : item.status === OrderItemStatus.PARTIALLY_CANCELLED
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
              )}
              title={indicatorLabel}
              aria-label={indicatorLabel}
            />

            <b
              className={cn(
                'min-w-0 leading-tight',
                isCancelled
                  ? 'text-red-700 line-through decoration-red-400 dark:text-red-200'
                  : 'text-neutral-950 dark:text-white'
              )}
            >
              {isCancelled ? item.quantity : activeQty}×{' '}
              {item.productNameSnapshot}
            </b>

            {item.isBundleSnapshot ? (
              <span
                className={cn(
                  'rounded-full bg-amber-100 py-0.5 font-black leading-none text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
                  compact ? 'px-1.5 text-[8px]' : 'px-2 text-[10px]'
                )}
              >
                Bundle
              </span>
            ) : null}

            {shouldShowItemStatusBadge ? (
              <span
                className={cn(
                  'rounded-full py-0.5 font-black leading-none',
                  compact ? 'px-1.5 text-[8px]' : 'px-2 text-[10px]',
                  getItemStatusClass(item)
                )}
              >
                {item.status.replaceAll('_', ' ')}
              </span>
            ) : null}
          </div>

          {item.cancelledQty > 0 ? (
            <p className={cn(compact ? 'mt-0.5' : 'mt-1', 'text-[10px] font-black leading-tight text-red-700 dark:text-red-200')}>
              Cancelled qty: {item.cancelledQty}
            </p>
          ) : null}

          {item.cancelReason ? (
            <p className={cn(compact ? 'mt-0.5' : 'mt-1', 'text-[10px] font-medium leading-tight text-red-700 dark:text-red-200')}>
              Reason: {item.cancelReason}
            </p>
          ) : null}

          {item.notes ? (
            <p className={cn(compact ? 'mt-0.5' : 'mt-1', 'text-[10px] font-medium leading-tight text-neutral-500 dark:text-neutral-400')}>
              Note: {item.notes}
            </p>
          ) : null}
        </div>
      </div>

      {item.isBundleSnapshot ? (
        <div
          className={cn(
            isCancelled
              ? 'rounded-md bg-red-100/80 dark:bg-red-500/10'
              : 'rounded-md bg-amber-50 dark:bg-amber-500/10',
            compact ? 'mt-1 p-1' : 'mt-2 p-2'
          )}
        >
          <p
            className={cn(
              'font-black uppercase tracking-[0.12em]',
              compact ? 'text-[8px]' : 'text-[10px]',
              isCancelled
                ? 'text-red-700 dark:text-red-200'
                : 'text-amber-700 dark:text-amber-200'
            )}
          >
            Includes
          </p>

          {item.bundleComponents.length ? (
            <div className={cn(compact ? 'mt-0.5 space-y-0' : 'mt-1 space-y-0.5')}>
              {item.bundleComponents.map((component) => (
                <p
                  key={component.id}
                  className={cn(
                    'flex items-center gap-1 font-bold leading-tight',
                    compact ? 'text-[10px]' : 'text-[11px]',
                    isCancelled
                      ? 'text-red-800 dark:text-red-200'
                      : 'text-amber-900 dark:text-amber-100'
                  )}
                >
                  <span
                    className={cn(
                      'shrink-0 rounded-full',
                      compact ? 'size-1.5' : 'size-1.5',
                      compact
                        ? getRushItemIndicatorClass(item)
                        : isCancelled
                          ? 'bg-red-500'
                          : item.status === OrderItemStatus.PARTIALLY_CANCELLED
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                    )}
                    title={indicatorLabel}
                    aria-label={indicatorLabel}
                  />
                  {component.quantity}× {component.componentNameSnapshot}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-0.5 text-[10px] font-bold leading-tight text-neutral-500">
              No bundle component snapshot.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function KitchenRushReadyCard({
  order,
  focusedOrderCode,
}: {
  order: KitchenOrder;
  focusedOrderCode?: string;
}) {
  const guestName = order.guestName?.trim() || 'Guest name not provided';
  const isFocused = Boolean(focusedOrderCode && order.orderCode === focusedOrderCode);

  return (
    <details
      data-kitchen-order-code={order.orderCode}
      data-focused-kitchen-order={isFocused ? 'true' : undefined}
      className={cn(
        'group rounded-xl border border-neutral-200 bg-white p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900',
        isFocused && 'ring-4 ring-orange-400/60 shadow-[0_0_0_6px_rgba(251,146,60,0.12)]'
      )}
    >
      <summary className="list-none cursor-pointer rounded-lg outline-none transition hover:bg-neutral-50 focus-visible:ring-4 focus-visible:ring-emerald-500/15 dark:hover:bg-neutral-800/60 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-start justify-between gap-2 p-1">
          <div className="min-w-0 space-y-1">
            <span className={cn(rushMetaPillClass, 'max-w-full')}>
              {order.orderCode}
            </span>

            <span className={cn(rushMetaPillClass, 'max-w-full')}>
              {roomNumberOnly(order)} · {guestName}
            </span>

            <p className="text-[9px] font-black uppercase tracking-wide text-emerald-700 opacity-80 dark:text-emerald-200">
              Tap to view items
            </p>
          </div>
        </div>
      </summary>

      <div className="grid grid-rows-[0fr] transition-all duration-300 ease-out group-open:grid-rows-[1fr]">
        <div className="overflow-hidden">
          <div className="mt-2 grid gap-1 border-t border-neutral-100 pt-2 dark:border-neutral-800">
            {order.items.length ? (
              order.items.map((item) => (
                <KitchenOrderItemLine key={item.id} item={item} compact />
              ))
            ) : (
              <p className="rounded-lg bg-neutral-50 px-2 py-1 text-[10px] font-bold text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
                No item snapshot.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 [&_button]:min-h-7 [&_button]:rounded-lg [&_button]:px-2 [&_button]:py-1 [&_button]:text-[10px]">
        <KitchenStatusActionButton
          orderId={order.id}
          status={OrderStatus.DELIVERED}
          label="Delivered"
          tone="dark"
        />
      </div>
    </details>
  );
}


function KitchenOrderCard({
  order,
  type,
  showHistory,
  displayMode,
  focusedOrderCode,
}: {
  order: KitchenOrder;
  type: 'pending' | 'preparing' | 'ready';
  showHistory: boolean;
  displayMode: KitchenDisplayMode;
  focusedOrderCode?: string;
}) {
  const guestName = order.guestName?.trim() || 'Guest name not provided';
  const activeItemCount = getActiveItemCount(order.items);
  const cancelledItemCount = getCancelledItemCount(order.items);
  const isTvMode = displayMode === 'tv';
  const isRushMode = displayMode === 'rush';
  const visibleItems = order.items;
  const shouldUseRushFoodGrid =
    isRushMode && (type === 'pending' || type === 'preparing');
  const rushGridItems =
    shouldUseRushFoodGrid && visibleItems.length > 9
      ? visibleItems.slice(0, 8)
      : visibleItems;
  const hiddenRushItemCount = Math.max(
    visibleItems.length - rushGridItems.length,
    0
  );
  const guestNote = getDisplayGuestNote(order.notes);
  const roomLocationLabel = roomOrLocation(order);
  const rushHeaderMeta = `${roomLocationLabel} · ${guestName}`;
  const canMoveWithRushGesture =
    isRushMode && (type === 'pending' || type === 'preparing');
  const isFocused = Boolean(focusedOrderCode && order.orderCode === focusedOrderCode);

  const displayStatus =
    order.status === OrderStatus.ACCEPTED
      ? OrderStatus.PREPARING
      : order.status;

  return (
    <article
      draggable={canMoveWithRushGesture}
      data-kitchen-order-code={order.orderCode}
      data-focused-kitchen-order={isFocused ? 'true' : undefined}
      data-kitchen-draggable-card={canMoveWithRushGesture ? 'true' : undefined}
      data-kitchen-swipe-card={canMoveWithRushGesture ? 'true' : undefined}
      data-order-id={canMoveWithRushGesture ? order.id : undefined}
      data-current-lane={canMoveWithRushGesture ? type : undefined}
      className={cn(
        'grid w-full overflow-hidden border bg-white shadow-soft transition-transform dark:border-neutral-800 dark:bg-neutral-900',
        canMoveWithRushGesture &&
          'cursor-grab active:cursor-grabbing [touch-action:pan-y] data-[dragging=true]:opacity-60',
        isTvMode
          ? 'rounded-[2rem] border-white/10 bg-white/95 shadow-2xl'
          : isRushMode
            ? 'rounded-2xl border-neutral-200 shadow-sm'
            : 'rounded-[1.25rem] border-neutral-200',
        isFocused && 'ring-4 ring-orange-400/60 shadow-[0_0_0_6px_rgba(251,146,60,0.12)]'
      )}
    >
      <div
        className={cn(
          'border-b border-neutral-100 dark:border-neutral-800',
          isTvMode ? 'p-5' : isRushMode ? 'p-2' : 'p-2.5'
        )}
      >
        <div className={cn('flex items-start justify-between', isRushMode ? 'gap-2' : 'gap-3')}>
          <div className="min-w-0 flex-1">
            {isRushMode ? (
              <div className="min-w-0 space-y-1">
                <span className={cn(rushMetaPillClass, 'max-w-full')}>
                  {order.orderCode}
                </span>

                <span className={cn(rushMetaPillClass, 'max-w-full')}>
                  {rushHeaderMeta}
                </span>
              </div>
            ) : (
              <>
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
                  {roomLocationLabel} · {guestName}
                </p>
              </>
            )}
          </div>

          <div className={cn('flex shrink-0 flex-nowrap items-center justify-end whitespace-nowrap [&>*]:mt-0', isRushMode ? 'gap-1' : 'gap-2')}>
            {!isRushMode ? <StatusBadge status={displayStatus} /> : null}
            <KitchenRunningTimer startedAt={order.createdAt.toISOString()} />
          </div>
        </div>

        <div
          className={cn(
            'grid gap-1 rounded-xl bg-neutral-50 dark:bg-neutral-950',
            isTvMode
              ? 'mt-3 p-4 text-base'
              : isRushMode
                ? 'mt-2 p-1.5 text-[10px]'
                : 'mt-3 p-2 text-[11px]'
          )}
        >
          {!isRushMode ? (
            <p className="truncate">
              <span className="font-black text-neutral-950 dark:text-white">
                Guest:
              </span>{' '}
              <span className="font-semibold text-neutral-600 dark:text-neutral-400">
                {guestName}
              </span>
            </p>
          ) : null}

          <p>
            <span className="font-black text-neutral-950 dark:text-white">
              Order Time:
            </span>{' '}
            <span className="font-semibold text-neutral-600 dark:text-neutral-400">
              {formatTime(order.createdAt)}
            </span>
          </p>

          {!isRushMode || cancelledItemCount > 0 ? (
            <div
              className={cn(
                'flex flex-wrap gap-1',
                isRushMode ? 'mt-1' : 'mt-2'
              )}
            >
              {!isRushMode ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                  {activeItemCount} active
                </span>
              ) : null}

              {cancelledItemCount > 0 ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700 dark:bg-red-500/15 dark:text-red-200">
                  {cancelledItemCount} cancelled
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          shouldUseRushFoodGrid
            ? 'grid grid-cols-3 gap-1 p-1.5'
            : isRushMode
              ? 'space-y-1 p-1.5'
              : 'space-y-2',
          isTvMode ? 'p-5' : !isRushMode ? 'p-2.5' : ''
        )}
      >
        {rushGridItems.map((item) => (
          <KitchenOrderItemLine key={item.id} item={item} compact={isRushMode} />
        ))}

        {hiddenRushItemCount > 0 ? (
          <div className="grid min-h-[32px] place-items-center rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-2 py-1 text-center text-[10px] font-black text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
            +{hiddenRushItemCount} more item
            {hiddenRushItemCount === 1 ? '' : 's'}
          </div>
        ) : null}

        {guestNote ? (
          <div
            className={cn(
              'whitespace-pre-line rounded-xl bg-yellow-50 text-yellow-900 dark:bg-yellow-500/10 dark:text-yellow-200',
              shouldUseRushFoodGrid ? 'col-span-3' : '',
              isTvMode ? 'p-4 text-base' : isRushMode ? 'p-1.5 text-[11px]' : 'p-2 text-xs'
            )}
          >
            <b>Guest note:</b> {guestNote}
          </div>
        ) : null}
      </div>

      {!isTvMode ? (
        <div
          className={cn(
            'border-t border-neutral-100 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950',
            isRushMode
              ? 'p-1.5 [&_button]:min-h-8 [&_button]:rounded-lg [&_button]:px-2 [&_button]:py-1.5 [&_button]:text-[11px]'
              : 'p-2.5'
          )}
        >
          {type === 'pending' ? (
            <div className={cn('grid grid-cols-2', isRushMode ? 'gap-1.5' : 'gap-2')}>
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
              label="Ready"
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

      {isRushMode && type === 'pending' ? (
        <KitchenDragStatusForm
          orderId={order.id}
          targetStatus={OrderStatus.PREPARING}
          history={showHistory ? '1' : ''}
        />
      ) : null}

      {isRushMode && type === 'preparing' ? (
        <KitchenDragStatusForm
          orderId={order.id}
          targetStatus={OrderStatus.READY}
          history={showHistory ? '1' : ''}
        />
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
 

  return (
   <section className="max-h-[calc(100dvh-190px)] overflow-y-auto rounded-[2rem] border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
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
  {orders.length > 0 ? (
    orders.map((order) => (
      <KitchenScheduledOrderCard key={order.id} order={order} />
    ))
  ) : (
    <div className="md:col-span-2 2xl:col-span-3">
      <div className="grid min-h-64 place-items-center rounded-[1.5rem] border border-dashed border-amber-200 bg-white/80 p-8 text-center dark:border-amber-500/20 dark:bg-neutral-950/70">
        <div>
          <Clock className="mx-auto size-10 text-amber-500" />

          <p className="mt-3 font-black text-amber-900 dark:text-amber-100">
            No scheduled orders
          </p>

          <p className="mt-1 text-sm font-semibold text-amber-700/70 dark:text-amber-100/60">
            Upcoming pre-orders will appear here automatically.
          </p>
        </div>
      </div>
    </div>
  )}
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
  focusedOrderCode,
}: {
  title: string;
  description: string;
  orders: KitchenOrder[];
  type: 'pending' | 'preparing' | 'ready';
  showHistory: boolean;
  displayMode: KitchenDisplayMode;
  focusedOrderCode?: string;
}) {
  const isTvMode = displayMode === 'tv';
  const isRushMode = displayMode === 'rush';
  const usesLaneTheme = isTvMode || isRushMode;

  const laneTheme =
    type === 'pending'
      ? 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10'
      : type === 'preparing'
        ? 'border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10'
        : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10';

  const dropStatus =
    isRushMode && type === 'preparing'
      ? OrderStatus.PREPARING
      : isRushMode && type === 'ready'
        ? OrderStatus.READY
        : undefined;

  return (
      <section
      data-kitchen-drop-status={dropStatus}
      className={cn(
        'flex flex-col overflow-hidden border md:h-full',
        isRushMode
          ? type === 'ready'
            ? 'min-h-[260px] rounded-[1.5rem]'
            : 'min-h-[360px] rounded-[1.5rem]'
          : 'min-h-[420px] rounded-[2rem]',
        usesLaneTheme
          ? `${laneTheme} ${isTvMode ? 'min-h-[calc(100dvh-220px)]' : ''}`
          : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900'
      )}
    >
      <div
        className={cn(
          'shrink-0 flex items-start justify-between gap-3 border-b border-black/5 dark:border-white/10',
          isTvMode ? 'px-5 py-5' : isRushMode ? 'px-3 py-3' : 'px-4 py-4'
        )}
      >
        <div className="min-w-0">
          <h2
            className={cn(
              'font-black text-neutral-950 dark:text-white',
              isTvMode ? 'text-4xl' : isRushMode ? 'text-xl' : 'text-2xl'
            )}
          >
            {title}
          </h2>

          <p
            className={cn(
              'mt-1 font-semibold text-neutral-500 dark:text-neutral-400',
              isTvMode ? 'text-base' : isRushMode ? 'text-xs' : 'text-sm'
            )}
          >
            {description}
          </p>
        </div>

        <span
          className={cn(
            'grid shrink-0 place-items-center rounded-full bg-black font-black text-white dark:bg-gold dark:text-black',
            isTvMode ? 'size-14 text-2xl' : isRushMode ? 'size-8 text-xs' : 'size-10 text-sm'
          )}
        >
          {orders.length}
        </span>
      </div>

      <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain',
            isTvMode
              ? 'p-5 pr-3'
              : isRushMode && type === 'ready'
                ? 'p-2 pr-1.5'
                : isRushMode
                  ? 'p-2.5 pr-2'
                  : 'p-4 pr-2'
          )}
        >
        {orders.length === 0 ? (
          <div
            className={cn(
              'grid h-full min-h-40 w-full place-items-center rounded-[1.5rem] border border-dashed border-neutral-200 bg-white text-center dark:border-neutral-800 dark:bg-neutral-950',
              isTvMode ? 'p-8' : isRushMode ? 'p-4' : 'p-5'
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
          <div className={cn('grid', isRushMode ? 'gap-2' : 'gap-3')}>
            {orders.map((order) =>
              isRushMode && type === 'ready' ? (
                <KitchenRushReadyCard key={order.id} order={order} focusedOrderCode={focusedOrderCode} />
              ) : (
                <KitchenOrderCard
                  key={order.id}
                  order={order}
                  type={type}
                  showHistory={showHistory}
                  displayMode={displayMode}
                  focusedOrderCode={focusedOrderCode}
                />
              )
            )}
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
  view?: string;
  error?: string;
  focusOrder?: string;
}>;
}) {
  const user = await requireDashboardPermission(
    DashboardModule.KITCHEN_DISPLAY,
    'canView'
  );
  const params = await searchParams;
  const activeView: KitchenViewMode =
  params?.view === 'scheduled' ? 'scheduled' : 'live';

const isScheduledView = activeView === 'scheduled';
const focusOrderCode = String(params?.focusOrder ?? '').trim().slice(0, 120);
  const showHistory = params?.history === '1';
  const message = getKitchenMessage(params?.success, params?.error);
 const displayMode: KitchenDisplayMode =
  params?.mode === 'tv' ? 'tv' : 'rush';

const isTvMode = displayMode === 'tv';
const isRushMode = displayMode === 'rush';

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
            'h-[100dvh] overflow-y-auto text-neutral-950 dark:text-white md:overflow-hidden',
            isTvMode
              ? 'bg-neutral-950 p-5'
              : 'bg-white px-3 pb-24 pt-3 dark:bg-neutral-950 md:px-4 md:pb-4 md:pt-4 xl:px-6'
          )}
      >
      <RealtimeKitchenRefresh fallbackIntervalMs={30_000} refreshDebounceMs={500} />
      <KitchenSwipeDragController />
      <KitchenFocusOrderScroller orderCode={focusOrderCode} />
      <KitchenToast message={message} showHistory={showHistory} />

      <div
  className={cn(
    'mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between',
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

<div className="flex flex-wrap gap-2 md:justify-end">
  <KitchenManualRefreshButton />

  <KitchenFullscreenButton targetId="kitchen-display-fullscreen" />

  {activeView === 'live' ? (
    <Link
      href={
        isTvMode
          ? buildKitchenModeHref({
              history: showHistory,
              mode: 'normal',
              view: 'live',
            })
          : buildKitchenModeHref({
              history: showHistory,
              mode: 'tv',
              view: 'live',
            })
      }
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition',
        isTvMode
          ? 'bg-gold text-black hover:bg-gold/80'
          : 'border border-neutral-200 bg-white text-black hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800'
      )}
    >
      {isTvMode ? 'Exit TV' : 'TV Mode'}
    </Link>
  ) : null}

  {!isTvMode ? (
    <>
      <Link
        href={buildKitchenModeHref({
          history: false,
          mode: 'rush',
          view: 'scheduled',
        })}
        className={
          activeView === 'scheduled'
            ? 'inline-flex min-h-11 items-center gap-2 rounded-2xl bg-black px-4 py-2 text-sm font-black text-white transition hover:bg-neutral-800 dark:bg-gold dark:text-black dark:hover:bg-gold/80'
            : 'inline-flex min-h-11 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800'
        }
      >
        <Clock className="size-4" />
        Scheduled Orders

        {scheduledOrders.length > 0 ? (
          <span className="grid size-6 place-items-center rounded-full bg-amber-100 text-[11px] font-black text-amber-800">
            {scheduledOrders.length}
          </span>
        ) : null}
      </Link>

      {activeView === 'live' ? (
        <Link
          href={
            showHistory
              ? buildKitchenModeHref({
                  history: false,
                  mode: displayMode,
                  view: 'live',
                })
              : buildKitchenModeHref({
                  history: true,
                  mode: displayMode,
                  view: 'live',
                })
          }
          className={
            showHistory
              ? 'inline-flex min-h-11 items-center gap-2 rounded-2xl bg-black px-4 py-2 text-sm font-black text-white transition hover:bg-neutral-800 dark:bg-gold dark:text-black dark:hover:bg-gold/80'
              : 'inline-flex min-h-11 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800'
          }
        >
          <History className="size-4" />
          {showHistory ? 'Hide History' : 'History'}
        </Link>
      ) : null}

      <Link
        href={buildKitchenModeHref({
          history: showHistory,
          mode: 'rush',
          view: 'live',
        })}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition',
          activeView === 'live' && isRushMode
            ? 'bg-black text-white hover:bg-neutral-800 dark:bg-gold dark:text-black dark:hover:bg-gold/80'
            : 'border border-neutral-200 bg-white text-black hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800'
        )}
      >
        Rush Mode
      </Link>
    </>
  ) : null}
</div>
</div>

      <div
          className={cn(
            'grid min-h-0 gap-3 md:h-[calc(100dvh-160px)] xl:h-[calc(100dvh-170px)]',
            showHistory && !isTvMode && !isScheduledView
              ? 'md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]'
              : 'md:grid-cols-1'
          )}
        >
            <main
          className={cn(
            'min-h-0 flex-col overflow-hidden',
            isTvMode ? 'gap-5' : isRushMode ? 'gap-3' : 'gap-4',
            showHistory && !isTvMode && !isScheduledView ? 'hidden md:flex' : 'flex'
          )}
        >
    {isScheduledView ? (
  <KitchenScheduledLane orders={scheduledOrders} />
) : isRushMode ? (
  <div className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
    <KitchenLane
      title="Pending"
      description="Oldest pending orders first."
      orders={pendingOrders}
      type="pending"
      showHistory={showHistory}
      displayMode={displayMode}
      focusedOrderCode={focusOrderCode}
    />

    <KitchenLane
      title="Preparing"
      description="Accepted orders currently being prepared."
      orders={preparingOrders}
      type="preparing"
      showHistory={showHistory}
      displayMode={displayMode}
      focusedOrderCode={focusOrderCode}
    />

    <KitchenLane
      title="Ready"
      description="Orders ready for delivery."
      orders={readyOrders}
      type="ready"
      showHistory={showHistory}
      displayMode={displayMode}
      focusedOrderCode={focusOrderCode}
    />
  </div>
) : isTvMode ? (
  <div className="grid min-h-0 gap-3 md:grid-cols-3 xl:gap-4">
    <KitchenTvPagedLane
      title="Pending"
      description="Auto-rotating pending orders."
      type="pending"
      totalOrders={pendingOrders.length}
      pageSize={3}
      intervalMs={10_000}
    >
      {pendingOrders.map((order) => (
        <KitchenOrderCard
          key={order.id}
          order={order}
          type="pending"
          showHistory={showHistory}
          displayMode={displayMode}
        />
      ))}
    </KitchenTvPagedLane>

    <KitchenTvPagedLane
      title="Preparing"
      description="Auto-rotating orders in preparation."
      type="preparing"
      totalOrders={preparingOrders.length}
      pageSize={3}
      intervalMs={10_000}
    >
      {preparingOrders.map((order) => (
        <KitchenOrderCard
          key={order.id}
          order={order}
          type="preparing"
          showHistory={showHistory}
          displayMode={displayMode}
        />
      ))}
    </KitchenTvPagedLane>

    <KitchenTvPagedLane
      title="Ready"
      description="Auto-rotating orders ready for delivery."
      type="ready"
      totalOrders={readyOrders.length}
      pageSize={3}
      intervalMs={10_000}
    >
      {readyOrders.map((order) => (
        <KitchenOrderCard
          key={order.id}
          order={order}
          type="ready"
          showHistory={showHistory}
          displayMode={displayMode}
        />
      ))}
    </KitchenTvPagedLane>
  </div>
) : (
  <div className="grid min-h-0 gap-3 md:grid-cols-3 xl:gap-4">
    <KitchenLane
      title="Pending"
      description="New orders waiting for accept or reject."
      orders={pendingOrders}
      type="pending"
      showHistory={showHistory}
      displayMode={displayMode}
      focusedOrderCode={focusOrderCode}
    />

    <KitchenLane
      title="Preparing"
      description="Accepted orders and orders currently being prepared."
      orders={preparingOrders}
      type="preparing"
      showHistory={showHistory}
      displayMode={displayMode}
      focusedOrderCode={focusOrderCode}
    />

    <KitchenLane
      title="Ready"
      description="Orders ready to be delivered to the guest."
      orders={readyOrders}
      type="ready"
      showHistory={showHistory}
      displayMode={displayMode}
      focusedOrderCode={focusOrderCode}
    />
  </div>
)}

        </main>

        <aside
            className={cn(
              'h-fit',
             showHistory && !isTvMode && !isScheduledView ? 'block xl:sticky xl:top-4' : 'hidden'
            )}
          >
        <section className="flex h-full max-h-full flex-col overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-soft dark:border-neutral-800 dark:bg-neutral-900">
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
