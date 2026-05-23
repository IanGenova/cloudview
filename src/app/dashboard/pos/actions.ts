'use server';

import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';

const posOrderSchema = z.object({
  hotelId: z.string().min(1),
  roomId: z.string().optional().nullable(),
  guestName: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'POS', 'ROOM_CHARGE', 'PAY_AT_COUNTER']),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(1).max(99)
    })
  ).min(1)
});

function cleanText(value?: string | null, max = 255) {
  return String(value || '').trim().slice(0, max);
}

function makeOrderCode() {
  return `ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function createPOSOrder(input: z.infer<typeof posOrderSchema>) {
  const user = await requireUser();
  const parsed = posOrderSchema.parse(input);

  if (user.role !== 'SUPER_ADMIN' && user.hotelId !== parsed.hotelId) {
    throw new Error('You are not allowed to create POS orders for this hotel.');
  }

  const productIds = parsed.items.map((item) => item.productId);

  const result = await db.$transaction(async (tx) => {
    const hotel = await tx.hotel.findUnique({
      where: { id: parsed.hotelId },
      include: { settings: true }
    });

    if (!hotel) {
      throw new Error('Hotel not found.');
    }

    const products = await tx.menuProduct.findMany({
      where: {
        id: { in: productIds },
        hotelId: parsed.hotelId
      }
    });

    if (products.length !== productIds.length) {
      throw new Error('Some products are invalid or unavailable.');
    }

    const productMap = new Map(products.map((product) => [product.id, product]));

    const subtotalCents = parsed.items.reduce((sum, item) => {
      const product = productMap.get(item.productId);

      if (!product) return sum;

      return sum + product.priceCents * item.quantity;
    }, 0);

    const serviceChargeRate = Number(hotel.settings?.serviceChargeRate || 0);
    const taxRate = Number(hotel.settings?.taxRate || 0);

    const serviceChargeCents = Math.round(subtotalCents * serviceChargeRate);
    const taxCents = Math.round(subtotalCents * taxRate);
    const totalCents = subtotalCents + serviceChargeCents + taxCents;

    const recipes = await tx.productInventoryRecipe.findMany({
      where: {
        productId: { in: productIds }
      },
      include: {
        inventoryItem: true
      }
    });

    for (const recipe of recipes) {
      const cartItem = parsed.items.find((item) => item.productId === recipe.productId);
      if (!cartItem) continue;

      const requiredQty = Number(recipe.quantity) * cartItem.quantity;
      const currentStock = Number(recipe.inventoryItem.stockQuantity);

      if (currentStock < requiredQty) {
        throw new Error(
          `Insufficient inventory for ${recipe.inventoryItem.name}. Available: ${currentStock}, required: ${requiredQty}`
        );
      }
    }

    const order = await tx.order.create({
      data: {
        hotelId: parsed.hotelId,
        roomId: parsed.roomId || null,
        locationId: null,
        tagId: null,

        orderCode: makeOrderCode(),
        guestName: cleanText(parsed.guestName, 100) || 'POS Customer',
        notes: cleanText(parsed.notes, 500),

        paymentMethod: parsed.paymentMethod as PaymentMethod,
        paymentStatus:
          parsed.paymentMethod === 'ROOM_CHARGE' || parsed.paymentMethod === 'PAY_AT_COUNTER'
            ? PaymentStatus.UNPAID
            : PaymentStatus.PAID,

        status: OrderStatus.PREPARING,

        subtotalCents,
        serviceChargeCents,
        taxCents,
        totalCents,

        posSyncStatus: 'PENDING',

        items: {
          create: parsed.items.map((item) => {
            const product = productMap.get(item.productId)!;

            return {
              productId: product.id,
              productNameSnapshot: product.name,
              unitPriceCents: product.priceCents,
              quantity: item.quantity,
              notes: null
            };
          })
        }
      }
    });

    for (const recipe of recipes) {
      const cartItem = parsed.items.find((item) => item.productId === recipe.productId);
      if (!cartItem) continue;

      const requiredQty = Number(recipe.quantity) * cartItem.quantity;

      await tx.inventoryItem.update({
        where: { id: recipe.inventoryItemId },
        data: {
          stockQuantity: {
            decrement: requiredQty
          }
        }
      });
    }

    return order;
  });

  revalidatePath('/dashboard/pos');
  revalidatePath('/dashboard/kitchen');
  revalidatePath('/dashboard/orders');
  revalidatePath('/dashboard/inventory');

  return {
    ok: true,
    orderCode: result.orderCode
  };
}