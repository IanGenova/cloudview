import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRecipeRequirements } from './inventory-requirements';

/*
 * How much of each ingredient an order's lines add up to.
 *
 * This existed inline inside deductInventoryForOrder and nowhere else, because
 * nothing ever gave the ingredients back. Cancelling an order that had already
 * been released to the kitchen left the stock deducted forever: 100 buns became
 * 98 and stayed 98, with no reversing movement and inventoryDeductedAt still
 * set. Since InventoryItem.stockQuantity had exactly one writer in the whole
 * codebase and it was a decrement, ingredient stock could only ever fall.
 *
 * The restore path has to compute exactly what the deduction computed, or it
 * gives back the wrong amount. So the sum lives here, once, and both directions
 * call it.
 */

function line(quantity: number, recipes: Array<[string, number]>) {
  return {
    quantity,
    product: {
      recipes: recipes.map(([inventoryItemId, qty]) => ({
        inventoryItemId,
        quantity: qty,
        inventoryItem: { name: inventoryItemId, unit: 'pcs' },
      })),
    },
  };
}

test('one line multiplies its recipe by the ordered quantity', () => {
  const requirements = buildRecipeRequirements([
    line(2, [['bun', 1], ['patty', 1]]),
  ]);

  assert.equal(requirements.get('bun')?.qty, 2);
  assert.equal(requirements.get('patty')?.qty, 2);
});

test('two lines sharing an ingredient add up', () => {
  const requirements = buildRecipeRequirements([
    line(2, [['bread', 1]]),
    line(3, [['bread', 2]]),
  ]);

  // 2*1 + 3*2
  assert.equal(requirements.get('bread')?.qty, 8);
  assert.equal(requirements.size, 1);
});

test('a fractional recipe quantity is preserved', () => {
  const requirements = buildRecipeRequirements([line(3, [['tea', 0.5]])]);

  assert.equal(requirements.get('tea')?.qty, 1.5);
});

test('a decimal-like recipe quantity is coerced, not stringified', () => {
  const requirements = buildRecipeRequirements([
    { quantity: 2, product: { recipes: [{ inventoryItemId: 'ml', quantity: { toString: () => '300' } as unknown as number, inventoryItem: { name: 'Brewed Tea', unit: 'ml' } }] } },
  ]);

  assert.equal(requirements.get('ml')?.qty, 600);
});

test('a line with no product contributes nothing', () => {
  const requirements = buildRecipeRequirements([
    { quantity: 4, product: null },
    line(1, [['bun', 1]]),
  ]);

  assert.equal(requirements.size, 1);
  assert.equal(requirements.get('bun')?.qty, 1);
});

test('a product with no recipes contributes nothing', () => {
  const requirements = buildRecipeRequirements([line(9, [])]);

  assert.equal(requirements.size, 0);
});

test('an empty order needs nothing', () => {
  assert.equal(buildRecipeRequirements([]).size, 0);
});

/*
 * The ACTIVE quantity is used -- ordered minus cancelled -- on both directions.
 *
 * This test used to assert the opposite: that the full ordered quantity was
 * used "so the restore mirrors the deduction exactly". The symmetry was right
 * and the basis was wrong. The second ultra inspection placed an order of one
 * pancake and one burger, cancelled the burger line from the dashboard while
 * the order was still PENDING, then released it to the kitchen -- and watched
 * Burger Bun go 100 -> 99 and Beef Patty 60 -> 59 for a burger nobody ever
 * cooked. "The guest changed their mind before the kitchen started" is an
 * ordinary front-desk event, and every one of them leaked the cancelled line's
 * ingredients for good, because a DELIVERED order cannot be cancelled and so
 * that restore never runs.
 *
 * Both directions still compute the same number; it is just the right number.
 */
test('the active quantity is used, net of cancellations', () => {
  const requirements = buildRecipeRequirements([
    { ...line(5, [['bun', 1]]), cancelledQty: 3 },
  ]);

  assert.equal(requirements.get('bun')?.qty, 2);
});

test('a line cancelled outright contributes nothing, whatever its quantity says', () => {
  const requirements = buildRecipeRequirements([
    { ...line(2, [['bun', 1], ['patty', 1]]), cancelledQty: 2, status: 'CANCELLED' },
    { ...line(1, [['bread', 1]]), cancelledQty: 0, status: 'ACTIVE' },
  ]);

  assert.equal(requirements.has('bun'), false);
  assert.equal(requirements.has('patty'), false);
  assert.equal(requirements.get('bread')?.qty, 1);
});

test('a CANCELLED status wins even if cancelledQty was never written', () => {
  const requirements = buildRecipeRequirements([
    { ...line(3, [['bun', 1]]), cancelledQty: 0, status: 'CANCELLED' },
  ]);

  assert.equal(requirements.has('bun'), false);
});

test('cancelledQty beyond the ordered quantity floors at zero, never goes negative', () => {
  const requirements = buildRecipeRequirements([
    { ...line(2, [['bun', 1]]), cancelledQty: 5 },
  ]);

  assert.equal(requirements.has('bun'), false);
});

test('a line with no cancelledQty at all is treated as fully active', () => {
  const requirements = buildRecipeRequirements([line(4, [['bun', 1]])]);

  assert.equal(requirements.get('bun')?.qty, 4);
});

test('name and unit come along for the error message', () => {
  const requirements = buildRecipeRequirements([
    {
      quantity: 1,
      product: {
        recipes: [
          {
            inventoryItemId: 'patty-id',
            quantity: 1,
            inventoryItem: { name: 'Beef Patty', unit: 'pcs' },
          },
        ],
      },
    },
  ]);

  assert.equal(requirements.get('patty-id')?.name, 'Beef Patty');
  assert.equal(requirements.get('patty-id')?.unit, 'pcs');
});

test('a zero-quantity line needs nothing', () => {
  const requirements = buildRecipeRequirements([line(0, [['bun', 1]])]);

  assert.equal(requirements.get('bun')?.qty ?? 0, 0);
});
