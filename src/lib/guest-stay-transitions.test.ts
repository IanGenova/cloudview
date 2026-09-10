import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertGuestStayStatusTransition,
  parseGuestStayStatusStrict,
} from './guest-stay-transitions';

/*
 * Which way a guest stay is allowed to move.
 *
 * Orders have a transition table. Service requests have a transition table.
 * Guest stays -- which decide who can open a room's portal, what lands on a
 * folio, and whether that folio exists at all -- had two ad-hoc checks and
 * nothing else: "already checked out, refuse" and "asking for checked out,
 * refuse". Everything else went straight from the form to the column.
 *
 * Two failures came out of that:
 *
 *   A CANCELLED stay could be set back to Active. checkedOutAt was explicitly
 *   reset to null, so the stay was live again with its room passcode and
 *   portal access, and the record of the cancellation was gone.
 *
 *   An ACTIVE stay could be set to CANCELLED or EXPIRED through the edit form,
 *   which bypasses checkoutGuestStayAction -- the only code that creates the
 *   folio, revokes devices and ends sessions. Its unpaid orders and room
 *   charges were then stranded: no folio, and no way to check out afterwards
 *   because that path rejects any non-ACTIVE stay.
 *
 * And parseGuestStayStatus defaulted to ACTIVE on anything it did not
 * recognise, so a malformed or missing field silently reactivated a stay.
 */

test('an active stay may be cancelled or expired', () => {
  assert.doesNotThrow(() =>
    assertGuestStayStatusTransition('ACTIVE', 'CANCELLED')
  );
  assert.doesNotThrow(() =>
    assertGuestStayStatusTransition('ACTIVE', 'EXPIRED')
  );
});

test('staying put is always allowed', () => {
  for (const status of ['ACTIVE', 'CHECKED_OUT', 'CANCELLED', 'EXPIRED']) {
    assert.doesNotThrow(() =>
      assertGuestStayStatusTransition(status, status)
    );
  }
});

test('a cancelled stay cannot be brought back to life', () => {
  assert.throws(
    () => assertGuestStayStatusTransition('CANCELLED', 'ACTIVE'),
    /cannot move/i
  );
});

test('an expired stay cannot be brought back to life', () => {
  assert.throws(
    () => assertGuestStayStatusTransition('EXPIRED', 'ACTIVE'),
    /cannot move/i
  );
});

test('a checked-out stay is terminal in every direction', () => {
  for (const next of ['ACTIVE', 'CANCELLED', 'EXPIRED']) {
    assert.throws(
      () => assertGuestStayStatusTransition('CHECKED_OUT', next),
      /cannot move/i,
      `CHECKED_OUT -> ${next} must be refused`
    );
  }
});

/*
 * Checkout is a flow, not a field. It creates the folio, revokes devices and
 * ends sessions; setting the column directly skips all of that.
 */
test('nothing may be set to checked out directly', () => {
  for (const from of ['ACTIVE', 'CANCELLED', 'EXPIRED']) {
    assert.throws(
      () => assertGuestStayStatusTransition(from, 'CHECKED_OUT'),
      /checkout/i,
      `${from} -> CHECKED_OUT must point at the checkout flow`
    );
  }
});

test('a cancelled stay may still expire', () => {
  assert.throws(
    () => assertGuestStayStatusTransition('CANCELLED', 'EXPIRED'),
    /cannot move/i
  );
});

test('an unknown status is refused rather than defaulting to active', () => {
  for (const value of ['', '  ', 'active', 'ARCHIVED', null, undefined, 7, {}]) {
    assert.equal(
      parseGuestStayStatusStrict(value as never),
      null,
      JSON.stringify(value)
    );
  }
});

test('the four real statuses parse', () => {
  for (const value of ['ACTIVE', 'CHECKED_OUT', 'CANCELLED', 'EXPIRED']) {
    assert.equal(parseGuestStayStatusStrict(value), value);
  }
});

test('an unknown current status refuses every move', () => {
  assert.throws(
    () => assertGuestStayStatusTransition('SOMETHING', 'ACTIVE'),
    /cannot move/i
  );
});
