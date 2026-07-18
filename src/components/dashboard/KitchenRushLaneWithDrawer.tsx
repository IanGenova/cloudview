'use client';

import { DashboardToastViewport } from '@/components/dashboard/DashboardToastViewport';

import {useEffect, useState, useTransition } from 'react';
import type { OrderStatus } from '@prisma/client';
import {
  ChevronRight,
  Clock3,
  MapPin,
  AlertTriangle, CheckCircle2,
  ReceiptText,
  UserRound,
  X,
} from 'lucide-react';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { KitchenRunningTimer } from '@/components/dashboard/KitchenRunningTimer';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

type KitchenRushStatusAction = (formData: FormData) => Promise<unknown>;

type KitchenRushActionStatus =
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED';

type KitchenRushToast =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

type KitchenLaneType = 'pending' | 'preparing' | 'ready';

const ORDER_STATUS = {
  PREPARING: 'PREPARING' as OrderStatus,
  CANCELLED: 'CANCELLED' as OrderStatus,
  READY: 'READY' as OrderStatus,
  DELIVERED: 'DELIVERED' as OrderStatus,
};

export type KitchenRushOrderForClient = {
  id: string;
  orderCode: string;
  status: OrderStatus;
  guestName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  room: { number: string } | null;
  location: { name: string } | null;
  items: {
    id: string;
    quantity: number;
    productNameSnapshot: string;
    notes: string | null;
    isBundleSnapshot: boolean;
    status: string;
    cancelledQty: number;
    cancelledAt: string | null;
    cancelReason: string | null;
    bundleComponents: {
      id: string;
      componentNameSnapshot: string;
      quantity: number;
    }[];
  }[];
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

function roomOrLocation(order: KitchenRushOrderForClient) {
  if (order.room) return `Room ${order.room.number}`;
  if (order.location) return order.location.name;
  return 'Guest location';
}

function getActiveItemQuantity(item: KitchenRushOrderForClient['items'][number]) {
  return Math.max(item.quantity - (item.cancelledQty ?? 0), 0);
}

function isCancelledKitchenItem(item: KitchenRushOrderForClient['items'][number]) {
  return item.status === 'CANCELLED' || getActiveItemQuantity(item) <= 0;
}

function getActiveItemCount(items: KitchenRushOrderForClient['items']) {
  return items.reduce((sum, item) => sum + getActiveItemQuantity(item), 0);
}

function getCancelledItemCount(items: KitchenRushOrderForClient['items']) {
  return items.filter((item) => isCancelledKitchenItem(item)).length;
}

function getDisplayGuestNote(notes?: string | null) {
  const rawNote = notes?.trim();

  if (!rawNote) {
    return '';
  }

  return rawNote
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
}

function getItemStatusClass(item: KitchenRushOrderForClient['items'][number]) {
  if (isCancelledKitchenItem(item)) {
    return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200';
  }

  if (item.status === 'PARTIALLY_CANCELLED') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200';
  }

  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200';
}

function getLaneAccent(type: KitchenLaneType) {
  if (type === 'pending') return 'border-l-amber-500';
  if (type === 'preparing') return 'border-l-blue-500';
  return 'border-l-emerald-500';
}

function getLaneClass(type: KitchenLaneType) {
  if (type === 'pending') {
    return 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10';
  }

  if (type === 'preparing') {
    return 'border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10';
  }

  return 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10';
}

function KitchenRushItemLine({
  item,
}: {
  item: KitchenRushOrderForClient['items'][number];
}) {
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
      <div className="flex flex-wrap items-center gap-2">
        <b
          className={
            isCancelled
              ? 'text-red-700 line-through decoration-red-400 dark:text-red-200'
              : 'text-neutral-950 dark:text-white'
          }
        >
          {isCancelled ? item.quantity : activeQty}× {item.productNameSnapshot}
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

      {item.isBundleSnapshot && item.bundleComponents.length > 0 ? (
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
        </div>
      ) : null}
    </div>
  );
}

function KitchenRushOrderDrawer({
  order,
  type,
  onClose,
  onStatusAction,
  pendingAction,
  isPending,
}: {
  order: KitchenRushOrderForClient;
  type: KitchenLaneType;
  onClose: () => void;
  onStatusAction: (payload: {
    order: KitchenRushOrderForClient;
    status: KitchenRushActionStatus;
  }) => void;
  pendingAction: string | null;
  isPending: boolean;
}) {
  
  const guestName = order.guestName?.trim() || 'Guest name not provided';
  const activeItemCount = getActiveItemCount(order.items);
  const cancelledItemCount = getCancelledItemCount(order.items);
  const guestNote = getDisplayGuestNote(order.notes);

  const displayStatus =
    order.status === 'ACCEPTED'
      ? (ORDER_STATUS.PREPARING as OrderStatus)
      : order.status;

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        aria-label="Close order drawer"
      />

      <aside role="dialog" aria-modal="true" className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col overflow-hidden bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl dark:bg-neutral-950">
        <div className="shrink-0 border-b border-neutral-200 bg-neutral-50 p-4 pt-[max(1rem,env(safe-area-inset-top))] dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-400">
                Kitchen Order Details
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black text-neutral-950 dark:text-white">
                  {order.orderCode}
                </h2>

                <StatusBadge status={displayStatus} />
                 <KitchenRunningTimer startedAt={order.createdAt} />

              </div>

              <p className="mt-1 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                {roomOrLocation(order)} · {guestName}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-neutral-500 shadow-sm hover:bg-neutral-100 dark:bg-neutral-950 dark:text-white dark:hover:bg-neutral-800"
              aria-label="Close drawer"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white p-3 text-center dark:bg-neutral-950">
              <ReceiptText className="mx-auto size-4 text-gold" />
              <p className="mt-1 text-[10px] font-black uppercase text-neutral-400">
                Items
              </p>
              <p className="text-xl font-black text-neutral-950 dark:text-white">
                {activeItemCount}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-3 text-center dark:bg-neutral-950">
              <Clock3 className="mx-auto size-4 text-gold" />
              <p className="mt-1 text-[10px] font-black uppercase text-neutral-400">
                Order Time
              </p>
              <p className="text-sm font-black text-neutral-950 dark:text-white">
                {formatTime(order.createdAt)}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-3 text-center dark:bg-neutral-950">
              <X className="mx-auto size-4 text-red-500" />
              <p className="mt-1 text-[10px] font-black uppercase text-neutral-400">
                Cancelled
              </p>
              <p className="text-xl font-black text-neutral-950 dark:text-white">
                {cancelledItemCount}
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-3">
            <div className="rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-900">
              <div className="flex items-center gap-3">
                <UserRound className="size-5 text-gold" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-400">
                    Guest
                  </p>
                  <p className="font-black text-neutral-950 dark:text-white">
                    {guestName}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-900">
              <div className="flex items-center gap-3">
                <MapPin className="size-5 text-gold" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-400">
                    Location
                  </p>
                  <p className="font-black text-neutral-950 dark:text-white">
                    {roomOrLocation(order)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <section className="mt-5">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-neutral-400">
              Full Item List
            </p>

            <div className="grid gap-2">
              {order.items.map((item) => (
                <KitchenRushItemLine key={item.id} item={item} />
              ))}
            </div>
          </section>

          {guestNote ? (
            <section className="mt-5">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-neutral-400">
                Guest Note
              </p>

              <div className="whitespace-pre-line rounded-2xl bg-yellow-50 p-4 text-sm font-semibold leading-6 text-yellow-900 dark:bg-yellow-500/10 dark:text-yellow-200">
                {guestNote}
              </div>
            </section>
          ) : null}
        </div>

       <div className="grid grid-cols-2 gap-2 border-t border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
            {type === 'pending' ? (
              <>
                <button
                  type="button"
                  disabled={isPending || pendingAction === `${order.id}:PREPARING`}
                  onClick={() =>
                    onStatusAction({
                      order,
                      status: 'PREPARING',
                    })
                  }
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-black text-sm font-black text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendingAction === `${order.id}:PREPARING` ? 'Accepting...' : 'Accept'}
                </button>

                <button
                  type="button"
                  disabled={isPending || pendingAction === `${order.id}:CANCELLED`}
                  onClick={() =>
                    onStatusAction({
                      order,
                      status: 'CANCELLED',
                    })
                  }
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-red-600 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendingAction === `${order.id}:CANCELLED` ? 'Rejecting...' : 'Reject'}
                </button>
              </>
            ) : null}

            {type === 'preparing' ? (
              <button
                type="button"
                disabled={isPending || pendingAction === `${order.id}:READY`}
                onClick={() =>
                  onStatusAction({
                    order,
                    status: 'READY',
                  })
                }
                className="col-span-2 inline-flex h-11 items-center justify-center rounded-2xl bg-black text-sm font-black text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingAction === `${order.id}:READY` ? 'Marking ready...' : 'Done / Ready'}
              </button>
            ) : null}

            {type === 'ready' ? (
              <button
                type="button"
                disabled={isPending || pendingAction === `${order.id}:DELIVERED`}
                onClick={() =>
                  onStatusAction({
                    order,
                    status: 'DELIVERED',
                  })
                }
                className="col-span-2 inline-flex h-11 items-center justify-center rounded-2xl bg-black text-sm font-black text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingAction === `${order.id}:DELIVERED` ? 'Delivering...' : 'Mark Delivered'}
              </button>
            ) : null}
          </div>
      </aside>
    </div>
  );
}

function KitchenRushOrderRow({
  order,
  type,
  onOpen,
}: {
  order: KitchenRushOrderForClient;
  type: KitchenLaneType;
  onOpen: () => void;
}) {
  const guestName = order.guestName?.trim() || 'Guest name not provided';
  const activeItemCount = getActiveItemCount(order.items);
  const cancelledItemCount = getCancelledItemCount(order.items);

  const displayStatus =
    order.status === 'ACCEPTED'
      ? (ORDER_STATUS.PREPARING as OrderStatus)
      : order.status;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full rounded-2xl border border-neutral-200 border-l-4 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-neutral-50 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-950',
        getLaneAccent(type)
      )}
    >
      <div className="grid grid-cols-[1fr_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-black text-neutral-950 dark:text-white">
              {order.orderCode}
            </h3>

            <StatusBadge status={displayStatus} />
             <KitchenRunningTimer startedAt={order.createdAt} />
          </div>

          <p className="mt-1 truncate text-xs font-bold text-neutral-500 dark:text-neutral-400">
            {roomOrLocation(order)} · {guestName}
          </p>
        </div>

        <ChevronRight className="mt-1 size-5 text-neutral-300" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-neutral-50 px-2 py-2 dark:bg-neutral-950">
          <p className="text-[9px] font-black uppercase text-neutral-400">
            Items
          </p>
          <p className="text-sm font-black text-neutral-950 dark:text-white">
            {activeItemCount}
          </p>
        </div>

        <div className="rounded-xl bg-neutral-50 px-2 py-2 dark:bg-neutral-950">
          <p className="text-[9px] font-black uppercase text-neutral-400">
            Cancelled
          </p>
          <p className="text-sm font-black text-neutral-950 dark:text-white">
            {cancelledItemCount}
          </p>
        </div>

        <div className="rounded-xl bg-neutral-50 px-2 py-2 dark:bg-neutral-950">
          <p className="text-[9px] font-black uppercase text-neutral-400">
            Time
          </p>
          <p className="text-xs font-black text-neutral-950 dark:text-white">
            {formatTime(order.createdAt)}
          </p>
        </div>
      </div>
    </button>
  );
}
function getRushKitchenSuccessText(status: KitchenRushActionStatus) {
  if (status === 'PREPARING') {
    return 'Order accepted and moved to Preparing.';
  }

  if (status === 'READY') {
    return 'Order marked as Ready.';
  }

  if (status === 'DELIVERED') {
    return 'Order marked as Delivered.';
  }

  if (status === 'CANCELLED') {
    return 'Order rejected successfully.';
  }

  return 'Kitchen order updated successfully.';
}

function getRushKitchenErrorText(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to update the kitchen order. Please try again.';
}

function KitchenRushToast({
  toast,
  onClose,
}: {
  toast: KitchenRushToast;
  onClose: () => void;
}) {
  if (!toast) {
    return null;
  }

  const isSuccess = toast.type === 'success';

  return (
    <DashboardToastViewport>
      <div
        className={
          isSuccess
            ? 'rounded-3xl border border-emerald-200 bg-emerald-50/95 p-4 text-emerald-800 shadow-2xl backdrop-blur-xl'
            : 'rounded-3xl border border-red-200 bg-red-50/95 p-4 text-red-800 shadow-2xl backdrop-blur-xl'
        }
      >
        <div className="flex items-start gap-3">
          <div
            className={
              isSuccess
                ? 'grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700'
                : 'grid size-10 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-700'
            }
          >
            {isSuccess ? (
              <CheckCircle2 className="size-5" />
            ) : (
              <AlertTriangle className="size-5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">
              {isSuccess ? 'Success' : 'Action failed'}
            </p>

            <p className="mt-1 text-sm font-black">{toast.text}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 text-current transition hover:bg-white"
            aria-label="Close notification"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </DashboardToastViewport>
  );
}


export function KitchenRushLaneWithDrawer({
  title,
  description,
  orders,
  type,
  statusAction,
}: {
  title: string;
  description: string;
  orders: KitchenRushOrderForClient[];
  type: 'pending' | 'preparing' | 'ready';
  statusAction: KitchenRushStatusAction;
}) {
  const [selectedOrder, setSelectedOrder] =
    useState<KitchenRushOrderForClient | null>(null);

    const router = useRouter();

    const [toast, setToast] = useState<KitchenRushToast>(null);
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
  if (!toast) {
    return;
  }

  const timeout = window.setTimeout(() => {
    setToast(null);
  }, 3500);

  return () => window.clearTimeout(timeout);
}, [toast]);

function runRushStatusAction({
  order,
  status,
}: {
  order: KitchenRushOrderForClient;
  status: KitchenRushActionStatus;
}) {
  if (pendingAction) {
    return;
  }

  const pendingKey = `${order.id}:${status}`;

  setPendingAction(pendingKey);

  startTransition(() => {
    void (async () => {
      try {
        const formData = new FormData();

        formData.set('orderId', order.id);
        formData.set('status', status);
        formData.set(
          'note',
          `Rush mode changed status to ${status.replaceAll('_', ' ')}`
        );

        await statusAction(formData);

        /**
         * Important:
         * This closes the Rush Mode drawer after successful Accept / Reject / Ready / Delivered.
         */
        setSelectedOrder(null);

        setToast({
          type: 'success',
          text: getRushKitchenSuccessText(status),
        });

        router.refresh();
      } catch (error) {
        setToast({
          type: 'error',
          text: getRushKitchenErrorText(error),
        });
      } finally {
        setPendingAction(null);
      }
    })();
  });
}

  return (
    <>
      <section
        className={`flex min-h-[520px] flex-col overflow-hidden rounded-[2rem] border ${getLaneClass(
          type
        )}`}
      >
        <div className="shrink-0 border-b border-black/5 px-4 py-4 dark:border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-neutral-950 dark:text-white">
                {title}
              </h2>

              <p className="mt-1 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                {description}
              </p>
            </div>

            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-black text-sm font-black text-white dark:bg-gold dark:text-black">
              {orders.length}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {orders.length === 0 ? (
            <div className="grid h-full min-h-52 place-items-center rounded-[1.5rem] border border-dashed border-neutral-200 bg-white p-5 text-center dark:border-neutral-800 dark:bg-neutral-950">
              <p className="font-black text-neutral-500 dark:text-neutral-400">
                No {title.toLowerCase()} orders
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {orders.map((order) => (
                <KitchenRushOrderRow
                  key={order.id}
                  order={order}
                  type={type}
                  onOpen={() => setSelectedOrder(order)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

     {selectedOrder ? (
        <KitchenRushOrderDrawer
          order={selectedOrder}
          type={type}
          onClose={() => setSelectedOrder(null)}
          onStatusAction={runRushStatusAction}
          pendingAction={pendingAction}
          isPending={isPending}
        />
      ) : null}
       <KitchenRushToast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}