import { InventoryMovementType, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export class InventoryError extends Error {}

export async function deductInventoryForOrder(orderId: string, userId?: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              include: { recipes: { include: { inventoryItem: true } } }
            }
          }
        }
      }
    });

    if (!order) throw new InventoryError('Order not found');
    if (order.inventoryDeductedAt) return order;

    const requirements = new Map<string, { name: string; unit: string; qty: number }>();

    for (const item of order.items) {
      for (const recipe of item.product?.recipes ?? []) {
        const needed = Number(recipe.quantity) * item.quantity;
        const existing = requirements.get(recipe.inventoryItemId);
        requirements.set(recipe.inventoryItemId, {
          name: recipe.inventoryItem.name,
          unit: recipe.inventoryItem.unit,
          qty: (existing?.qty ?? 0) + needed
        });
      }
    }

    for (const [itemId, required] of requirements.entries()) {
      const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item) throw new InventoryError(`Inventory item missing: ${required.name}`);
      if (Number(item.stockQuantity) < required.qty) {
        throw new InventoryError(`Insufficient stock for ${required.name}. Need ${required.qty} ${required.unit}, available ${item.stockQuantity} ${required.unit}.`);
      }
    }

    for (const [itemId, required] of requirements.entries()) {
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { stockQuantity: { decrement: new Prisma.Decimal(required.qty) } }
      });
      await tx.inventoryMovement.create({
        data: {
          hotelId: order.hotelId,
          itemId,
          type: InventoryMovementType.ORDER_DEDUCTION,
          quantity: new Prisma.Decimal(required.qty),
          reason: `Order ${order.orderCode}`,
          orderId: order.id,
          userId
        }
      });
    }

    return tx.order.update({
      where: { id: order.id },
      data: { inventoryDeductedAt: new Date() }
    });
  });
}
