import assert from 'node:assert/strict';
import test from 'node:test';

import { getOrderOutstandingCents } from './guest-stay-folio-charges';

/*
 * What a guest still owes on an order when their stay is checked out.
 *
 * This rule had two implementations -- one in guest-stays/actions.ts and a
 * byte-identical copy in guest-stays/page.tsx -- and both were wrong in the
 * same two ways. It decides what lands on a real folio, so every case here is
 * money.
 *
 *   1. It returned 0 only for PAID. Every other settled-or-settling status --
 *      PARTIALLY_REFUNDED, REFUND_PENDING, REFUND_FAILED -- fell through and
 *      was billed again on top of what the guest had already paid.
 *
 *   2. It prorated `order.totalCents` by the ratio of active to original item
 *      subtotal. But both cancel paths already rewrite totalCents when an item
 *      is cancelled, so the discount was applied a second time and the hotel
 *      billed roughly half of what it was owed.
 */

const READY = 'READY';
const DELIVERED = 'DELIVERED';
const PENDING = 'PENDING';
const CANCELLED = 'CANCELLED';

function order(overrides: {
  totalCents: number;
  paymentStatus: string;
  status?: string;
  items?: Array<{
    quantity: number;
    unitPriceCents: number;
    cancelledQty: number;
    status: string;
  }>;
}) {
  return {
    status: DELIVERED,
    items: [
      { quantity: 1, unitPriceCents: overrides.totalCents, cancelledQty: 0, status: 'ACTIVE' },
    ],
    ...overrides,
  };
}

test('an unpaid delivered order is owed in full', () => {
  assert.equal(
    getOrderOutstandingCents(order({ totalCents: 1220, paymentStatus: 'UNPAID' })),
    1220
  );
});

test('a paid order owes nothing', () => {
  assert.equal(
    getOrderOutstandingCents(order({ totalCents: 1220, paymentStatus: 'PAID' })),
    0
  );
});

/*
 * Defect 1. The guest paid 1220 by Xendit, cancelled one of two items while the
 * order was still PENDING, and was refunded 610. The order is now
 * PARTIALLY_REFUNDED with totalCents rewritten to 610 -- already settled.
 * Billing anything here charges them a second time for goods they were
 * refunded on.
 */
test('a partially refunded order owes nothing', () => {
  assert.equal(
    getOrderOutstandingCents(
      order({
        totalCents: 610,
        paymentStatus: 'PARTIALLY_REFUNDED',
        items: [
          { quantity: 1, unitPriceCents: 500, cancelledQty: 1, status: 'CANCELLED' },
          { quantity: 1, unitPriceCents: 500, cancelledQty: 0, status: 'ACTIVE' },
        ],
      })
    ),
    0
  );
});

test('an order with a refund in flight owes nothing', () => {
  for (const paymentStatus of ['REFUND_PENDING', 'REFUND_FAILED', 'REFUNDED']) {
    assert.equal(
      getOrderOutstandingCents(order({ totalCents: 1220, paymentStatus })),
      0,
      `${paymentStatus} must not be billed again`
    );
  }
});

/*
 * Defect 2. Items A and B at 500 each, 10% service and 12% VAT -> total 1220.
 * Staff cancels A while PENDING, so the stored order becomes
 * subtotal 500 / sc 50 / tax 60 / total 610. The guest owes 610, not
 * round(610 * 500/1000) = 305.
 */
test('a ROOM_CHARGE order with a cancelled item is owed at its stored total, not prorated again', () => {
  assert.equal(
    getOrderOutstandingCents(
      order({
        totalCents: 610,
        paymentStatus: 'UNPAID',
        items: [
          { quantity: 1, unitPriceCents: 500, cancelledQty: 1, status: 'CANCELLED' },
          { quantity: 1, unitPriceCents: 500, cancelledQty: 0, status: 'ACTIVE' },
        ],
      })
    ),
    610
  );
});

test('a partially cancelled line is owed at the stored total', () => {
  assert.equal(
    getOrderOutstandingCents(
      order({
        totalCents: 366,
        paymentStatus: 'UNPAID',
        items: [{ quantity: 5, unitPriceCents: 100, cancelledQty: 2, status: 'PARTIALLY_CANCELLED' }],
      })
    ),
    366
  );
});

/*
 * Every item gone is not the same as the order being cancelled -- whole-order
 * cancellation via updateOrderStatusAction leaves totalCents untouched, while
 * item-by-item cancellation zeroes it. Neither should reach a folio.
 */
test('an order whose items are all cancelled owes nothing', () => {
  assert.equal(
    getOrderOutstandingCents(
      order({
        totalCents: 0,
        paymentStatus: 'UNPAID',
        items: [
          { quantity: 1, unitPriceCents: 500, cancelledQty: 1, status: 'CANCELLED' },
          { quantity: 2, unitPriceCents: 500, cancelledQty: 2, status: 'CANCELLED' },
        ],
      })
    ),
    0
  );
});

test('a cancelled order owes nothing even with a non-zero total', () => {
  assert.equal(
    getOrderOutstandingCents(
      order({ totalCents: 1220, paymentStatus: 'UNPAID', status: CANCELLED })
    ),
    0
  );
});

/*
 * Only food that reached the guest is billable. An order still being cooked
 * when the stay is checked out is the front desk's problem, not a folio line.
 */
test('an order that has not reached the guest owes nothing yet', () => {
  for (const status of [PENDING, 'ACCEPTED', 'PREPARING']) {
    assert.equal(
      getOrderOutstandingCents(order({ totalCents: 1220, paymentStatus: 'UNPAID', status })),
      0,
      `${status} is not billable`
    );
  }
});

test('READY and DELIVERED are both billable', () => {
  for (const status of [READY, DELIVERED]) {
    assert.equal(
      getOrderOutstandingCents(order({ totalCents: 1220, paymentStatus: 'UNPAID', status })),
      1220
    );
  }
});

test('an order with no items owes its stored total', () => {
  assert.equal(
    getOrderOutstandingCents({
      totalCents: 500,
      paymentStatus: 'UNPAID',
      status: DELIVERED,
      items: [],
    }),
    0
  );
});

test('a negative or zero stored total never becomes a charge', () => {
  assert.equal(
    getOrderOutstandingCents(order({ totalCents: 0, paymentStatus: 'UNPAID' })),
    0
  );
  assert.equal(
    getOrderOutstandingCents(order({ totalCents: -100, paymentStatus: 'UNPAID' })),
    0
  );
});
