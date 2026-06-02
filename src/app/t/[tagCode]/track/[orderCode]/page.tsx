import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  MenuAvailabilityMovementType,
  OrderItemStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Circle,
  Clock,
  ConciergeBell,
  CreditCard,
  MapPin,
  PackageCheck,
  ReceiptText,
  Timer,
  Truck,
  Utensils,
} from 'lucide-react';
import { db } from '@/lib/db';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { getCurrentNfcGuestSession } from '@/lib/nfc-guest-session';
import { GuestBottomNav, GuestLogo } from '@/components/guest/GuestShell';
import { LiveElapsedTimer } from '@/components/guest/LiveElapsedTimer';
import { RealtimeOrderRefresh } from '@/components/guest/RealtimeOrderRefresh';
import { cleanText } from '@/lib/sanitize';
import { triggerOrderStatusUpdate } from '@/lib/realtime/order-events';
import { triggerKitchenOrderUpdated } from '@/lib/realtime/kitchen-events';
import { triggerInventoryUpdated } from '@/lib/realtime/inventory-events';

export const dynamic = 'force-dynamic';

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const trackingSteps = [
  {
    status: OrderStatus.PENDING,
    label: 'Order Received',
    description: 'Your order has been sent to the hotel team.',
  },
  {
    status: OrderStatus.ACCEPTED,
    label: 'Order Confirmed',
    description: 'Your order has been accepted by staff.',
  },
  {
    status: OrderStatus.PREPARING,
    label: 'Preparing',
    description: 'The kitchen is preparing your order.',
  },
  {
    status: OrderStatus.READY,
    label: 'Ready / Dispatching',
    description: 'Your order is ready and will be delivered soon.',
  },
  {
    status: OrderStatus.DELIVERED,
    label: 'Delivered',
    description: 'Your order has been delivered.',
  },
] as const;

const cancelReasons = [
  'Guest changed their mind',
  'Wrong item selected',
  'Duplicate item',
  'Delivery taking too long',
  'Need to update order',
  'Other',
];

type TrackingOrderItem = {
  id: string;
  productId: string | null;
  productNameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  notes: string | null;
  isBundleSnapshot: boolean;
  status: OrderItemStatus;
  cancelledQty: number;
  cancelledAt: Date | null;
  cancelReason: string | null;
  bundleComponents: {
    id: string;
    componentProductId: string | null;
    componentNameSnapshot: string;
    quantity: number;
  }[];
};

type RestoreRequirement = {
  productId: string;
  productName: string;
  quantity: number;
  deductionType: MenuAvailabilityMovementType;
  restoreType: MenuAvailabilityMovementType;
  reason: string;
  duplicateGuardText: string;
  orderCode: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function money(cents: number) {
  return pesoFormatter.format(cents / 100);
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
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function paymentLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function getActiveItemQuantity(item: {
  quantity: number;
  cancelledQty?: number | null;
}) {
  return Math.max(item.quantity - (item.cancelledQty ?? 0), 0);
}

function getBundleComponentRestoreQuantity({
  componentQuantity,
  itemQuantity,
  cancelQuantity,
}: {
  componentQuantity: number;
  itemQuantity: number;
  cancelQuantity: number;
}) {
  if (itemQuantity <= 0 || cancelQuantity <= 0 || componentQuantity <= 0) {
    return 0;
  }

  return Math.max(
    Math.round((componentQuantity / itemQuantity) * cancelQuantity),
    0
  );
}

function getItemStatusClass(item: TrackingOrderItem) {
  const activeQty = getActiveItemQuantity(item);

  if (item.status === OrderItemStatus.CANCELLED || activeQty <= 0) {
    return 'bg-red-500/15 text-red-200';
  }

  if (item.status === OrderItemStatus.PARTIALLY_CANCELLED) {
    return 'bg-amber-500/15 text-amber-200';
  }

  return 'bg-emerald-500/15 text-emerald-200';
}

function getStatusContent(status: OrderStatus) {
  switch (status) {
    case OrderStatus.PENDING:
      return {
        title: 'Waiting for confirmation',
        subtitle:
          'Your order was received and is waiting for hotel staff confirmation.',
        etaLabel: 'Estimated confirmation time',
        eta: '2 - 5 mins',
        timerLabel: 'Time since order was placed',
      };

    case OrderStatus.ACCEPTED:
      return {
        title: 'Your order is confirmed',
        subtitle: 'The hotel team accepted your order.',
        etaLabel: 'Estimated delivery time',
        eta: '20 - 25 mins',
        timerLabel: 'Time since confirmation',
      };

    case OrderStatus.PREPARING:
      return {
        title: 'Your order is being prepared',
        subtitle: 'The kitchen is currently preparing your food.',
        etaLabel: 'Estimated remaining time',
        eta: '15 - 20 mins',
        timerLabel: 'Time in preparation',
      };

    case OrderStatus.READY:
      return {
        title: 'Your order is ready',
        subtitle: 'Your order is ready and will be delivered to your room soon.',
        etaLabel: 'Estimated delivery time',
        eta: '5 - 10 mins',
        timerLabel: 'Time since ready',
      };

    case OrderStatus.DELIVERED:
      return {
        title: 'Order delivered',
        subtitle: 'Your order has been delivered. Enjoy your meal.',
        etaLabel: 'Status',
        eta: 'Delivered',
        timerLabel: 'Completed in',
      };

    case OrderStatus.CANCELLED:
      return {
        title: 'Order cancelled',
        subtitle:
          'This order has been cancelled. Please contact staff if you need assistance.',
        etaLabel: 'Status',
        eta: 'Cancelled',
        timerLabel: 'Cancelled after',
      };

    default:
      return {
        title: 'Tracking your order',
        subtitle: 'Your order status is being updated.',
        etaLabel: 'Estimated delivery time',
        eta: '20 - 25 mins',
        timerLabel: 'Running timer',
      };
  }
}

function getStepIndex(status: OrderStatus) {
  return trackingSteps.findIndex((step) => step.status === status);
}

function getHighestCompletedStepIndex(
  statusHistory: {
    status: OrderStatus;
  }[]
) {
  const indexes = statusHistory
    .map((history) => getStepIndex(history.status))
    .filter((index) => index >= 0);

  return indexes.length ? Math.max(...indexes) : 0;
}

function getTimerStart(order: {
  createdAt: Date;
  status: OrderStatus;
  statusHistory: {
    status: OrderStatus;
    createdAt: Date;
  }[];
}) {
  if (
    order.status === OrderStatus.DELIVERED ||
    order.status === OrderStatus.CANCELLED
  ) {
    return order.createdAt;
  }

  const currentStatusHistory = [...order.statusHistory]
    .reverse()
    .find((history) => history.status === order.status);

  return currentStatusHistory?.createdAt ?? order.createdAt;
}

function getTimerEnd(order: {
  status: OrderStatus;
  statusHistory: {
    status: OrderStatus;
    createdAt: Date;
  }[];
}) {
  if (
    order.status !== OrderStatus.DELIVERED &&
    order.status !== OrderStatus.CANCELLED
  ) {
    return null;
  }

  const currentStatusHistory = [...order.statusHistory]
    .reverse()
    .find((history) => history.status === order.status);

  return currentStatusHistory?.createdAt ?? null;
}

function addRestoreRequirement(
  requirements: Map<string, RestoreRequirement>,
  input: RestoreRequirement
) {
  const key = `${input.productId}:${input.restoreType}:${input.duplicateGuardText}`;
  const existing = requirements.get(key);

  if (existing) {
    existing.quantity += input.quantity;
    return;
  }

  requirements.set(key, input);
}

async function applyRestoreRequirements({
  tx,
  hotelId,
  requirements,
}: {
  tx: Prisma.TransactionClient;
  hotelId: string;
  requirements: Map<string, RestoreRequirement>;
}) {
  const restoredProductIds: string[] = [];

  for (const requirement of requirements.values()) {
    if (requirement.quantity <= 0) {
      continue;
    }

    const existingRestore = await tx.menuAvailabilityMovement.findFirst({
      where: {
        hotelId,
        productId: requirement.productId,
        type: requirement.restoreType,
        reason: {
          contains: requirement.duplicateGuardText,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingRestore) {
      continue;
    }

    const deductionMovements = await tx.menuAvailabilityMovement.findMany({
      where: {
        hotelId,
        productId: requirement.productId,
        type: requirement.deductionType,
        reason: {
          contains: requirement.orderCode,
        },
      },
      select: {
        quantity: true,
      },
    });

    const deductedQuantity = deductionMovements.reduce(
      (sum, movement) => sum + movement.quantity,
      0
    );

    if (deductedQuantity <= 0) {
      continue;
    }

    const restoreQuantity = Math.min(requirement.quantity, deductedQuantity);

    if (restoreQuantity <= 0) {
      continue;
    }

    const stock = await tx.menuAvailabilityStock.findUnique({
      where: {
        hotelId_productId: {
          hotelId,
          productId: requirement.productId,
        },
      },
      select: {
        id: true,
        availableQty: true,
        soldQty: true,
      },
    });

    if (!stock) {
      continue;
    }

    const updatedStock = await tx.menuAvailabilityStock.update({
      where: {
        id: stock.id,
      },
      data: {
        availableQty: {
          increment: restoreQuantity,
        },
        soldQty: {
          decrement: Math.min(stock.soldQty, restoreQuantity),
        },
        isSoldOut: false,
      },
      select: {
        availableQty: true,
      },
    });

    await tx.menuAvailabilityMovement.create({
      data: {
        hotelId,
        productId: requirement.productId,
        stockId: stock.id,
        type: requirement.restoreType,
        quantity: restoreQuantity,
        balanceAfter: updatedStock.availableQty,
        reason: requirement.reason,
        userId: null,
      },
    });

    restoredProductIds.push(requirement.productId);
  }

  return Array.from(new Set(restoredProductIds));
}

async function buildRestoreRequirementsForOrderItem({
  tx,
  order,
  item,
  quantityToRestore,
}: {
  tx: Prisma.TransactionClient;
  order: {
    hotelId: string;
    orderCode: string;
  };
  item: TrackingOrderItem;
  quantityToRestore: number;
}) {
  const restoreRequirements = new Map<string, RestoreRequirement>();
  const itemGuard = `${order.orderCode}:${item.id}`;

  if (quantityToRestore <= 0) {
    return restoreRequirements;
  }

  if (item.isBundleSnapshot) {
    if (item.bundleComponents.length > 0) {
      for (const component of item.bundleComponents) {
        if (!component.componentProductId) {
          continue;
        }

        const componentRestoreQty = getBundleComponentRestoreQuantity({
          componentQuantity: component.quantity,
          itemQuantity: item.quantity,
          cancelQuantity: quantityToRestore,
        });

        addRestoreRequirement(restoreRequirements, {
          productId: component.componentProductId,
          productName: component.componentNameSnapshot,
          quantity: componentRestoreQty,
          deductionType: MenuAvailabilityMovementType.BUNDLE_ORDER_DEDUCTION,
          restoreType: MenuAvailabilityMovementType.BUNDLE_CANCEL_RESTORE,
          reason: `Guest cancelled bundle item ${item.productNameSnapshot} from order ${order.orderCode}. Restore guard: ${itemGuard}`,
          duplicateGuardText: itemGuard,
          orderCode: order.orderCode,
        });
      }

      return restoreRequirements;
    }

    if (item.productId) {
      const currentBundleComponents = await tx.menuBundleComponent.findMany({
        where: {
          bundleProductId: item.productId,
        },
        include: {
          componentProduct: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      for (const component of currentBundleComponents) {
        addRestoreRequirement(restoreRequirements, {
          productId: component.componentProductId,
          productName: component.componentProduct.name,
          quantity: component.quantity * quantityToRestore,
          deductionType: MenuAvailabilityMovementType.BUNDLE_ORDER_DEDUCTION,
          restoreType: MenuAvailabilityMovementType.BUNDLE_CANCEL_RESTORE,
          reason: `Guest cancelled bundle item ${item.productNameSnapshot} from order ${order.orderCode}. Restore guard: ${itemGuard}`,
          duplicateGuardText: itemGuard,
          orderCode: order.orderCode,
        });
      }
    }

    return restoreRequirements;
  }

  if (!item.productId) {
    return restoreRequirements;
  }

  addRestoreRequirement(restoreRequirements, {
    productId: item.productId,
    productName: item.productNameSnapshot,
    quantity: quantityToRestore,
    deductionType: MenuAvailabilityMovementType.ORDER_DEDUCTION,
    restoreType: MenuAvailabilityMovementType.CANCEL_RESTORE,
    reason: `Guest cancelled item ${item.productNameSnapshot} from order ${order.orderCode}. Restore guard: ${itemGuard}`,
    duplicateGuardText: itemGuard,
    orderCode: order.orderCode,
  });

  return restoreRequirements;
}

function recalculateOrderTotalsAfterItemCancellation({
  order,
  cancelledItemId,
}: {
  order: {
    subtotalCents: number;
    serviceChargeCents: number;
    taxCents: number;
    items: {
      id: string;
      quantity: number;
      unitPriceCents: number;
      cancelledQty: number;
    }[];
  };
  cancelledItemId: string;
}) {
  const serviceChargeRate =
    order.subtotalCents > 0
      ? order.serviceChargeCents / order.subtotalCents
      : 0;

  const taxRate =
    order.subtotalCents > 0 ? order.taxCents / order.subtotalCents : 0;

  const nextSubtotalCents = order.items.reduce((sum, item) => {
    const cancelledQty =
      item.id === cancelledItemId ? item.quantity : item.cancelledQty;

    const activeQty = Math.max(item.quantity - cancelledQty, 0);

    return sum + activeQty * item.unitPriceCents;
  }, 0);

  const nextServiceChargeCents = Math.round(
    nextSubtotalCents * serviceChargeRate
  );
  const nextTaxCents = Math.round(nextSubtotalCents * taxRate);

  return {
    subtotalCents: nextSubtotalCents,
    serviceChargeCents: nextServiceChargeCents,
    taxCents: nextTaxCents,
    totalCents:
      nextSubtotalCents + nextServiceChargeCents + nextTaxCents,
  };
}

async function cancelGuestOrderItemAction(formData: FormData) {
  'use server';

  const tagCode = cleanText(formData.get('tagCode'), 160);
  const orderCode = cleanText(formData.get('orderCode'), 120);
  const orderItemId = cleanText(formData.get('orderItemId'), 120);
  const reason = cleanText(formData.get('reason'), 300);

  if (!tagCode || !orderCode || !orderItemId) {
    throw new Error('Order item cancellation details are incomplete.');
  }

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag || tag.status !== 'ACTIVE') {
    notFound();
  }

  const guestSession = await getCurrentNfcGuestSession(tagCode);

  if (!guestSession) {
    notFound();
  }

  if (guestSession.tagId !== tag.id || guestSession.hotelId !== tag.hotelId) {
    notFound();
  }

  const order = await db.order.findFirst({
    where: {
      orderCode,
      tagId: tag.id,
      hotelId: tag.hotelId,
      guestSessionId: guestSession.id,
    },
    select: {
      id: true,
      hotelId: true,
      status: true,
      orderCode: true,
      subtotalCents: true,
      serviceChargeCents: true,
      taxCents: true,
      items: {
        select: {
          id: true,
          productId: true,
          productNameSnapshot: true,
          quantity: true,
          unitPriceCents: true,
          notes: true,
          isBundleSnapshot: true,
          status: true,
          cancelledQty: true,
          cancelledAt: true,
          cancelReason: true,
          bundleComponents: {
            select: {
              id: true,
              componentProductId: true,
              componentNameSnapshot: true,
              quantity: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    notFound();
  }

  if (order.status !== OrderStatus.PENDING) {
    throw new Error('Only pending orders can have items cancelled.');
  }

  const item = order.items.find((orderItem) => orderItem.id === orderItemId);

  if (!item) {
    throw new Error('Order item not found.');
  }

  const activeQty = getActiveItemQuantity(item);

  if (activeQty <= 0 || item.status === OrderItemStatus.CANCELLED) {
    throw new Error('This item is already cancelled.');
  }

  let finalOrderStatus = order.status;
  let statusUpdatedAt = new Date();
  let restoredProductIds: string[] = [];

  const allItemsCancelled = order.items.every((orderItem) => {
    if (orderItem.id === item.id) {
      return true;
    }

    return (
      orderItem.status === OrderItemStatus.CANCELLED ||
      getActiveItemQuantity(orderItem) <= 0
    );
  });

  const totals = recalculateOrderTotalsAfterItemCancellation({
    order,
    cancelledItemId: item.id,
  });

  await db.$transaction(async (tx) => {
    const restoreRequirements = await buildRestoreRequirementsForOrderItem({
      tx,
      order,
      item,
      quantityToRestore: activeQty,
    });

    restoredProductIds = await applyRestoreRequirements({
      tx,
      hotelId: order.hotelId,
      requirements: restoreRequirements,
    });

    await tx.orderItem.update({
      where: {
        id: item.id,
      },
      data: {
        status: OrderItemStatus.CANCELLED,
        cancelledQty: item.quantity,
        cancelledAt: new Date(),
        cancelReason: reason || 'Guest cancelled this item',
        cancelledById: null,
      },
    });

    if (allItemsCancelled) {
      finalOrderStatus = OrderStatus.CANCELLED;

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: OrderStatus.CANCELLED,
          subtotalCents: 0,
          serviceChargeCents: 0,
          taxCents: 0,
          totalCents: 0,
        },
      });

      const history = await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: OrderStatus.CANCELLED,
          note:
            reason ||
            `Guest cancelled all remaining items. Last item: ${item.productNameSnapshot}.`,
        },
        select: {
          createdAt: true,
        },
      });

      statusUpdatedAt = history.createdAt;
      return;
    }

    await tx.order.update({
      where: {
        id: order.id,
      },
      data: {
        subtotalCents: totals.subtotalCents,
        serviceChargeCents: totals.serviceChargeCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
      },
    });

    const history = await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: order.status,
        note:
          reason ||
          `Guest cancelled item ${item.productNameSnapshot}.`,
      },
      select: {
        createdAt: true,
      },
    });

    statusUpdatedAt = history.createdAt;
  });

  revalidatePath('/dashboard/orders');
  revalidatePath('/dashboard/kitchen');
  revalidatePath('/dashboard/inventory');
  revalidatePath('/dashboard/menu');
  revalidatePath(`/t/${tagCode}/track/${order.orderCode}`);
  revalidatePath(`/t/${tagCode}/orders`);
  revalidatePath(`/t/${tagCode}/menu`);

  await triggerOrderStatusUpdate({
    orderCode: order.orderCode,
    status: finalOrderStatus,
    updatedAt: statusUpdatedAt.toISOString(),
  });

  await triggerKitchenOrderUpdated({
    hotelId: order.hotelId,
    orderCode: order.orderCode,
    status: finalOrderStatus,
    source: 'DASHBOARD',
  });

  if (restoredProductIds.length > 0) {
    await triggerInventoryUpdated({
      hotelId: order.hotelId,
      productIds: restoredProductIds,
      source: 'GUEST_PORTAL',
    });
  }

  redirect(`/t/${tagCode}/track/${order.orderCode}`);
}

function OrderItemLine({
  item,
  orderStatus,
  tagCode,
  orderCode,
}: {
  item: TrackingOrderItem;
  orderStatus: OrderStatus;
  tagCode: string;
  orderCode: string;
}) {
  const activeQty = getActiveItemQuantity(item);
  const isCancelled = activeQty <= 0 || item.status === OrderItemStatus.CANCELLED;
  const itemTotal = activeQty * item.unitPriceCents;

  const canCancel =
    orderStatus === OrderStatus.PENDING && !isCancelled && activeQty > 0;

  return (
    <div
      className={
        isCancelled
          ? 'rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm'
          : 'rounded-2xl bg-white/5 p-3 text-sm'
      }
    >
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={
                isCancelled
                  ? 'font-bold text-red-100 line-through decoration-red-300'
                  : 'font-bold text-white'
              }
            >
              {isCancelled ? item.quantity : activeQty}×{' '}
              {item.productNameSnapshot}
            </p>

            {item.isBundleSnapshot ? (
              <span className="rounded-full bg-gold/15 px-3 py-1 text-[10px] font-black text-gold">
                Bundle
              </span>
            ) : null}

            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black ${getItemStatusClass(
                item
              )}`}
            >
              {item.status.replaceAll('_', ' ')}
            </span>
          </div>

          {item.cancelledQty > 0 ? (
            <p className="mt-1 text-xs font-bold text-red-200">
              Cancelled quantity: {item.cancelledQty}
            </p>
          ) : null}

          {item.cancelReason ? (
            <p className="mt-1 text-xs font-bold text-red-200">
              Reason: {item.cancelReason}
            </p>
          ) : null}

          {item.notes ? (
            <p className="mt-1 whitespace-pre-line text-xs text-white/40">
              {item.notes}
            </p>
          ) : null}
        </div>

        <b className="shrink-0">{money(itemTotal)}</b>
      </div>

      {item.isBundleSnapshot ? (
        <div className="mt-3 rounded-xl bg-gold/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gold">
            Includes
          </p>

          {item.bundleComponents.length ? (
            <div className="mt-2 space-y-1">
              {item.bundleComponents.map((component) => (
                <p
                  key={component.id}
                  className="text-xs font-bold text-white/75"
                >
                  {component.quantity}× {component.componentNameSnapshot}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs font-bold text-white/45">
              Bundle component details were not saved for this order.
            </p>
          )}
        </div>
      ) : null}

      {canCancel ? (
        <details className="mt-3 rounded-xl bg-red-500/10 p-3">
          <summary className="cursor-pointer text-xs font-black text-red-100">
            Cancel this item
          </summary>

          <form action={cancelGuestOrderItemAction} className="mt-3 space-y-3">
            <input type="hidden" name="tagCode" value={tagCode} />
            <input type="hidden" name="orderCode" value={orderCode} />
            <input type="hidden" name="orderItemId" value={item.id} />

            <label className="grid gap-1">
              <span className="text-[11px] font-black uppercase text-red-100">
                Reason
              </span>
              <select
                name="reason"
                defaultValue={cancelReasons[0]}
                className="h-10 rounded-xl border border-white/10 bg-black px-3 text-xs font-bold text-white outline-none"
              >
                {cancelReasons.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="h-10 w-full rounded-xl bg-red-600 text-xs font-black text-white"
            >
              Confirm Cancel Item
            </button>

            <p className="text-[11px] leading-5 text-red-100/70">
              This will cancel only this item and restore its stock. Other items
              in this order will remain active.
            </p>
          </form>
        </details>
      ) : null}
    </div>
  );
}

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{
    tagCode: string;
    orderCode: string;
  }>;
}) {
  const { tagCode, orderCode } = await params;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag) {
    notFound();
  }

  const guestSession = await getCurrentNfcGuestSession(tagCode);

  if (!guestSession) {
    notFound();
  }

  if (guestSession.tagId !== tag.id || guestSession.hotelId !== tag.hotelId) {
    notFound();
  }

  const order = await db.order.findFirst({
    where: {
      orderCode,
      tagId: tag.id,
      hotelId: tag.hotelId,
      guestSessionId: guestSession.id,
    },
    include: {
      hotel: {
        include: {
          settings: true,
        },
      },
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
      statusHistory: {
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          status: true,
          note: true,
          createdAt: true,
        },
      },
    },
  });

  if (!order) {
    notFound();
  }

  const roomLabel = order.room
    ? `Room ${order.room.number}`
    : order.location?.name ?? tag.location?.name ?? tag.label;

  const statusContent = getStatusContent(order.status);

  const currentStepIndex =
    order.status === OrderStatus.CANCELLED
      ? getHighestCompletedStepIndex(order.statusHistory)
      : getStepIndex(order.status);

  const historyByStatus = new Map(
    order.statusHistory.map((history) => [history.status, history])
  );

  const timerStart = getTimerStart(order);
  const timerEnd = getTimerEnd(order);

  const isCancelled = order.status === OrderStatus.CANCELLED;
  const isDelivered = order.status === OrderStatus.DELIVERED;

  return (
    <main className="min-h-screen bg-black text-white">
      <RealtimeOrderRefresh tagCode={tagCode} orderCode={order.orderCode} />

      <div className="mx-auto min-h-screen max-w-md bg-black px-5 pb-32 pt-5">
        <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
          <Link
            href={`/t/${tagCode}`}
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeft className="size-6" />
          </Link>

          <div className="text-center">
            <h1 className="text-xl font-black">Order Tracking</h1>
            <p className="text-sm text-white/45">{roomLabel}</p>
          </div>

          <div />
        </div>

        <section className="py-8 text-center">
          <div className="mb-8 flex justify-center">
            <GuestLogo hotel={order.hotel} />
          </div>

          {isCancelled ? (
            <div className="mx-auto mb-6 grid size-20 place-items-center rounded-[2rem] border border-red-500/40 bg-red-500/10 text-red-300">
              <AlertTriangle className="size-9" />
            </div>
          ) : isDelivered ? (
            <div className="mx-auto mb-6 grid size-20 place-items-center rounded-[2rem] border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
              <PackageCheck className="size-9" />
            </div>
          ) : (
            <div className="mx-auto mb-6 grid size-20 place-items-center rounded-[2rem] border border-gold/40 bg-gold/10 text-gold">
              <Utensils className="size-9" />
            </div>
          )}

          <h2 className="font-serif text-5xl leading-tight text-white">
            {statusContent.title}
          </h2>

          <p className="mx-auto mt-4 max-w-xs text-sm leading-6 text-white/50">
            {statusContent.subtitle}
          </p>

          <div className="mt-8">
            <p className="text-sm font-bold text-white/45">
              {statusContent.etaLabel}
            </p>

            <p
              className={cx(
                'mt-2 text-3xl font-black',
                isCancelled ? 'text-red-300' : 'text-white'
              )}
            >
              {statusContent.eta}
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-gold/25 bg-gold/10 p-5 text-center">
          <div className="mb-3 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-gold">
            <Timer className="size-4" />
            Running Timer
          </div>

          <p className="text-5xl font-black">
            <LiveElapsedTimer from={timerStart} to={timerEnd} />
          </p>

          <p className="mt-3 text-sm text-white/45">
            {statusContent.timerLabel}
          </p>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black">Live Progress</h2>
              <p className="mt-1 text-xs text-white/45">
                Updates automatically through realtime WebSocket events.
              </p>
            </div>

            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/70">
              {order.status.replaceAll('_', ' ')}
            </span>
          </div>

          <div className="space-y-5">
            {trackingSteps.map((step, index) => {
              const history = historyByStatus.get(step.status);
              const active = order.status === step.status;
              const done = currentStepIndex >= index && !isCancelled;

              const cancelledButCompleted =
                isCancelled && currentStepIndex >= index;

              const completed = done || cancelledButCompleted;

              return (
                <div key={step.status} className="relative flex gap-4">
                  {index < trackingSteps.length - 1 ? (
                    <div
                      className={cx(
                        'absolute left-4 top-9 h-8 w-px',
                        completed ? 'bg-gold' : 'bg-white/20'
                      )}
                    />
                  ) : null}

                  <div
                    className={cx(
                      'z-10 grid size-8 shrink-0 place-items-center rounded-full border',
                      completed
                        ? 'border-gold bg-gold text-ink'
                        : 'border-white/25 bg-black text-white/40'
                    )}
                  >
                    {completed && !active ? (
                      <Check className="size-4" />
                    ) : active ? (
                      <Clock className="size-4" />
                    ) : (
                      <Circle className="size-3" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p
                          className={cx(
                            'font-black',
                            completed || active ? 'text-white' : 'text-white/45'
                          )}
                        >
                          {step.label}
                        </p>

                        <p className="mt-1 text-xs text-white/45">
                          {step.description}
                        </p>
                      </div>

                      {history ? (
                        <p className="shrink-0 text-xs font-semibold text-white/45">
                          {formatTime(history.createdAt)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}

            {isCancelled ? (
              <div className="relative flex gap-4">
                <div className="z-10 grid size-8 shrink-0 place-items-center rounded-full border border-red-500 bg-red-500 text-white">
                  <AlertTriangle className="size-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-red-200">Order Cancelled</p>
                      <p className="mt-1 text-xs text-white/45">
                        This order was cancelled.
                      </p>
                    </div>

                    {historyByStatus.get(OrderStatus.CANCELLED) ? (
                      <p className="shrink-0 text-xs font-semibold text-white/45">
                        {formatTime(
                          historyByStatus.get(OrderStatus.CANCELLED)!.createdAt
                        )}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <ReceiptText className="size-5 text-gold" />
            <h2 className="font-black">Order Details</h2>
          </div>

          <div className="space-y-2">
            {order.items.map((item) => (
              <OrderItemLine
                key={item.id}
                item={item}
                orderStatus={order.status}
                tagCode={tagCode}
                orderCode={order.orderCode}
              />
            ))}
          </div>

          <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between text-white/50">
              <span>Subtotal</span>
              <span>{money(order.subtotalCents)}</span>
            </div>

            <div className="flex justify-between text-white/50">
              <span>Service Charge</span>
              <span>{money(order.serviceChargeCents)}</span>
            </div>

            <div className="flex justify-between text-white/50">
              <span>Tax</span>
              <span>{money(order.taxCents)}</span>
            </div>

            <div className="flex justify-between pt-2 text-lg font-black text-white">
              <span>Total</span>
              <span>{money(order.totalCents)}</span>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Truck className="size-5 text-gold" />
            <h2 className="font-black">Delivery Details</h2>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3 rounded-2xl bg-white/5 p-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-gold" />
              <div>
                <p className="font-black">Room / Location</p>
                <p className="mt-1 text-white/50">{roomLabel}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl bg-white/5 p-3">
              <CreditCard className="mt-0.5 size-4 shrink-0 text-gold" />
              <div>
                <p className="font-black">Payment</p>
                <p className="mt-1 text-white/50">
                  {paymentLabel(order.paymentMethod)} · {order.paymentStatus}
                </p>
              </div>
            </div>

            {order.guestName ? (
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="font-black">Guest Name</p>
                <p className="mt-1 text-white/50">{order.guestName}</p>
              </div>
            ) : null}

            {order.notes ? (
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="font-black">Special Notes</p>
                <p className="mt-1 whitespace-pre-line text-white/50">
                  {order.notes}
                </p>
              </div>
            ) : null}

            <div className="rounded-2xl bg-white/5 p-3">
              <p className="font-black">Order Code</p>
              <p className="mt-1 text-white/50">{order.orderCode}</p>
              <p className="mt-1 text-xs text-white/35">
                Ordered at {formatDateTime(order.createdAt)}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <ConciergeBell className="size-5 text-gold" />
            <h2 className="font-black">Need help?</h2>
          </div>

          <p className="text-sm leading-6 text-white/50">
            Contact the front desk if you need to update, follow up, or report
            an issue with this order.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link
              href={`/t/${tagCode}/contact`}
              className="rounded-2xl bg-gold px-4 py-3 text-center text-sm font-black text-ink"
            >
              Contact Front Desk
            </Link>

            <Link
              href={`/t/${tagCode}/service`}
              className="rounded-2xl border border-white/15 px-4 py-3 text-center text-sm font-black text-white"
            >
              Request Assistance
            </Link>
          </div>
        </section>
      </div>

      <GuestBottomNav tagCode={tagCode} active="order" dark />
    </main>
  );
}