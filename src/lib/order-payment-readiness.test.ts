import assert from 'node:assert/strict';
import test from 'node:test';

import { paymentReadiness } from './order-payment-readiness';

/*
 * What the desk needs to know about money before it sends an order to the
 * kitchen — one line, and a true one.
 *
 * CP-12 in the 2 October audit: the order-detail modal carried a "Staff
 * Review Checklist" of three rows, each with a green READY pill, directly
 * above Mark Paid. The first read "Payment verification — READY — PAY AT
 * COUNTER follows the hotel collection workflow" on an order badged UNPAID in
 * red three hundred pixels above it. None of the three rows could show any
 * other value for that order, and the other two restated the item list and
 * the button underneath them.
 *
 * A clerk scanning three greens reads "payment is fine" and sends food to a
 * guest who has paid nothing.
 */

const COUNTER = { paymentMethod: 'PAY_AT_COUNTER', paymentStatus: 'UNPAID', totalCents: 79080 };

test('an unpaid counter order does not say READY', () => {
  const r = paymentReadiness(COUNTER);

  assert.notEqual(r.tone, 'live');
  assert.match(r.label, /collect/i);
  assert.match(r.detail, /₱790\.80/, 'the clerk is told what to collect');
});

test('a paid counter order says so, and says nothing is outstanding', () => {
  const r = paymentReadiness({ ...COUNTER, paymentStatus: 'PAID' });

  assert.equal(r.tone, 'live');
  assert.match(r.label, /paid/i);
  assert.doesNotMatch(r.detail, /collect/i);
});

/*
 * Xendit is the one method the kitchen must wait for, because the money
 * arrives through a webhook rather than a person.
 */
test('an unverified Xendit order tells the kitchen to wait', () => {
  const r = paymentReadiness({ paymentMethod: 'XENDIT', paymentStatus: 'UNPAID', totalCents: 79080 });

  assert.equal(r.tone, 'stop');
  assert.match(r.detail, /wait/i);
  assert.equal(r.blocksKitchen, true);
});

test('a verified Xendit order does not block the kitchen', () => {
  const r = paymentReadiness({ paymentMethod: 'XENDIT', paymentStatus: 'PAID', totalCents: 79080 });

  assert.equal(r.tone, 'live');
  assert.equal(r.blocksKitchen, false);
});

test('a counter order never blocks the kitchen, paid or not', () => {
  for (const paymentStatus of ['UNPAID', 'PAID']) {
    assert.equal(paymentReadiness({ ...COUNTER, paymentStatus }).blocksKitchen, false, paymentStatus);
  }
});

test('a room charge says where the money is going, not that it has arrived', () => {
  const r = paymentReadiness({ paymentMethod: 'ROOM_CHARGE', paymentStatus: 'UNPAID', totalCents: 79080 });

  assert.notEqual(r.tone, 'live');
  assert.match(r.detail, /room|folio|checkout/i);
});

test('an order owed a refund says that, and does not read as settled', () => {
  const r = paymentReadiness({ ...COUNTER, paymentStatus: 'REFUND_PENDING' });

  assert.equal(r.tone, 'wait');
  assert.match(r.detail, /back|refund|owe/i);
});

test('every state produces a line a person can act on', () => {
  const methods = ['PAY_AT_COUNTER', 'CASH', 'ROOM_CHARGE', 'POS', 'XENDIT', 'SOMETHING_NEW'];
  const statuses = ['UNPAID', 'PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_FAILED'];

  for (const paymentMethod of methods) {
    for (const paymentStatus of statuses) {
      const r = paymentReadiness({ paymentMethod, paymentStatus, totalCents: 79080 });

      assert.ok(r.label.length > 2, `${paymentMethod}/${paymentStatus} label`);
      assert.ok(r.detail.length > 10, `${paymentMethod}/${paymentStatus} detail`);
      assert.ok(['live', 'wait', 'stop', 'done'].includes(r.tone), `${paymentMethod}/${paymentStatus} tone`);
    }
  }
});

test('nothing reads READY unless the money is actually in', () => {
  const methods = ['PAY_AT_COUNTER', 'CASH', 'ROOM_CHARGE', 'POS', 'XENDIT'];

  for (const paymentMethod of methods) {
    const r = paymentReadiness({ paymentMethod, paymentStatus: 'UNPAID', totalCents: 79080 });

    assert.notEqual(r.tone, 'live', `${paymentMethod} unpaid reads as settled`);
  }
});
