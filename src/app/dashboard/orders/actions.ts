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
      productId: string | null;
      quantity: number;
      productNameSnapshot: string;
    }[];
  };
}) {
  const quantityByProductId = new Map<string, number>();
  const productNameByProductId = new Map<string, string>();

  for (const item of order.items) {
    if (!item.productId) {
      continue;
    }

    quantityByProductId.set(
      item.productId,
      (quantityByProductId.get(item.productId) ?? 0) + item.quantity
    );

    productNameByProductId.set(item.productId, item.productNameSnapshot);
  }

  const restoredProductIds: string[] = [];

  for (const [productId, orderedQuantity] of quantityByProductId.entries()) {
    const productName =
      productNameByProductId.get(productId) ?? 'Menu item';

    const existingRestore = await tx.menuAvailabilityMovement.findFirst({
      where: {
        hotelId: order.hotelId,
        productId,
        type: MenuAvailabilityMovementType.CANCEL_RESTORE,
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

    const deductionMovements = await tx.menuAvailabilityMovement.findMany({
      where: {
        hotelId: order.hotelId,
        productId,
        type: MenuAvailabilityMovementType.ORDER_DEDUCTION,
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

    const restoreQuantity = Math.min(orderedQuantity, deductedQuantity);

    const stock = await tx.menuAvailabilityStock.findUnique({
      where: {
        hotelId_productId: {
          hotelId: order.hotelId,
          productId,
        },
      },
      select: {
        id: true,
        availableQty: true,
        soldQty: true,
      },
    });

    if (!stock) {
      throw new Error(`${productName} inventory stock record was not found.`);
    }

    const nextAvailableQty = stock.availableQty + restoreQuantity;
    const nextSoldQty = Math.max(stock.soldQty - restoreQuantity, 0);

    await tx.menuAvailabilityStock.update({
      where: {
        id: stock.id,
      },
      data: {
        availableQty: nextAvailableQty,
        soldQty: nextSoldQty,
        isSoldOut: false,
      },
    });

    await tx.menuAvailabilityMovement.create({
      data: {
        hotelId: order.hotelId,
        productId,
        stockId: stock.id,
        type: MenuAvailabilityMovementType.CANCEL_RESTORE,
        quantity: restoreQuantity,
        balanceAfter: nextAvailableQty,
        reason: `Cancelled order ${order.orderCode} stock restored`,
        userId,
      },
    });

    restoredProductIds.push(productId);
  }

  return restoredProductIds;
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
          productId: true,
          quantity: true,
          productNameSnapshot: true,
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