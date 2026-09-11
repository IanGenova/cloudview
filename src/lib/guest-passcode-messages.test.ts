import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PASSCODE_ERROR_CODES,
  passcodeVerifyMessage,
} from './guest-passcode-messages';

/*
 * What the room-passcode screen says when authorisation fails.
 *
 * The verify action redirects back to the page with `?error=<code>`, and the
 * page turned the code into a sentence through a static table. When the
 * passcode throttle landed, its PASSCODE_LOCKED error was never added to that
 * table, so a guest who had just been locked out for fifteen minutes fell
 * through to the generic line -- "Unable to authorize this device. Please try
 * again or contact staff." -- which told them to do the one thing that would
 * not work. The minutes the throttle had carefully computed were never shown.
 *
 * The table lives here so the action and the page agree on the codes, and so
 * the lockout line, which needs a number, can be tested.
 */

test('a lockout names the wait, in minutes', () => {
  assert.equal(
    passcodeVerifyMessage('passcode_locked', 15),
    'Too many incorrect passcode attempts. Try again in 15 minutes or contact the front desk.'
  );
});

test('one minute is singular', () => {
  assert.equal(
    passcodeVerifyMessage('passcode_locked', 1),
    'Too many incorrect passcode attempts. Try again in 1 minute or contact the front desk.'
  );
});

test('a lockout with no usable minute count still says it is a lockout', () => {
  for (const minutes of [undefined, 0, -3, Number.NaN]) {
    const message = passcodeVerifyMessage('passcode_locked', minutes as never);

    assert.match(message ?? '', /too many incorrect passcode attempts/i);
    assert.doesNotMatch(message ?? '', /NaN|-3|in 0 minute/);
  }
});

test('a lockout never tells the guest to try again now', () => {
  assert.doesNotMatch(
    passcodeVerifyMessage('passcode_locked', 15) ?? '',
    /please try again\b(?! in)/i
  );
});

test('the existing codes keep their sentences', () => {
  assert.match(passcodeVerifyMessage('invalid_passcode') ?? '', /invalid room passcode/i);
  assert.match(passcodeVerifyMessage('device_limit') ?? '', /device limit/i);
  assert.match(passcodeVerifyMessage('no_active_stay') ?? '', /no active guest stay/i);
  assert.match(passcodeVerifyMessage('missing_passcode') ?? '', /enter the room passcode/i);
  assert.match(passcodeVerifyMessage('authorization_failed') ?? '', /unable to authorize/i);
});

test('no error means no message', () => {
  assert.equal(passcodeVerifyMessage(undefined), null);
  assert.equal(passcodeVerifyMessage(''), null);
});

test('an unknown code gets the generic line, not a crash', () => {
  assert.match(passcodeVerifyMessage('something_new') ?? '', /unable to verify/i);
});

/*
 * The action chooses codes from this list; the page renders from it. Keeping
 * both on one exported constant is what stops the next error code being added
 * to one side and not the other -- which is exactly how the lockout went missing.
 */
test('every code the action can send has a sentence', () => {
  for (const code of PASSCODE_ERROR_CODES) {
    const message = passcodeVerifyMessage(code, 5);

    assert.equal(typeof message, 'string', `${code} has no message`);
    assert.doesNotMatch(message ?? '', /unable to verify/i, `${code} fell through to the generic line`);
  }
});
