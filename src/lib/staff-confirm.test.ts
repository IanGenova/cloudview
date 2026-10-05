import assert from 'node:assert/strict';
import test from 'node:test';

import { STAFF_ACTIONS, confirmFor, type StaffAction } from './staff-confirm';

/*
 * Which staff actions stop and ask, and what they say when they do.
 *
 * Two of the five blockers in the 2 October audit are here. On the kitchen
 * tablet, Reject fired `updateOrderStatusAction(CANCELLED)` from a bare
 * onClick -- no dialog, no reason, no undo -- 8px from Accept and the same
 * size, while the identical action on the desk screen was gated behind a
 * modal demanding a reason. And Mark Paid, which declares that cash was
 * collected, moved PHP 707.60 on a single click, on four cards that read
 * identically apart from their order code.
 *
 * The rule is here rather than in each button because the audit's finding was
 * precisely that it had been decided four different ways in four places.
 */

const ORDER = { code: 'CVDHFO000004', totalCents: 79080, paymentMethod: 'PAY_AT_COUNTER' };

test('moving an order forward never stops to ask', () => {
  for (const action of ['accept', 'start', 'ready', 'deliver'] as StaffAction[]) {
    assert.equal(confirmFor(action, ORDER), null, action);
  }
});

test('cancelling a guest’s order always asks, wherever it is triggered', () => {
  for (const action of ['reject', 'cancel-order', 'cancel-item'] as StaffAction[]) {
    const c = confirmFor(action, ORDER);
    assert.ok(c, `${action} does not ask`);
    assert.match(c.confirmLabel, /cancel|reject/i);
  }
});

test('declaring money collected always asks, and restates the amount', () => {
  const c = confirmFor('mark-paid', ORDER);

  assert.ok(c);
  assert.match(c.body, /₱790\.80/);
  assert.match(c.body, /counter/i, 'the method the guest chose is part of the question');
});

test('every confirmation names the order and the amount', () => {
  for (const action of STAFF_ACTIONS) {
    const c = confirmFor(action, ORDER);
    if (!c) continue;

    assert.match(`${c.title} ${c.body}`, /CVDHFO000004/, `${action} does not name the order`);
    assert.match(`${c.title} ${c.body}`, /₱790\.80/, `${action} does not name the amount`);
  }
});

/*
 * A cancelled order that has already been paid for owes the guest money back.
 * The person pressing the button is the person who will have to hand it over,
 * so the question says so.
 */
test('cancelling a paid order says the money has to go back', () => {
  const paid = { ...ORDER, paymentStatus: 'PAID' };
  const c = confirmFor('reject', paid);

  assert.ok(c);
  assert.match(c.body, /₱790\.80/);
  assert.match(c.body, /back|refund|return/i);
});

test('cancelling an unpaid order does not promise a refund that is not owed', () => {
  const c = confirmFor('reject', { ...ORDER, paymentStatus: 'UNPAID' });

  assert.ok(c);
  assert.doesNotMatch(c.body, /refund/i);
});

test('cancelling one line names the line, not the whole order', () => {
  const c = confirmFor('cancel-item', { ...ORDER, itemName: 'Breakfast Pancakes', itemTotalCents: 26000 });

  assert.ok(c);
  assert.match(c.body, /Breakfast Pancakes/);
  assert.match(c.body, /₱260\.00/, 'the line total, not the order total');
});

test('clearing a sale asks only when there is something to lose', () => {
  assert.equal(confirmFor('clear-sale', { ...ORDER, totalCents: 0 }), null);
  assert.ok(confirmFor('clear-sale', { ...ORDER, totalCents: 79080 }));
});

test('no confirmation asks a question the person cannot answer', () => {
  for (const action of STAFF_ACTIONS) {
    const c = confirmFor(action, ORDER);
    if (!c) continue;

    assert.ok(c.title.length > 0 && c.title.length < 80, `${action} title`);
    assert.ok(c.body.length > 20, `${action} body is too thin to decide on`);
    assert.doesNotMatch(c.confirmLabel, /^(ok|yes|confirm)$/i, `${action} label says nothing`);
  }
});

test('an unknown action is treated as dangerous, not as safe', () => {
  const c = confirmFor('something-new' as StaffAction, ORDER);

  assert.ok(c, 'an action the rule does not know must still ask');
});
