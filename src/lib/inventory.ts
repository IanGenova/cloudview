import { InventoryMovementType, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { buildRecipeRequirements } from '@/lib/inventory-requirements';

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

    const requirements = buildRecipeRequirements(order.items);

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
        /*
          Re-read before reporting. `item` was loaded before the guarded
          decrement, so quoting it produced "Need 2 pcs, available 3 pcs" --
          a message that reads as a broken check rather than a lost race,
          and sends staff hunting the wrong thing.
        */
        const current = await tx.inventoryItem.findUnique({
          where: { id: itemId },
          select: { stockQuantity: true },
        });

        const availableNow = current?.stockQuantity ?? item.stockQuantity;

        throw new InventoryError(
          `Insufficient stock for ${required.name}. Need ${required.qty} ${required.unit}, available ${availableNow} ${required.unit}.`
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

/**
 * Give an order's ingredients back.
 *
 * The mirror of `deductInventoryForOrder`, and it did not exist. Ingredient
 * stock had exactly one writer in the whole codebase -- the decrement above --
 * so cancelling an order that had already been released to the kitchen
 * consumed ingredients that were never cooked, and `inventoryDeductedAt` was
 * never cleared. Repeated, a hotel's counters walk to zero and every order
 * containing that ingredient fails with "Insufficient stock" forever.
 *
 * Three things make this safe to call from a cancellation path:
 *
 *   The claim is conditional, the same way the deduction's is. Only the caller
 *   that flips `inventoryDeductedAt` from set to null does the restoring, so a
 *   double-cancel or two staff clicking at once cannot return the stock twice.
 *
 *   The amounts come from the shared requirement maths, so what goes back is
 *   exactly what came out -- the full ordered quantity, not the quantity net
 *   of cancellations, because that is what the deduction took.
 *
 *   The movement is written as STOCK_IN with the order's code in the reason, so
 *   the movement history reads as a pair rather than as a mystery increase.
 */
export async function restoreInventoryForOrder(
  orderId: string,
  userId?: string
) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              include: { recipes: { include: { inventoryItem: true } } },
            },
          },
        },
      },
    });

    if (!order) throw new InventoryError('Order not found');

    /*
     * Nothing was ever deducted for this order, so there is nothing to give
     * back. This is the common case -- an order cancelled before it reached
     * the kitchen -- and it is not an error.
     */
    if (!order.inventoryDeductedAt) return order;

    /*
     * Release the deduction atomically before touching stock, mirroring the
     * claim in deductInventoryForOrder. Exactly one caller sees count === 1.
     */
    const released = await tx.order.updateMany({
      where: {
        id: order.id,
        inventoryDeductedAt: { not: null },
      },
      data: {
        inventoryDeductedAt: null,
      },
    });

    if (released.count === 0) {
      return order;
    }

    const requirements = buildRecipeRequirements(order.items);

    for (const [itemId, required] of requirements.entries()) {
      const restoredQuantity = new Prisma.Decimal(required.qty);

      /*
       * Unconditional increment, deliberately. The deduction has to guard on
       * available stock because it can oversell; giving stock back has no such
       * limit, and a guard here could only ever refuse a legitimate return.
       */
      const restored = await tx.inventoryItem.updateMany({
        where: { id: itemId },
        data: { stockQuantity: { increment: restoredQuantity } },
      });

      /*
       * The item was deleted between the deduction and the cancellation. The
       * stock is gone with it, so there is nothing to return -- but the rest
       * of the order's ingredients still should be.
       */
      if (restored.count === 0) {
        continue;
      }

      await tx.inventoryMovement.create({
        data: {
          hotelId: order.hotelId,
          itemId,
          type: InventoryMovementType.STOCK_IN,
          quantity: restoredQuantity,
          reason: `Cancelled order ${order.orderCode} stock restored`,
          orderId: order.id,
          userId,
        },
      });
    }

    return tx.order.findUniqueOrThrow({ where: { id: order.id } });
  });
}
