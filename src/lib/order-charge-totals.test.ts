import assert from 'node:assert/strict';
import test from 'node:test';

import { recalculateOrderTotals } from './order-charge-totals';

/*
 * Recomputing an order's service charge and tax after a line is cancelled.
 *
 * This existed twice -- in orders/actions.ts and again in the guest tracking
 * page -- and both copies derived the rates by dividing the *stored* cents:
 *
 *   const taxRate = order.taxCents / order.subtotalCents;
 *
 * Both of those have already been rounded, and both are rewritten on every
 * cancellation, so each step derived its rate from the previous step's
 * rounding error and then rounded again. The error was re-based upward every
 * time rather than recomputed from the rate the hotel actually charges.
 *
 * Measured on a 12% hotel with 100 items at 1 centavo: the stored tax stayed
 * pinned at 12 all the way down to a subtotal of 23, where the correct figure
 * is 3 -- an effective VAT rate of 52.2%. The guest was overcharged and every
 * intermediate refund was short by the same drift.
 *
 * The rate is now passed in from HotelSettings rather than reverse-engineered
 * from money that has already been rounded.
 */

const PH = { serviceChargeRate: 0.1, taxRate: 0.12 };

function items(...lines: Array<[string, number, number, number]>) {
  return lines.map(([id, quantity, unitPriceCents, cancelledQty]) => ({
    id,
    quantity,
    unitPriceCents,
    cancelledQty,
  }));
}

test('an untouched order totals to its own rates', () => {
  const totals = recalculateOrderTotals({
    items: items(['a', 2, 38000, 0]),
    ...PH,
  });

  assert.equal(totals.subtotalCents, 76000);
  assert.equal(totals.serviceChargeCents, 7600);
  assert.equal(totals.taxCents, 9120);
  assert.equal(totals.totalCents, 92720);
});

test('the parts always sum to the total', () => {
  for (const qty of [1, 3, 7, 11]) {
    const totals = recalculateOrderTotals({
      items: items(['a', qty, 12345, 0]),
      ...PH,
    });

    assert.equal(
      totals.subtotalCents + totals.serviceChargeCents + totals.taxCents,
      totals.totalCents
    );
  }
});

test('cancelling a line removes exactly that line', () => {
  const totals = recalculateOrderTotals({
    items: items(['a', 1, 50000, 0], ['b', 1, 50000, 0]),
    cancelledItemId: 'a',
    ...PH,
  });

  assert.equal(totals.subtotalCents, 50000);
  assert.equal(totals.serviceChargeCents, 5000);
  assert.equal(totals.taxCents, 6000);
  assert.equal(totals.totalCents, 61000);
});

test('a partially cancelled line contributes what remains', () => {
  const totals = recalculateOrderTotals({
    items: items(['a', 5, 10000, 2]),
    ...PH,
  });

  assert.equal(totals.subtotalCents, 30000);
});

/*
 * The drift, as a test. Walk a 100-centavo order down one centavo at a time,
 * recomputing from the same rate each step. The tax must track 12% of what is
 * left, not creep upward from its own rounding.
 */
test('repeated cancellation does not inflate the effective rate', () => {
  const unitCount = 100;

  for (const remaining of [90, 75, 50, 30, 25, 23, 21, 1]) {
    const totals = recalculateOrderTotals({
      items: items(['a', unitCount, 1, unitCount - remaining]),
      taxRate: 0.12,
      serviceChargeRate: 0,
    });

    assert.equal(totals.subtotalCents, remaining);
    assert.equal(
      totals.taxCents,
      Math.round(remaining * 0.12),
      `at subtotal ${remaining} the tax should be ${Math.round(
        remaining * 0.12
      )}, not ${totals.taxCents}`
    );
  }
});

test('an order with everything cancelled is zero throughout', () => {
  const totals = recalculateOrderTotals({
    items: items(['a', 2, 38000, 2]),
    ...PH,
  });

  assert.equal(totals.subtotalCents, 0);
  assert.equal(totals.serviceChargeCents, 0);
  assert.equal(totals.taxCents, 0);
  assert.equal(totals.totalCents, 0);
});

test('a hotel charging nothing adds nothing', () => {
  const totals = recalculateOrderTotals({
    items: items(['a', 1, 50000, 0]),
    serviceChargeRate: 0,
    taxRate: 0,
  });

  assert.equal(totals.totalCents, 50000);
});

test('negative or unreadable rates are treated as zero, never as a credit', () => {
  for (const rate of [-0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const totals = recalculateOrderTotals({
      items: items(['a', 1, 50000, 0]),
      serviceChargeRate: rate,
      taxRate: rate,
    });

    assert.equal(totals.serviceChargeCents, 0, String(rate));
    assert.equal(totals.taxCents, 0, String(rate));
    assert.equal(totals.totalCents, 50000, String(rate));
  }
});

test('cancelledQty beyond the ordered quantity does not go negative', () => {
  const totals = recalculateOrderTotals({
    items: items(['a', 2, 10000, 5]),
    ...PH,
  });

  assert.equal(totals.subtotalCents, 0);
});

test('tax is charged on the goods, not on the service charge', () => {
  const totals = recalculateOrderTotals({
    items: items(['a', 1, 26000, 0]),
    ...PH,
  });

  // 260.00 + 10% + 12% of the goods = 260 + 26 + 31.20
  assert.equal(totals.serviceChargeCents, 2600);
  assert.equal(totals.taxCents, 3120);
  assert.equal(totals.totalCents, 31720);
});
