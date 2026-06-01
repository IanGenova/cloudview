'use server';

import {
  MenuAvailabilityMovementType,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
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
  }
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
    items: {
      id: string;
      productId: string | null;
      quantity: number;
      productNameSnapshot: string;
      isBundleSnapshot: boolean;
      bundleComponents: {
        id: string;
        componentProductId: string | null;
        componentNameSnapshot: string;
        quantity: number;
      }[];
    }[];
  };
}) {
  type RestoreRequirement = {
    productId: string;
    productName: string;
    quantity: number;
    deductionType: MenuAvailabilityMovementType;
    restoreType: MenuAvailabilityMovementType;
    reason: string;
  };

  const restoreRequirements = new Map<string, RestoreRequirement>();

  function addRestoreRequirement(input: RestoreRequirement) {
    const key = `${input.productId}:${input.deductionType}:${input.restoreType}`;
    const existing = restoreRequirements.get(key);

    if (existing) {
      existing.quantity += input.quantity;
      return;
    }

    restoreRequirements.set(key, input);
  }

  for (const item of order.items) {
    /**
     * Bundle order item:
     * Restore component products, not the bundle product.
     */
    if (item.isBundleSnapshot) {
      if (item.bundleComponents.length > 0) {
        for (const component of item.bundleComponents) {
          if (!component.componentProductId) {
            continue;
          }

          addRestoreRequirement({
            productId: component.componentProductId,
            productName: component.componentNameSnapshot,
            quantity: component.quantity,
            deductionType: MenuAvailabilityMovementType.BUNDLE_ORDER_DEDUCTION,
            restoreType: MenuAvailabilityMovementType.BUNDLE_CANCEL_RESTORE,
            reason: `Cancelled bundle order ${order.orderCode} stock restored`,
          });
        }

        continue;
      }

      /**
       * Fallback for older bundle orders created before
       * OrderItemBundleComponent snapshots existed.
       *
       * This uses the current bundle setup. It is less perfect than snapshots,
       * but it prevents old bundle cancellations from failing silently.
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
          addRestoreRequirement({
            productId: component.componentProductId,
            productName: component.componentProduct.name,
            quantity: component.quantity * item.quantity,
            deductionType: MenuAvailabilityMovementType.BUNDLE_ORDER_DEDUCTION,
            restoreType: MenuAvailabilityMovementType.BUNDLE_CANCEL_RESTORE,
            reason: `Cancelled bundle order ${order.orderCode} stock restored`,
          });
        }
      }

      continue;
    }

    /**
     * Normal single menu item:
     * Restore the product itself.
     */
    if (!item.productId) {
      continue;
    }

    addRestoreRequirement({
      productId: item.productId,
      productName: item.productNameSnapshot,
      quantity: item.quantity,
      deductionType: MenuAvailabilityMovementType.ORDER_DEDUCTION,
      restoreType: MenuAvailabilityMovementType.CANCEL_RESTORE,
      reason: `Cancelled order ${order.orderCode} stock restored`,
    });
  }

  const restoredProductIds: string[] = [];

  for (const requirement of restoreRequirements.values()) {
    /**
     * Prevent double restoration.
     */
    const existingRestore = await tx.menuAvailabilityMovement.findFirst({
      where: {
        hotelId: order.hotelId,
        productId: requirement.productId,
        type: requirement.restoreType,
        reason: {
          contains: order.orderCode,
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
     * Restore only what was actually deducted.
     */
    const deductionMovements = await tx.menuAvailabilityMovement.findMany({
      where: {
        hotelId: order.hotelId,
        productId: requirement.productId,
        type: requirement.deductionType,
        reason: {
          contains: order.orderCode,
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
          hotelId: order.hotelId,
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
        hotelId: order.hotelId,
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

export async function updateOrderStatusAction(formData: FormData) {
  const user = await requireUser();

  const orderId = cleanText(formData.get('orderId'));
  const status = formData.get('status') as OrderStatus;
  const note = cleanText(formData.get('note'), 300);

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
}

export async function markOrderPaidAction(formData: FormData) {
  const user = await requireUser();

  const orderId = cleanText(formData.get('orderId'));

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
}