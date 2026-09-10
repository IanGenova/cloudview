/**
 * How much of each ingredient an order's lines add up to.
 *
 * Pulled out of `deductInventoryForOrder` so the restore path can compute the
 * same number. It has to be the same number: the deduction runs at kitchen
 * release against the line's full ordered quantity, so a restore that used the
 * quantity net of cancellations would give back less than it took, and the
 * ingredient counter would still drift downward -- just more slowly.
 */

export type RecipeRequirement = {
  name: string;
  unit: string;
  qty: number;
};

type RecipeLine = {
  quantity: number;
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
    for (const recipe of item.product?.recipes ?? []) {
      const needed = Number(recipe.quantity) * item.quantity;

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
