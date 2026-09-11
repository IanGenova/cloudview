import assert from 'node:assert/strict';
import test from 'node:test';

import { manualRefundDue } from './manual-refund-due';

/*
 * When a cancellation leaves money the hotel must hand back by hand.
 *
 * The second ultra inspection marked a PAY_AT_COUNTER order PAID -- 317.20
 * pesos in the till -- and cancelled it from the guest tracking page. The row
 * afterwards: paymentStatus PAID, totalCents 0. A Xendit order in the same
 * position gets a GuestXenditRefund row and an automatic refund; the cash
 * order got no record anywhere that the money belonged to the guest. The
 * cancellation report showed the impact, but nothing tracked whether it was
 * ever returned.
 *
 * This rule decides, from how the order was paid and what it is paid up to,
 * whether a person owes the guest money -- and produces the marker: the
 * existing REFUND_PENDING status, plus a history note naming the amount.
 */

test('a paid cash order cancelled in full owes the whole amount back', () => {
  const due = manualRefundDue({
    paymentMethod: 'CASH',
    paymentStatus: 'PAID',
    refundAmountCents: 31720,
  });

  assert.equal(due?.paymentStatus, 'REFUND_PENDING');
  assert.equal(due?.amountCents, 31720);
});

test('the note names the amount in pesos and how it was paid', () => {
  const due = manualRefundDue({
    paymentMethod: 'PAY_AT_COUNTER',
    paymentStatus: 'PAID',
    refundAmountCents: 31720,
  });

  assert.match(due?.note ?? '', /317\.20/);
  assert.match(due?.note ?? '', /refund due/i);
  assert.match(due?.note ?? '', /counter/i);
});

test('a Xendit order is refunded automatically, so no manual marker', () => {
  assert.equal(
    manualRefundDue({
      paymentMethod: 'XENDIT',
      paymentStatus: 'PAID',
      refundAmountCents: 31720,
    }),
    null
  );
});

test('money never collected is not owed back', () => {
  for (const paymentStatus of ['UNPAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REFUND_FAILED']) {
    assert.equal(
      manualRefundDue({
        paymentMethod: 'CASH',
        paymentStatus,
        refundAmountCents: 31720,
      }),
      null,
      paymentStatus
    );
  }
});

test('a cancellation that changes nothing owes nothing', () => {
  for (const refundAmountCents of [0, -500, Number.NaN]) {
    assert.equal(
      manualRefundDue({
        paymentMethod: 'CASH',
        paymentStatus: 'PAID',
        refundAmountCents,
      }),
      null,
      String(refundAmountCents)
    );
  }
});

/*
 * A second item cancelled on an order already flagged adds its own note; the
 * status stays where it is. Nothing is lost and nothing is double-counted.
 */
test('an order already flagged stays flagged and the new amount is named', () => {
  const due = manualRefundDue({
    paymentMethod: 'CASH',
    paymentStatus: 'REFUND_PENDING',
    refundAmountCents: 9500,
  });

  assert.equal(due?.paymentStatus, 'REFUND_PENDING');
  assert.match(due?.note ?? '', /95\.00/);
});

/*
 * Every method a person collects -- the counter, the POS terminal, the room
 * bill settled at checkout -- has no automation behind it. The rule is a
 * denylist of automated methods on purpose: a payment method added later
 * without refund automation must land on the marker, not vanish the way cash
 * did.
 */
test('every hand-collected method gets the marker, and so does an unknown one', () => {
  for (const paymentMethod of ['CASH', 'PAY_AT_COUNTER', 'POS', 'ROOM_CHARGE', 'PAYMONGO', 'SOMETHING_NEW']) {
    const due = manualRefundDue({
      paymentMethod,
      paymentStatus: 'PAID',
      refundAmountCents: 100,
    });

    assert.equal(due?.paymentStatus, 'REFUND_PENDING', paymentMethod);
    assert.match(due?.note ?? '', /1\.00/, paymentMethod);
  }
});

test('the amount is whole cents', () => {
  const due = manualRefundDue({
    paymentMethod: 'CASH',
    paymentStatus: 'PAID',
    refundAmountCents: 100.4,
  });

  assert.equal(due?.amountCents, 100);
});
