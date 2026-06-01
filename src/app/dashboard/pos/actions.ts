'use server';

import {
  MenuAvailabilityMovementType,
  MenuProductType,
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

type StockRequirement = {
  productId: string;
  productName: string;
  quantity: number;
  singleQuantity: number;
  bundleQuantity: number;
};

function parsePositiveQuantity(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function addStockRequirement(
  requirements: Map<string, StockRequirement>,
  input: {
    productId: string;
    productName: string;
    quantity: number;
    source: 'SINGLE' | 'BUNDLE';
  }
) {
  const current = requirements.get(input.productId);

  if (current) {
    current.quantity += input.quantity;

    if (input.source === 'SINGLE') {
      current.singleQuantity += input.quantity;
    } else {
      current.bundleQuantity += input.quantity;
    }

    return;
  }

  requirements.set(input.productId, {
    productId: input.productId,
    productName: input.productName,
    quantity: input.quantity,
    singleQuantity: input.source === 'SINGLE' ? input.quantity : 0,
    bundleQuantity: input.source === 'BUNDLE' ? input.quantity : 0,
  });
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

  const quantityByProductId = new Map<string, number>();

  for (const item of input.items) {
    const productId = cleanText(item.productId);
    const quantity = parsePositiveQuantity(item.quantity);

    if (!productId || quantity === null) {
      throw new Error('Invalid cart item quantity.');
    }

    quantityByProductId.set(
      productId,
      (quantityByProductId.get(productId) ?? 0) + quantity
    );
  }

  const normalizedItems = Array.from(quantityByProductId.entries()).map(
    ([productId, quantity]) => ({
      productId,
      quantity,
    })
  );

  const productIds = normalizedItems.map((item) => item.productId);

  const products = await db.menuProduct.findMany({
    where: {
      id: {
        in: productIds,
      },
      hotelId,
      isAvailable: true,
    },
    include: {
      bundleComponents: {
        include: {
          componentProduct: {
            select: {
              id: true,
              name: true,
              isAvailable: true,
              productType: true,
            },
          },
        },
        orderBy: {
          sortOrder: 'asc',
        },
      },
    },
  });

  if (products.length !== productIds.length) {
    throw new Error('One or more products are no longer available.');
  }

  const productMap = new Map(products.map((product) => [product.id, product]));

  for (const product of products) {
    if (product.productType !== MenuProductType.BUNDLE) {
      continue;
    }

    if (!product.bundleComponents.length) {
      throw new Error(
        `${product.name} is a bundle but has no component items yet.`
      );
    }

    for (const component of product.bundleComponents) {
      if (!component.componentProduct.isAvailable) {
        throw new Error(
          `${product.name} cannot be sold because ${component.componentProduct.name} is unavailable.`
        );
      }

      if (component.componentProduct.productType === MenuProductType.BUNDLE) {
        throw new Error(
          `${product.name} contains another bundle. Nested bundles are not supported yet.`
        );
      }

      if (!Number.isInteger(component.quantity) || component.quantity <= 0) {
        throw new Error(
          `${product.name} has an invalid component quantity for ${component.componentProduct.name}.`
        );
      }
    }
  }

  const stockRequirements = new Map<string, StockRequirement>();

  for (const item of normalizedItems) {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new Error('Product not found.');
    }

    if (product.productType === MenuProductType.BUNDLE) {
      for (const component of product.bundleComponents) {
        addStockRequirement(stockRequirements, {
          productId: component.componentProductId,
          productName: component.componentProduct.name,
          quantity: component.quantity * item.quantity,
          source: 'BUNDLE',
        });
      }
    } else {
      addStockRequirement(stockRequirements, {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        source: 'SINGLE',
      });
    }
  }

  const subtotal = normalizedItems.reduce((sum, item) => {
    const product = productMap.get(item.productId)!;

    return sum + product.priceCents * item.quantity;
  }, 0);

  const orderCode = randomCode('ORD');

  const order = await db.$transaction(async (tx) => {
    const stockByProductId = new Map<
      string,
      {
        id: string;
        availableQty: number;
        isSoldOut: boolean;
      }
    >();

    for (const requirement of stockRequirements.values()) {
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
          isSoldOut: true,
        },
      });

      if (!stock) {
        throw new Error(
          `${requirement.productName} has no stock record yet.`
        );
      }

      if (stock.isSoldOut || stock.availableQty <= 0) {
        throw new Error(`${requirement.productName} is sold out.`);
      }

      if (requirement.quantity > stock.availableQty) {
        throw new Error(
          `${requirement.productName} only has ${stock.availableQty} available.`
        );
      }

      stockByProductId.set(requirement.productId, stock);
    }

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
      const isBundle = product.productType === MenuProductType.BUNDLE;

      await tx.orderItem.create({
        data: {
          orderId: createdOrder.id,
          productId: product.id,
          productNameSnapshot: product.name,
          quantity: item.quantity,
          unitPriceCents: product.priceCents,
          isBundleSnapshot: isBundle,
          bundleComponents: isBundle
            ? {
                create: product.bundleComponents.map((component) => ({
                  bundleProductId: product.id,
                  componentProductId: component.componentProductId,
                  componentNameSnapshot: component.componentProduct.name,
                  quantity: component.quantity * item.quantity,
                })),
              }
            : undefined,
        },
      });
    }

    for (const requirement of stockRequirements.values()) {
      const stock = stockByProductId.get(requirement.productId);

      if (!stock) {
        throw new Error(
          `${requirement.productName} inventory stock was not found.`
        );
      }

      const updateResult = await tx.menuAvailabilityStock.updateMany({
        where: {
          id: stock.id,
          isSoldOut: false,
          availableQty: {
            gte: requirement.quantity,
          },
        },
        data: {
          availableQty: {
            decrement: requirement.quantity,
          },
          soldQty: {
            increment: requirement.quantity,
          },
        },
      });

      if (updateResult.count !== 1) {
        throw new Error(
          `${requirement.productName} stock changed while ordering. Please try again.`
        );
      }

      const updatedStock = await tx.menuAvailabilityStock.findUnique({
        where: {
          id: stock.id,
        },
        select: {
          availableQty: true,
        },
      });

      if (!updatedStock) {
        throw new Error(
          `${requirement.productName} inventory stock was not found.`
        );
      }

      if (updatedStock.availableQty <= 0) {
        await tx.menuAvailabilityStock.update({
          where: {
            id: stock.id,
          },
          data: {
            isSoldOut: true,
          },
        });
      }

      if (requirement.singleQuantity > 0) {
        await tx.menuAvailabilityMovement.create({
          data: {
            hotelId,
            productId: requirement.productId,
            stockId: stock.id,
            type: MenuAvailabilityMovementType.ORDER_DEDUCTION,
            quantity: requirement.singleQuantity,
            balanceAfter: Math.max(updatedStock.availableQty, 0),
            reason: `POS order ${createdOrder.orderCode}`,
            userId: user.id,
          },
        });
      }

      if (requirement.bundleQuantity > 0) {
        await tx.menuAvailabilityMovement.create({
          data: {
            hotelId,
            productId: requirement.productId,
            stockId: stock.id,
            type: MenuAvailabilityMovementType.BUNDLE_ORDER_DEDUCTION,
            quantity: requirement.bundleQuantity,
            balanceAfter: Math.max(updatedStock.availableQty, 0),
            reason: `POS bundle order ${createdOrder.orderCode}`,
            userId: user.id,
          },
        });
      }
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
    productIds: Array.from(stockRequirements.keys()),
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