'use server';

import {
  MenuAvailabilityMovementType,
  OrderStatus,
  PaymentMethod,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireRole, requireUser } from '@/lib/auth';
import { assertHotelScope } from '@/lib/access';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';
import { randomCode } from '@/lib/utils';
import { logActivity } from '@/lib/activity';
import { triggerKitchenOrderCreated } from '@/lib/realtime/kitchen-events';
import { triggerInventoryUpdated } from '@/lib/realtime/inventory-events';

type POSOrderInput = {
  hotelId: string;
  roomId?: string | null;
  guestName?: string;
  notes?: string;
  paymentMethod: 'CASH' | 'POS' | 'ROOM_CHARGE' | 'PAY_AT_COUNTER';
  items: {
    productId: string;
    quantity: number;
  }[];
};

function parsePositiveQuantity(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

export async function createPOSOrder(input: POSOrderInput) {
  const user = await requireUser();

  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const hotelId = cleanText(input.hotelId);
  const roomId = cleanText(input.roomId);
  const guestName = cleanText(input.guestName, 100);
  const notes = cleanText(input.notes, 1000);
  const paymentMethod = input.paymentMethod as PaymentMethod;

  if (!hotelId) {
    throw new Error('Hotel is required.');
  }

  assertHotelScope(user, hotelId);

  if (!Object.values(PaymentMethod).includes(paymentMethod)) {
    throw new Error('Invalid payment method.');
  }

  if (!input.items?.length) {
    throw new Error('Please add at least one item.');
  }

  const normalizedItems = input.items.map((item) => ({
    productId: cleanText(item.productId),
    quantity: parsePositiveQuantity(item.quantity),
  }));

  if (
    normalizedItems.some((item) => !item.productId || item.quantity === null)
  ) {
    throw new Error('Invalid cart item quantity.');
  }

  const productIds = normalizedItems.map((item) => item.productId);

  const products = await db.menuProduct.findMany({
    where: {
      id: {
        in: productIds,
      },
      hotelId,
      isAvailable: true,
    },
    select: {
      id: true,
      hotelId: true,
      name: true,
      priceCents: true,
    },
  });

  if (products.length !== new Set(productIds).size) {
    throw new Error('One or more products are no longer available.');
  }

  const productMap = new Map(products.map((product) => [product.id, product]));

  const stocks = await db.menuAvailabilityStock.findMany({
    where: {
      hotelId,
      productId: {
        in: productIds,
      },
    },
    select: {
      id: true,
      productId: true,
      availableQty: true,
      soldQty: true,
      isSoldOut: true,
    },
  });

  const stockMap = new Map(stocks.map((stock) => [stock.productId, stock]));

  for (const item of normalizedItems) {
    const product = productMap.get(item.productId);
    const stock = stockMap.get(item.productId);
    const quantity = item.quantity!;

    if (!product) {
      throw new Error('Product not found.');
    }

    if (!stock) {
      throw new Error(`${product.name} has no stock record yet.`);
    }

    if (stock.isSoldOut || stock.availableQty <= 0) {
      throw new Error(`${product.name} is sold out.`);
    }

    if (quantity > stock.availableQty) {
      throw new Error(
        `${product.name} only has ${stock.availableQty} available.`
      );
    }
  }

  const subtotal = normalizedItems.reduce((sum, item) => {
    const product = productMap.get(item.productId)!;

    return sum + product.priceCents * item.quantity!;
  }, 0);

  const orderCode = randomCode('ORD');

  const order = await db.$transaction(async (tx) => {
    const createdOrder = await tx.order.create({
      data: {
        hotelId,
        roomId: roomId || null,
        locationId: null,
        tagId: null,
        orderCode,
        guestName: guestName || null,
        notes: notes || null,
        paymentMethod,
        subtotalCents: subtotal,
        serviceChargeCents: 0,
        taxCents: 0,
        totalCents: subtotal,
        items: {
          create: normalizedItems.map((item) => {
            const product = productMap.get(item.productId)!;

            return {
              productId: product.id,
              productNameSnapshot: product.name,
              quantity: item.quantity!,
              unitPriceCents: product.priceCents,
            };
          }),
        },
        statusHistory: {
          create: {
            status: OrderStatus.PENDING,
            note: 'POS sale created from dashboard',
            userId: user.id,
          },
        },
      },
      select: {
        id: true,
        orderCode: true,
      },
    });

    for (const item of normalizedItems) {
      const product = productMap.get(item.productId)!;
      const stock = stockMap.get(item.productId)!;
      const quantity = item.quantity!;

      const nextAvailableQty = stock.availableQty - quantity;
      const nextSoldQty = stock.soldQty + quantity;

      await tx.menuAvailabilityStock.update({
        where: {
          id: stock.id,
        },
        data: {
          availableQty: nextAvailableQty,
          soldQty: nextSoldQty,
          isSoldOut: nextAvailableQty <= 0,
        },
      });

      await tx.menuAvailabilityMovement.create({
        data: {
          hotelId,
          productId: product.id,
          stockId: stock.id,
          type: MenuAvailabilityMovementType.ORDER_DEDUCTION,
          quantity,
          balanceAfter: nextAvailableQty,
          reason: `POS order ${createdOrder.orderCode}`,
          userId: user.id,
        },
      });
    }

    return createdOrder;
  });

  await logActivity({
    hotelId,
    actor: user.name ?? user.email ?? 'Dashboard User',
    action: 'CREATE',
    entity: 'Order',
    entityId: order.id,
    message: `POS order ${order.orderCode} created`,
  });


await triggerInventoryUpdated({
  hotelId,
  productIds,
  source: 'POS_TERMINAL',
});

  await triggerKitchenOrderCreated({
    hotelId,
    orderCode: order.orderCode,
    status: OrderStatus.PENDING,
    source: 'POS_TERMINAL',
  });

  revalidatePath('/dashboard/pos');
  revalidatePath('/dashboard/orders');
  revalidatePath('/dashboard/kitchen');
  revalidatePath('/dashboard/inventory');
  revalidatePath('/dashboard/menu');

  return {
    ok: true,
    orderCode: order.orderCode,
  };
}