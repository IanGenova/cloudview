/**
 * How much of each ingredient an order's lines add up to.
 *
 * Pulled out of `deductInventoryForOrder` so the restore path can compute the
 * same number. It has to be the same number, or a restore gives back a
 * different amount than the deduction took and the ingredient counter drifts.
 *
 * That number is the ACTIVE quantity of each line -- ordered minus cancelled,
 * and nothing at all for a line whose status is CANCELLED. The first version
 * of this file used the full ordered quantity on both sides, which kept them
 * symmetric while charging ingredients for lines cancelled before the kitchen
 * ever saw them.
 */

export type RecipeRequirement = {
  name: string;
  unit: string;
  qty: number;
};

type RecipeLine = {
  quantity: number;
  /** Units of this line already cancelled. Absent means none. */
  cancelledQty?: number | null;
  /** OrderItemStatus at runtime; only CANCELLED matters here. */
  status?: string | null;
  product?: {
    recipes?: Array<{
      inventoryItemId: string;
      /* Prisma Decimal at runtime; Number() handles both it and a plain number. */
      quantity: unknown;
      inventoryItem: { name: string; unit: string };
    }> | null;
  } | null;
};

export function buildRecipeRequirements(items: RecipeLine[]) {
  const requirements = new Map<string, RecipeRequirement>();

  for (const item of items) {
    /*
     * The ACTIVE quantity -- ordered minus cancelled -- never the full ordered
     * one. A line cancelled before the kitchen starts is never cooked, so its
     * ingredients must never be taken; this used to multiply by item.quantity
     * regardless, and a burger cancelled while PENDING still cost a bun and a
     * patty when the order was released. The restore path calls this same
     * function, so it gives back exactly what was taken.
     */
    if (item.status === 'CANCELLED') {
      continue;
    }

    const activeQuantity = Math.max(
      item.quantity - Number(item.cancelledQty ?? 0),
      0
    );

    if (activeQuantity <= 0) {
      continue;
    }

    for (const recipe of item.product?.recipes ?? []) {
      const needed = Number(recipe.quantity) * activeQuantity;

      if (!Number.isFinite(needed) || needed <= 0) {
        continue;
      }

      const existing = requirements.get(recipe.inventoryItemId);

      requirements.set(recipe.inventoryItemId, {
        name: recipe.inventoryItem.name,
        unit: recipe.inventoryItem.unit,
        qty: (existing?.qty ?? 0) + needed,
      });
    }
  }

  return requirements;
}
