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

    /**
     * Claim the deduction atomically before touching stock.
     *
     * Reading `inventoryDeductedAt` and writing it later is a check-then-act
     * race: two concurrent accepts of the same order could both pass the read
     * and both deduct. This conditional update succeeds for exactly one caller,
     * so the loser exits without double-deducting.
     */
    const claimed = await tx.order.updateMany({
      where: {
        id: order.id,
        inventoryDeductedAt: null,
      },
      data: {
        inventoryDeductedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      return order;
    }

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

    /**
     * Deduct with the stock check built into the write.
     *
     * A separate "read stock, compare, then decrement" pass is a race: two
     * concurrent orders can both read sufficient stock and both decrement,
     * driving `stockQuantity` negative. Guarding the update on
     * `stockQuantity >= required` makes the check and the decrement a single
     * atomic statement, so the second caller matches zero rows and fails
     * cleanly instead of overselling.
     */
    for (const [itemId, required] of requirements.entries()) {
      const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
      if (!item) throw new InventoryError(`Inventory item missing: ${required.name}`);

      const requiredQuantity = new Prisma.Decimal(required.qty);

      const deducted = await tx.inventoryItem.updateMany({
        where: {
          id: itemId,
          stockQuantity: { gte: requiredQuantity },
        },
        data: { stockQuantity: { decrement: requiredQuantity } },
      });

      if (deducted.count === 0) {
        throw new InventoryError(
          `Insufficient stock for ${required.name}. Need ${required.qty} ${required.unit}, available ${item.stockQuantity} ${required.unit}.`
        );
      }

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

    /**
     * `inventoryDeductedAt` was already set by the atomic claim above; re-read
     * the order so callers still receive the updated row.
     */
    return tx.order.findUniqueOrThrow({ where: { id: order.id } });
  });
}
