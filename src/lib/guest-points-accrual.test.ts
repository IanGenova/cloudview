import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateEarnedPoints } from './guest-points-accrual';

/*
 * Loyalty accrues on the goods, not on the bill.
 *
 * This used to run on order.totalCents, so the hotel paid points on the 12% VAT
 * it remits to the BIR and on the 10% service charge — neither of which is its
 * revenue. The rule also existed twice, once here and once inlined in
 * guest-point-sync.ts, so the two paths could drift apart silently.
 *
 * The rate below is the product default: spendCentsPerPoint = 10000, ₱100 per
 * point.
 */

const RATE = 10000;

const basket = (subtotal: number, overrides: Record<string, number> = {}) => ({
  qualifyingSpendCents: subtotal,
  spendCentsPerPoint: RATE,
  minimumSpendCents: 0,
  ...overrides,
});

test('THE DECISION: a ₱260 basket earns on ₱260, not on its ₱317.20 bill', () => {
  // ₱260.00 food + ₱26.00 service charge + ₱31.20 VAT = ₱317.20.
  // Accruing on the bill gave 3 points for 2 points of actual revenue.
  assert.equal(calculateEarnedPoints(basket(26000)).points, 2);
  assert.equal(calculateEarnedPoints(basket(31720)).points, 3);
});

test('the minimum spend is measured on the same basis it accrues on', () => {
  // ₱450 of food is ₱549 on the bill. A ₱500 minimum must not be cleared by
  // tax the guest paid to the government.
  const result = calculateEarnedPoints(
    basket(45000, { minimumSpendCents: 50000 })
  );

  assert.equal(result.points, 0);
  assert.equal(result.skipReason, 'below_minimum_spend');
});

test('meeting the minimum exactly still accrues', () => {
  const result = calculateEarnedPoints(
    basket(50000, { minimumSpendCents: 50000 })
  );

  assert.equal(result.points, 5);
  assert.equal(result.skipReason, null);
});

test('a spend rate of zero or below is refused, not divided by', () => {
  for (const rate of [0, -1]) {
    const result = calculateEarnedPoints(
      basket(26000, { spendCentsPerPoint: rate })
    );

    assert.equal(result.points, 0);
    assert.equal(result.skipReason, 'invalid_spend_rate');
  }
});

test('the remainder is dropped, and the boundary lands where it should', () => {
  assert.equal(calculateEarnedPoints(basket(29999)).points, 2);
  assert.equal(calculateEarnedPoints(basket(30000)).points, 3);
});

test('a zero basket earns nothing and needs no excuse', () => {
  const result = calculateEarnedPoints(basket(0));

  assert.equal(result.points, 0);
  assert.equal(result.skipReason, null);
});

test('a negative basket cannot produce negative points', () => {
  const result = calculateEarnedPoints(basket(-5000));

  assert.equal(result.points, 0);
});

test('a fractional cent basis cannot leak a fractional point', () => {
  const result = calculateEarnedPoints(basket(26000.7));

  assert.equal(Number.isInteger(result.points), true);
  assert.equal(result.points, 2);
});

test('skipReason is the discriminator both call sites branch on', () => {
  // guest-point-sync reports why it skipped; rewards.ts only needs the number.
  // One function has to serve both, or the rule ends up written twice again.
  const ok = calculateEarnedPoints(basket(26000));
  assert.equal(ok.skipReason, null);

  const belowMin = calculateEarnedPoints(
    basket(100, { minimumSpendCents: 50000 })
  );
  assert.equal(belowMin.skipReason, 'below_minimum_spend');

  const badRate = calculateEarnedPoints(
    basket(26000, { spendCentsPerPoint: 0 })
  );
  assert.equal(badRate.skipReason, 'invalid_spend_rate');
});

test('the minimum is checked before the rate, so the reason is stable', () => {
  // Both faults at once: the guest is below minimum AND the rate is broken.
  // Reporting "below_minimum_spend" keeps the guest-facing reason honest
  // rather than surfacing a configuration error as a spending one.
  const result = calculateEarnedPoints(
    basket(100, { minimumSpendCents: 50000, spendCentsPerPoint: 0 })
  );

  assert.equal(result.skipReason, 'below_minimum_spend');
});
