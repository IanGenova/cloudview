import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  MenuAvailabilityMovementType,
  OrderItemStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
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
import { requestGuestFoodOrderRefund } from '@/lib/guest-paymongo-refund';

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

function getTrackingProgressPercent({
  status,
  currentStepIndex,
}: {
  status: OrderStatus;
  currentStepIndex: number;
}) {
  if (status === OrderStatus.CANCELLED) {
    return Math.max(10, Math.min(95, (currentStepIndex + 1) * 20));
  }

  switch (status) {
    case OrderStatus.PENDING:
      return 15;
    case OrderStatus.ACCEPTED:
      return 35;
    case OrderStatus.PREPARING:
      return 60;
    case OrderStatus.READY:
      return 85;
    case OrderStatus.DELIVERED:
      return 100;
    default:
      return 10;
  }
}

function getShortStepLabel(status: OrderStatus) {
  switch (status) {
    case OrderStatus.PENDING:
      return 'Received';
    case OrderStatus.ACCEPTED:
      return 'Confirmed';
    case OrderStatus.PREPARING:
      return 'Preparing';
    case OrderStatus.READY:
      return 'Ready';
    case OrderStatus.DELIVERED:
      return 'Delivered';
    default:
      return status.replaceAll('_', ' ');
  }
}

function getProgressStatusText(status: OrderStatus) {
  switch (status) {
    case OrderStatus.PENDING:
      return 'Waiting for staff confirmation';
    case OrderStatus.ACCEPTED:
      return 'Confirmed by hotel staff';
    case OrderStatus.PREPARING:
      return 'Kitchen is preparing your order';
    case OrderStatus.READY:
      return 'Ready for delivery';
    case OrderStatus.DELIVERED:
      return 'Completed';
    case OrderStatus.CANCELLED:
      return 'Cancelled';
    default:
      return 'Tracking order';
  }
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
      totalCents: true,
      paymentMethod: true,
      paymentStatus: true,
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

  let finalOrderStatus: OrderStatus = order.status;
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

  const nextTotalCents = allItemsCancelled ? 0 : totals.totalCents;
  const refundAmountCents = Math.max(order.totalCents - nextTotalCents, 0);

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

  if (
    order.paymentMethod === PaymentMethod.PAYMONGO &&
    (order.paymentStatus === PaymentStatus.PAID ||
      order.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED ||
      order.paymentStatus === PaymentStatus.REFUND_FAILED) &&
    refundAmountCents > 0
  ) {
    const refundResult = await requestGuestFoodOrderRefund({
      orderId: order.id,
      amountCents: refundAmountCents,
      reason:
        reason ||
        (allItemsCancelled
          ? `Guest cancelled order ${order.orderCode}`
          : `Guest cancelled ${item.productNameSnapshot} from ${order.orderCode}`),
      orderItemId: allItemsCancelled ? null : item.id,
      idempotencySuffix: allItemsCancelled
        ? `guest-whole-order-${order.id}`
        : `guest-item-${item.id}`,
    });

    if (!refundResult.ok && !refundResult.skipped) {
      console.error('[Guest food cancellation] PayMongo refund failed.', {
        orderId: order.id,
        orderCode: order.orderCode,
        refundAmountCents,
        refundResult,
      });
    }
  }

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

function CompactOrderProgress({
  orderStatus,
  currentStepIndex,
  historyByStatus,
  statusContent,
  timerStart,
  timerEnd,
}: {
  orderStatus: OrderStatus;
  currentStepIndex: number;
  historyByStatus: Map<
    OrderStatus,
    {
      createdAt: Date;
    }
  >;
  statusContent: ReturnType<typeof getStatusContent>;
  timerStart: Date;
  timerEnd: Date | null;
}) {
  const isCancelled = orderStatus === OrderStatus.CANCELLED;
  const isDelivered = orderStatus === OrderStatus.DELIVERED;
  const progressPercent = getTrackingProgressPercent({
    status: orderStatus,
    currentStepIndex,
  });

  const currentHistory = historyByStatus.get(orderStatus);
  const currentStepLabel =
    orderStatus === OrderStatus.CANCELLED
      ? 'Cancelled'
      : trackingSteps[currentStepIndex]?.label ?? statusContent.title;

  return (
    <section
      className={cx(
        'mt-6 rounded-[2rem] border p-6 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl',
        isCancelled
          ? 'border-red-500/25 bg-red-500/10'
          : 'border-gold/20 bg-white/[0.04]'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
            Live Progress
          </p>
          <h2 className="mt-1 font-serif text-2xl font-normal tracking-wide text-white">
            {getProgressStatusText(orderStatus)}
          </h2>
          <p className="mt-1.5 text-xs font-medium text-white/50">
            Updates automatically through realtime events.
          </p>
        </div>

        <span
          className={cx(
            'shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest',
            isCancelled
              ? 'bg-red-500/20 text-red-200'
              : isDelivered
                ? 'bg-emerald-500/20 text-emerald-200'
                : 'bg-gold/15 text-gold'
          )}
        >
          {orderStatus.replaceAll('_', ' ')}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-5 gap-1">
        {trackingSteps.map((step, index) => {
          const active =
            !isCancelled && !isDelivered && orderStatus === step.status;

          const reached =
            isDelivered ||
            (!isCancelled && currentStepIndex >= index) ||
            (isCancelled && currentStepIndex >= index);

          const completed = reached && !active;

          return (
            <div key={step.status} className="min-w-0 text-center">
              <div className="relative flex items-center justify-center">
                {index > 0 ? (
                  <span
                    className={cx(
                      'absolute right-1/2 top-1/2 h-[3px] w-full -translate-y-1/2 rounded-full',
                      reached ? 'bg-gold' : 'bg-white/10'
                    )}
                  />
                ) : null}

                <span
                  className={cx(
                    'relative z-10 grid size-9 place-items-center rounded-full border text-xs font-semibold transition',
                    active
                      ? 'animate-pulse border-gold bg-gold text-black shadow-[0_0_20px_rgba(214,167,56,0.3)]'
                      : completed
                        ? 'border-gold bg-gold text-black'
                        : 'border-white/20 bg-black text-white/40'
                  )}
                >
                  {completed ? (
                    <Check className="size-4.5" strokeWidth={2.5} />
                  ) : active ? (
                    <Clock className="size-4" strokeWidth={2} />
                  ) : (
                    <Circle className="size-3" strokeWidth={2} />
                  )}
                </span>
              </div>

              <p
                className={cx(
                  'mt-3 truncate text-[10px] font-medium tracking-wide',
                  active || completed ? 'text-white' : 'text-white/40'
                )}
              >
                {getShortStepLabel(step.status)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
            Order Progress
          </p>

          <p
            className={cx(
              'font-serif text-[15px] font-medium tracking-wide',
              isCancelled ? 'text-red-200' : 'text-gold'
            )}
          >
            {progressPercent}% complete
          </p>
        </div>

        <div className="h-2.5 overflow-hidden rounded-full bg-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
          <div
            className={cx(
              'h-full rounded-full transition-all duration-700',
              isCancelled
                ? 'bg-red-500'
                : isDelivered
                  ? 'bg-emerald-500'
                  : 'bg-[linear-gradient(90deg,#9c6c18,#d6a738,#f6d77b)]'
            )}
            style={{
              width: `${progressPercent}%`,
            }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2">
        <div className="rounded-[1.25rem] bg-black/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
            Current
          </p>
          <p className="mt-1 truncate font-serif text-[15px] font-medium tracking-wide text-white">
            {currentStepLabel}
          </p>
        </div>

        <div className="rounded-[1.25rem] bg-black/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
            Timer
          </p>
          <p className="mt-1 font-serif text-[15px] font-medium tracking-wide text-white">
            <LiveElapsedTimer from={timerStart} to={timerEnd} />
          </p>
        </div>

        <div className="rounded-[1.25rem] bg-black/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
            Updated
          </p>
          <p className="mt-1 font-serif text-[15px] font-medium tracking-wide text-white">
            {currentHistory ? formatTime(currentHistory.createdAt) : 'Now'}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-[1.25rem] bg-white/5 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
          {statusContent.etaLabel}
        </p>

        <p
          className={cx(
            'mt-1 font-serif text-3xl font-light tracking-wide',
            isCancelled ? 'text-red-200' : 'text-sand'
          )}
        >
          {statusContent.eta}
        </p>
      </div>
    </section>
  );
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
          ? 'rounded-[1.25rem] border border-red-500/20 bg-red-500/10 p-4'
          : 'rounded-[1.25rem] bg-white/5 p-4'
      }
    >
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={
                isCancelled
                  ? 'font-serif text-[15px] font-medium tracking-wide text-red-100 line-through decoration-red-300'
                  : 'font-serif text-[15px] font-medium tracking-wide text-white'
              }
            >
              {isCancelled ? item.quantity : activeQty}×{' '}
              {item.productNameSnapshot}
            </p>

            {item.isBundleSnapshot ? (
              <span className="rounded-full bg-gold/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-gold">
                Bundle
              </span>
            ) : null}

            <span
              className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${getItemStatusClass(
                item
              )}`}
            >
              {item.status.replaceAll('_', ' ')}
            </span>
          </div>

          {item.cancelledQty > 0 ? (
            <p className="mt-2 text-xs font-medium text-red-200/80">
              Cancelled quantity: {item.cancelledQty}
            </p>
          ) : null}

          {item.cancelReason ? (
            <p className="mt-1 text-xs font-medium text-red-200/80">
              Reason: {item.cancelReason}
            </p>
          ) : null}

          {item.notes ? (
            <p className="mt-2 whitespace-pre-line text-[13px] font-medium leading-relaxed text-white/50">
              <span className="text-white/70">Note: </span>{item.notes}
            </p>
          ) : null}
        </div>

        <b className="shrink-0 font-serif text-[15px] font-medium tracking-wide text-white">
          {money(itemTotal)}
        </b>
      </div>

      {item.isBundleSnapshot ? (
        <div className="mt-4 rounded-[1rem] bg-gold/10 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
            Includes
          </p>

          {item.bundleComponents.length ? (
            <div className="mt-2 space-y-1.5">
              {item.bundleComponents.map((component) => (
                <p
                  key={component.id}
                  className="text-[13px] font-medium text-white/75"
                >
                  {component.quantity}× {component.componentNameSnapshot}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[13px] font-medium text-white/45">
              Bundle component details were not saved for this order.
            </p>
          )}
        </div>
      ) : null}

      {canCancel ? (
        <details className="group mt-4 rounded-[1rem] bg-red-500/10 p-4 transition-all open:bg-red-500/15">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-widest text-red-200 transition group-open:mb-4">
            Cancel this item
          </summary>

          <form action={cancelGuestOrderItemAction} className="space-y-4">
            <input type="hidden" name="tagCode" value={tagCode} />
            <input type="hidden" name="orderCode" value={orderCode} />
            <input type="hidden" name="orderItemId" value={item.id} />

            <label className="grid gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-red-200/80">
                Reason
              </span>
              <select
                name="reason"
                defaultValue={cancelReasons[0]}
                className="h-12 rounded-[1rem] border border-red-500/20 bg-black/40 px-4 text-[13px] font-medium text-red-100 outline-none transition focus:border-red-500/50 appearance-none"
              >
                {cancelReasons.map((reason) => (
                  <option key={reason} value={reason} className="bg-[#111] text-white">
                    {reason}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="h-12 w-full rounded-[1rem] bg-red-600/90 text-[14px] font-semibold tracking-wide text-white transition hover:bg-red-500 active:scale-[0.98]"
            >
              Confirm Cancel Item
            </button>

            <p className="text-[12px] leading-5 text-red-200/60">
              This will cancel only this item and restore its stock. For a paid PayMongo order, the matching amount will also be refunded automatically. Other items in this order will remain active.
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
      guestPayMongoSessions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          status: true,
          refundStatus: true,
          refundedAmountCents: true,
          refundErrorMessage: true,
          refunds: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              amountCents: true,
              status: true,
              reason: true,
              createdAt: true,
            },
          },
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
    <main className="min-h-screen bg-[#050505] text-white">
      <RealtimeOrderRefresh tagCode={tagCode} orderCode={order.orderCode} />

      <div className="mx-auto min-h-screen max-w-md bg-[#050505] px-5 pb-32 pt-5">
        <div className="mb-6 grid grid-cols-[44px_1fr_44px] items-center">
          <Link
            href={`/t/${tagCode}`}
            className="grid size-11 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Back"
          >
            <ChevronLeft className="size-6" />
          </Link>

          <div className="text-center">
            <h1 className="font-serif text-xl font-normal tracking-wide">Order Tracking</h1>
            <p className="mt-0.5 text-xs font-medium text-white/50">{roomLabel}</p>
          </div>

          <div />
        </div>

        <section className="py-6 text-center">
          <div className="mb-6 flex justify-center">
            <GuestLogo hotel={order.hotel} />
          </div>

          {isCancelled ? (
            <div className="mx-auto mb-6 grid size-20 place-items-center rounded-[1.5rem] border border-red-500/20 bg-red-500/10 text-red-400 shadow-sm">
              <AlertTriangle className="size-8" strokeWidth={1.5} />
            </div>
          ) : isDelivered ? (
            <div className="mx-auto mb-6 grid size-20 place-items-center rounded-[1.5rem] border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-sm">
              <PackageCheck className="size-8" strokeWidth={1.5} />
            </div>
          ) : (
            <div className="mx-auto mb-6 grid size-20 place-items-center rounded-[1.5rem] border border-gold/20 bg-gold/10 text-gold shadow-sm">
              <Utensils className="size-8" strokeWidth={1.5} />
            </div>
          )}

          <h2 className="font-serif text-4xl font-light tracking-wide text-white">
            {statusContent.title}
          </h2>

          <p className="mx-auto mt-4 max-w-[280px] text-[15px] font-medium leading-relaxed text-white/60">
            {statusContent.subtitle}
          </p>

          <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm mx-auto max-w-[260px]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gold/80">
              {statusContent.etaLabel}
            </p>

            <p
              className={cx(
                'mt-2 font-serif text-4xl font-light tracking-wide',
                isCancelled ? 'text-red-300' : 'text-white'
              )}
            >
              {statusContent.eta}
            </p>
          </div>
        </section>

        <CompactOrderProgress
          orderStatus={order.status}
          currentStepIndex={currentStepIndex}
          historyByStatus={historyByStatus}
          statusContent={statusContent}
          timerStart={timerStart}
          timerEnd={timerEnd}
        />

        {order.paymentMethod === PaymentMethod.PAYMONGO ? (
          <section className="mt-6 rounded-[2rem] border border-gold/20 bg-gold/[0.07] p-5 backdrop-blur-md">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
                  PayMongo Payment
                </p>
                <h2 className="mt-1 font-serif text-xl font-normal tracking-wide text-white">
                  {paymentLabel(order.paymentStatus)}
                </h2>
                <p className="mt-2 text-xs font-medium leading-5 text-white/55">
                  Cancellation refunds are returned through PayMongo to the original payment method.
                </p>
              </div>
              <CreditCard className="size-6 text-gold" />
            </div>

            {order.guestPayMongoSessions[0]?.refundedAmountCents ? (
              <p className="mt-4 rounded-xl bg-blue-500/10 p-3 text-sm font-semibold text-blue-200">
                Refunded amount: {money(order.guestPayMongoSessions[0].refundedAmountCents)}
              </p>
            ) : null}

            {order.guestPayMongoSessions[0]?.refundErrorMessage ? (
              <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs font-semibold leading-5 text-red-200">
                {order.guestPayMongoSessions[0].refundErrorMessage}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
              <ReceiptText className="size-5" />
            </div>
            <h2 className="font-serif text-xl font-normal tracking-wide">Order Details</h2>
          </div>

          <div className="space-y-3">
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

          <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-[15px] font-medium">
            <div className="flex justify-between text-white/60">
              <span>Subtotal</span>
              <span className="font-serif tracking-wide">{money(order.subtotalCents)}</span>
            </div>

            <div className="flex justify-between text-white/60">
              <span>Service Charge</span>
              <span className="font-serif tracking-wide">{money(order.serviceChargeCents)}</span>
            </div>

            <div className="flex justify-between text-white/60">
              <span>Tax</span>
              <span className="font-serif tracking-wide">{money(order.taxCents)}</span>
            </div>

            <div className="flex justify-between pt-3 text-[17px] font-semibold text-white">
              <span>Total</span>
              <span className="font-serif text-xl tracking-wide text-gold">{money(order.totalCents)}</span>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
              <Truck className="size-5" />
            </div>
            <h2 className="font-serif text-xl font-normal tracking-wide">Delivery Details</h2>
          </div>

          <div className="space-y-3 text-[15px] font-medium">
            <div className="flex items-start gap-4 rounded-[1.25rem] bg-white/5 p-4">
              <MapPin className="mt-0.5 size-5 shrink-0 text-gold" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Room / Location</p>
                <p className="mt-1 font-serif tracking-wide text-white">{roomLabel}</p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-[1.25rem] bg-white/5 p-4">
              <CreditCard className="mt-0.5 size-5 shrink-0 text-gold" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Payment</p>
                <p className="mt-1 font-serif tracking-wide text-white capitalize">
                  {paymentLabel(order.paymentMethod).toLowerCase()} · {order.paymentStatus.toLowerCase()}
                </p>
              </div>
            </div>

            {order.guestName ? (
              <div className="rounded-[1.25rem] bg-white/5 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Guest Name</p>
                <p className="mt-1 font-serif tracking-wide text-white capitalize">{order.guestName}</p>
              </div>
            ) : null}

            {order.notes ? (
              <div className="rounded-[1.25rem] bg-white/5 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Special Notes</p>
                <p className="mt-1 whitespace-pre-line leading-relaxed text-white/75">
                  {order.notes}
                </p>
              </div>
            ) : null}

            <div className="rounded-[1.25rem] bg-white/5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Order Code</p>
              <p className="mt-1 font-serif tracking-wide text-white">{order.orderCode}</p>
              <p className="mt-1.5 text-xs text-white/40">
                Ordered at {formatDateTime(order.createdAt)}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
              <ConciergeBell className="size-5" />
            </div>
            <h2 className="font-serif text-xl font-normal tracking-wide">Need help?</h2>
          </div>

          <p className="text-[15px] font-medium leading-relaxed text-white/60">
            Contact the front desk if you need to update, follow up, or report
            an issue with this order.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href={`/t/${tagCode}/contact`}
              className="flex items-center justify-center rounded-[1.25rem] bg-gold px-5 py-4 text-[15px] font-semibold tracking-wide text-black transition hover:brightness-110 active:scale-[0.98]"
            >
              Contact Front Desk
            </Link>

            <Link
              href={`/t/${tagCode}/service`}
              className="flex items-center justify-center rounded-[1.25rem] border border-white/15 bg-white/5 px-5 py-4 text-[15px] font-semibold tracking-wide text-white transition hover:bg-white/10 active:scale-[0.98]"
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