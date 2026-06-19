'use server';

import {
  MenuAvailabilityMovementType,
  OrderItemStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertHotelScope } from '@/lib/access';
import { deductInventoryForOrder, InventoryError } from '@/lib/inventory';
import { sendOrderToPos } from '@/lib/pos';
import { cleanText } from '@/lib/sanitize';
import {
  triggerOrderPaidUpdate,
  triggerOrderStatusUpdate,
} from '@/lib/realtime/order-events';
import {
  triggerKitchenOrderPaid,
  triggerKitchenOrderUpdated,
} from '@/lib/realtime/kitchen-events';
import { triggerInventoryUpdated } from '@/lib/realtime/inventory-events';
import { publishCancelledItemAlert } from '@/lib/realtime/dashboard-alerts';
import {
  syncOrderPoints,
  voidSyncedOrderPoints,
} from '@/lib/guest-point-sync';

type RestoreOrderItem = {
  id: string;
  productId: string | null;
  quantity: number;
  productNameSnapshot: string;
  isBundleSnapshot: boolean;
  status?: OrderItemStatus;
  cancelledQty?: number;
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
};

async function safelyPublishCancelledItemAlert(payload: {
  hotelId: string;
  orderId?: string;
  orderCode: string;
  itemName?: string;
  cancelledQty?: number;
  reason?: string;
  source: string;
  wholeOrderCancelled?: boolean;
}) {
  try {
    await publishCancelledItemAlert(payload);
  } catch (error) {
    console.warn('Failed to publish cancelled order/item alert:', error);
  }
}

async function safelySyncOrderPoints(orderId: string) {
  try {
    const result = await syncOrderPoints(orderId);

    if (process.env.NODE_ENV !== 'production') {
      console.info('Order point sync result:', {
        orderId,
        result,
      });
    }
  } catch (error) {
    console.warn('Failed to sync order reward points:', error);
  }
}

async function safelyVoidSyncedOrderPoints(orderId: string) {
  try {
    const result = await voidSyncedOrderPoints(orderId);

    if (process.env.NODE_ENV !== 'production') {
      console.info('Order point void result:', {
        orderId,
        result,
      });
    }
  } catch (error) {
    console.warn('Failed to void synced order reward points:', error);
  }
}

function revalidateOrderPaths(order: {
  orderCode: string;
  tag: {
    code: string;
  } | null;
}) {
  revalidatePath('/dashboard/orders');
  revalidatePath('/dashboard/kitchen');
  revalidatePath('/dashboard/inventory');
  revalidatePath('/dashboard/menu');

  if (order.tag?.code) {
    revalidatePath(`/t/${order.tag.code}/track/${order.orderCode}`);
    revalidatePath(`/t/${order.tag.code}/orders`);
    revalidatePath(`/t/${order.tag.code}/menu`);
  }
}

function getRemainingOrderItemQuantity(item: {
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

  /**
   * OrderItemBundleComponent.quantity is stored as the total component quantity
   * for the original ordered bundle quantity.
   *
   * Example:
   * 2x Breakfast Combo
   * each combo has 1x Iced Tea
   * saved component quantity = 2
   *
   * If cancelling 1 of 2 combos, restore 1 Iced Tea.
   */
  return Math.max(
    Math.round((componentQuantity / itemQuantity) * cancelQuantity),
    0
  );
}

function addRestoreRequirement(
  requirements: Map<string, RestoreRequirement>,
  input: RestoreRequirement
) {
  const key = `${input.productId}:${input.deductionType}:${input.restoreType}:${input.duplicateGuardText}`;
  const existing = requirements.get(key);

  if (existing) {
    existing.quantity += input.quantity;
    return;
  }

  requirements.set(key, input);
}

function redirectToOrdersWithMessage({
  success,
  error,
}: {
  success?: string;
  error?: string;
}): never {
  const params = new URLSearchParams();

  if (success) {
    params.set('success', success);
  }

  if (error) {
    params.set('error', error);
  }

  redirect(
    params.toString()
      ? `/dashboard/orders?${params.toString()}`
      : '/dashboard/orders'
  );
}

function getOrderStatusSuccessCode(status: OrderStatus) {
  if (status === OrderStatus.ACCEPTED) {
    return 'order-accepted';
  }

  if (status === OrderStatus.PREPARING) {
    return 'order-started';
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

async function applyRestoreRequirements({
  tx,
  hotelId,
  requirements,
  userId,
}: {
  tx: Prisma.TransactionClient;
  hotelId: string;
  requirements: Map<string, RestoreRequirement>;
  userId: string;
}) {
  const restoredProductIds: string[] = [];

  for (const requirement of requirements.values()) {
    if (requirement.quantity <= 0) {
      continue;
    }

    /**
     * Prevent double restoration for the same order/item/product/restore type.
     */
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

    /**
     * Restore only if this product was actually deducted for this order.
     */
    const deductionMovements = await tx.menuAvailabilityMovement.findMany({
      where: {
        hotelId,
        productId: requirement.productId,
        type: requirement.deductionType,
        reason: {
          contains: requirement.duplicateGuardText.split(':')[0],
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

    const nextAvailableQty = stock.availableQty + restoreQuantity;
    const nextSoldQty = Math.max(stock.soldQty - restoreQuantity, 0);

    const updatedStock = await tx.menuAvailabilityStock.update({
      where: {
        id: stock.id,
      },
      data: {
        availableQty: nextAvailableQty,
        soldQty: nextSoldQty,
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
        userId,
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
  item: RestoreOrderItem;
  quantityToRestore: number;
}) {
  const restoreRequirements = new Map<string, RestoreRequirement>();
  const itemGuard = `${order.orderCode}:${item.id}`;

  if (quantityToRestore <= 0) {
    return restoreRequirements;
  }

  /**
   * Bundle item:
   * Restore component products, not the bundle product.
   */
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
          reason: `Cancelled bundle item ${item.productNameSnapshot} (${item.id}) from order ${order.orderCode} stock restored`,
          duplicateGuardText: itemGuard,
        });
      }

      return restoreRequirements;
    }

    /**
     * Fallback for older bundle orders created before bundle component snapshots.
     */
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
          reason: `Cancelled bundle item ${item.productNameSnapshot} (${item.id}) from order ${order.orderCode} stock restored`,
          duplicateGuardText: itemGuard,
        });
      }
    }

    return restoreRequirements;
  }

  /**
   * Normal single menu item.
   */
  if (!item.productId) {
    return restoreRequirements;
  }

  addRestoreRequirement(restoreRequirements, {
    productId: item.productId,
    productName: item.productNameSnapshot,
    quantity: quantityToRestore,
    deductionType: MenuAvailabilityMovementType.ORDER_DEDUCTION,
    restoreType: MenuAvailabilityMovementType.CANCEL_RESTORE,
    reason: `Cancelled item ${item.productNameSnapshot} (${item.id}) from order ${order.orderCode} stock restored`,
    duplicateGuardText: itemGuard,
  });

  return restoreRequirements;
}

async function restoreMenuStockForCancelledOrder({
  tx,
  order,
  userId,
}: {
  tx: Prisma.TransactionClient;
  userId: string;
  order: {
    id: string;
    hotelId: string;
    orderCode: string;
    items: RestoreOrderItem[];
  };
}) {
  const restoreRequirements = new Map<string, RestoreRequirement>();

  for (const item of order.items) {
    const remainingQuantity = getRemainingOrderItemQuantity(item);

    if (remainingQuantity <= 0) {
      continue;
    }

    const itemRequirements = await buildRestoreRequirementsForOrderItem({
      tx,
      order,
      item,
      quantityToRestore: remainingQuantity,
    });

    for (const requirement of itemRequirements.values()) {
      addRestoreRequirement(restoreRequirements, {
        ...requirement,
        /**
         * Whole-order cancellation uses the order code as duplicate guard, so it
         * does not conflict with item-level cancellation guards.
         */
        duplicateGuardText: `${order.orderCode}:whole-order:${requirement.productId}:${requirement.restoreType}`,
        reason: item.isBundleSnapshot
          ? `Cancelled bundle order ${order.orderCode} stock restored`
          : `Cancelled order ${order.orderCode} stock restored`,
      });
    }
  }

  return applyRestoreRequirements({
    tx,
    hotelId: order.hotelId,
    requirements: restoreRequirements,
    userId,
  });
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
    totalCents: nextSubtotalCents + nextServiceChargeCents + nextTaxCents,
  };
}

export async function cancelOrderItemAction(formData: FormData) {
  const user = await requireUser();

  const orderId = cleanText(formData.get('orderId'));
  const orderItemId = cleanText(formData.get('orderItemId'));
  const reason = cleanText(formData.get('reason'), 300);

  if (!orderId || !orderItemId) {
    redirectToOrdersWithMessage({
      error: 'order-item-required',
    });
  }

  const order = await db.order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      hotelId: true,
      status: true,
      orderCode: true,
      subtotalCents: true,
      serviceChargeCents: true,
      taxCents: true,
      tag: {
        select: {
          code: true,
        },
      },
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitPriceCents: true,
          productNameSnapshot: true,
          isBundleSnapshot: true,
          status: true,
          cancelledQty: true,
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
    redirectToOrdersWithMessage({
      error: 'order-not-found',
    });
  }

  assertHotelScope(user, order.hotelId);

  if (order.status !== OrderStatus.PENDING) {
    redirectToOrdersWithMessage({
      error: 'order-not-pending',
    });
  }

  const item = order.items.find((orderItem) => orderItem.id === orderItemId);

  if (!item) {
    redirectToOrdersWithMessage({
      error: 'order-item-not-found',
    });
  }

  const remainingQuantity = getRemainingOrderItemQuantity(item);

  /**
   * Important fix:
   * Do not throw a 500 error if the user double-clicks, refreshes a stale modal,
   * or submits an already-cancelled item. Redirect with a safe message instead.
   */
  if (remainingQuantity <= 0 || item.status === OrderItemStatus.CANCELLED) {
    revalidateOrderPaths(order);

    redirectToOrdersWithMessage({
      error: 'item-already-cancelled',
    });
  }

  let restoredProductIds: string[] = [];
  let finalOrderStatus: OrderStatus = order.status;
  let statusUpdatedAt = new Date();

  const totals = recalculateOrderTotalsAfterItemCancellation({
    order,
    cancelledItemId: item.id,
  });

  const allItemsCancelled = order.items.every((orderItem) => {
    if (orderItem.id === item.id) {
      return true;
    }

    return (
      orderItem.status === OrderItemStatus.CANCELLED ||
      getRemainingOrderItemQuantity(orderItem) <= 0
    );
  });

  await db.$transaction(async (tx) => {
    const restoreRequirements = await buildRestoreRequirementsForOrderItem({
      tx,
      order,
      item,
      quantityToRestore: remainingQuantity,
    });

    restoredProductIds = await applyRestoreRequirements({
      tx,
      hotelId: order.hotelId,
      requirements: restoreRequirements,
      userId: user.id,
    });

    await tx.orderItem.update({
      where: {
        id: item.id,
      },
      data: {
        status: OrderItemStatus.CANCELLED,
        cancelledQty: item.quantity,
        cancelledAt: new Date(),
        cancelReason: reason || 'Cancelled from dashboard',
        cancelledById: user.id,
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
          userId: user.id,
          note:
            reason ||
            `All order items were cancelled from dashboard. Last item: ${item.productNameSnapshot}.`,
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
        userId: user.id,
        note:
          reason || `Cancelled item ${item.productNameSnapshot} from dashboard.`,
      },
      select: {
        createdAt: true,
      },
    });

    statusUpdatedAt = history.createdAt;
  });

  revalidateOrderPaths(order);

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
      source: 'DASHBOARD',
    });
  }

  await safelyPublishCancelledItemAlert({
  hotelId: order.hotelId,
  orderId: order.id,
  orderCode: order.orderCode,
  itemName: item.productNameSnapshot,
  cancelledQty: remainingQuantity,
  reason: reason || undefined,
  source: allItemsCancelled ? 'ORDER_CANCELLED' : 'ORDER_ITEM_CANCELLED',
  wholeOrderCancelled: allItemsCancelled,
});

      if (allItemsCancelled) {
        await safelyVoidSyncedOrderPoints(order.id);
      }

  

  redirectToOrdersWithMessage({
    success: allItemsCancelled ? 'order-cancelled' : 'item-cancelled',
  });
}

export async function updateOrderStatusAction(formData: FormData) {
  const user = await requireUser();

  const orderId = cleanText(formData.get('orderId'));
  const status = formData.get('status') as OrderStatus;
  const note = cleanText(formData.get('note'), 300);
  const redirectTarget = cleanText(formData.get('redirectTo'));

  if (!orderId || !Object.values(OrderStatus).includes(status)) {
    throw new Error('Invalid status update');
  }

  const order = await db.order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      hotelId: true,
      status: true,
      orderCode: true,
      inventoryDeductedAt: true,
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          productNameSnapshot: true,
          isBundleSnapshot: true,
          status: true,
          cancelledQty: true,
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
      tag: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  assertHotelScope(user, order.hotelId);

  let statusUpdatedAt = new Date();
  let restoredProductIds: string[] = [];

  const shouldRestoreStock =
    status === OrderStatus.CANCELLED &&
    order.status !== OrderStatus.CANCELLED &&
    order.status !== OrderStatus.DELIVERED;

  try {
    if (status === OrderStatus.ACCEPTED && !order.inventoryDeductedAt) {
      await deductInventoryForOrder(order.id, user.id);
      await sendOrderToPos(order.id);
    }

    const history = await db.$transaction(async (tx) => {
      if (shouldRestoreStock) {
        restoredProductIds = await restoreMenuStockForCancelledOrder({
          tx,
          order,
          userId: user.id,
        });
      }

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status,
        },
      });

      return tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status,
          userId: user.id,
          note: note || null,
        },
        select: {
          createdAt: true,
        },
      });
    });

    statusUpdatedAt = history.createdAt;
  } catch (error) {
    if (error instanceof InventoryError) {
      throw new Error(error.message);
    }

    throw error;
  }
    if (status === OrderStatus.DELIVERED) {
      await safelySyncOrderPoints(order.id);
    }

    if (status === OrderStatus.CANCELLED) {
      await safelyVoidSyncedOrderPoints(order.id);

      await safelyPublishCancelledItemAlert({
        hotelId: order.hotelId,
        orderId: order.id,
        orderCode: order.orderCode,
        reason: note || undefined,
        source: 'ORDER_CANCELLED',
        wholeOrderCancelled: true,
      });
    }


  revalidateOrderPaths(order);

  await triggerOrderStatusUpdate({
    orderCode: order.orderCode,
    status,
    updatedAt: statusUpdatedAt.toISOString(),
  });

  await triggerKitchenOrderUpdated({
    hotelId: order.hotelId,
    orderCode: order.orderCode,
    status,
    source: 'KITCHEN',
  });

  if (restoredProductIds.length > 0) {
    await triggerInventoryUpdated({
      hotelId: order.hotelId,
      productIds: restoredProductIds,
      source: 'DASHBOARD',
    });
  }

  if (redirectTarget === 'orders') {
    redirectToOrdersWithMessage({
      success: getOrderStatusSuccessCode(status),
    });
  }
}

export async function markOrderPaidAction(formData: FormData) {
  const user = await requireUser();

  const orderId = cleanText(formData.get('orderId'));
  const redirectTarget = cleanText(formData.get('redirectTo'));

  if (!orderId) {
    throw new Error('Order required');
  }

  const order = await db.order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      hotelId: true,
      orderCode: true,
      tag: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  assertHotelScope(user, order.hotelId);

  await db.order.update({
    where: {
      id: order.id,
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
    },
  });
  await safelySyncOrderPoints(order.id);

  revalidateOrderPaths(order);

  await triggerOrderPaidUpdate({
    orderCode: order.orderCode,
    paymentStatus: PaymentStatus.PAID,
    updatedAt: new Date().toISOString(),
  });

  await triggerKitchenOrderPaid({
    hotelId: order.hotelId,
    orderCode: order.orderCode,
    paymentStatus: PaymentStatus.PAID,
  });

  if (redirectTarget === 'orders') {
    redirectToOrdersWithMessage({
      success: 'order-paid',
    });
  }
}