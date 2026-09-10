import assert from 'node:assert/strict';
import test from 'node:test';

import { createAttemptThrottle } from './attempt-throttle';

/*
 * Counting failed attempts and locking out after too many.
 *
 * This logic already existed twice -- once keyed on the NFC guest session in
 * guest-order-identity.ts, once in memory in login-rate-limit.ts -- and the
 * one place that needed it most had neither.
 *
 * authorizeGuestStayDeviceWithPasscode verified a six-digit room passcode and
 * minted a device cookie with no counter, no lockout and no delay. A former
 * guest of room 301, who keeps the launch URL in their history because scan
 * secrets survive checkout, could walk 000000-999999 against the current
 * occupant's stay and come away with an authorized device and a full guest
 * session -- ordering room service onto that guest's folio.
 *
 * `now` is a parameter so the whole thing is testable without waiting.
 */

const OPTIONS = { maxAttempts: 5, windowMs: 60_000, lockoutMs: 900_000 };

test('a fresh key is not blocked', () => {
  const throttle = createAttemptThrottle(OPTIONS);

  assert.equal(throttle.check(['stay:1'], 0).blocked, false);
});

test('failures below the limit do not block', () => {
  const throttle = createAttemptThrottle(OPTIONS);

  for (let i = 0; i < 4; i++) {
    throttle.recordFailure(['stay:1'], 1000 * i);
  }

  assert.equal(throttle.check(['stay:1'], 5000).blocked, false);
});

test('the limit locks the key out', () => {
  const throttle = createAttemptThrottle(OPTIONS);

  for (let i = 0; i < 5; i++) {
    throttle.recordFailure(['stay:1'], 1000 * i);
  }

  const state = throttle.check(['stay:1'], 5000);

  assert.equal(state.blocked, true);
  assert.equal(state.retryAfterMs > 0, true);
});

test('the lockout expires', () => {
  const throttle = createAttemptThrottle(OPTIONS);

  for (let i = 0; i < 5; i++) {
    throttle.recordFailure(['stay:1'], 0);
  }

  assert.equal(throttle.check(['stay:1'], 899_999).blocked, true);
  assert.equal(throttle.check(['stay:1'], 900_001).blocked, false);
});

/*
 * Attempts spread thinly enough to fall outside the window must not accumulate
 * into a lockout, or a guest who mistypes once a day is eventually locked out
 * for no reason.
 */
test('attempts outside the window start a fresh count', () => {
  const throttle = createAttemptThrottle(OPTIONS);

  for (let i = 0; i < 4; i++) {
    throttle.recordFailure(['stay:1'], i * 70_000);
  }

  assert.equal(throttle.check(['stay:1'], 4 * 70_000).blocked, false);
});

/*
 * Two keys, so one attacker on one address cannot lock every stay out, and a
 * distributed guess against one stay still accumulates against that stay.
 */
test('any one of the supplied keys can block', () => {
  const throttle = createAttemptThrottle(OPTIONS);

  for (let i = 0; i < 5; i++) {
    throttle.recordFailure(['ip:1.2.3.4', 'stay:A'], 0);
  }

  assert.equal(throttle.check(['ip:1.2.3.4', 'stay:B'], 0).blocked, true);
  assert.equal(throttle.check(['ip:9.9.9.9', 'stay:A'], 0).blocked, true);
  assert.equal(throttle.check(['ip:9.9.9.9', 'stay:B'], 0).blocked, false);
});

test('a success clears the count for its keys', () => {
  const throttle = createAttemptThrottle(OPTIONS);

  for (let i = 0; i < 4; i++) {
    throttle.recordFailure(['stay:1'], 0);
  }

  throttle.clear(['stay:1']);
  throttle.recordFailure(['stay:1'], 0);

  assert.equal(throttle.check(['stay:1'], 0).blocked, false);
});

/*
 * The map is process-lifetime, so a one-off failure from each of many
 * addresses must not grow it without bound.
 */
test('expired records are pruned rather than accumulating', () => {
  const throttle = createAttemptThrottle(OPTIONS);

  for (let i = 0; i < 50; i++) {
    throttle.recordFailure([`ip:${i}`], 0);
  }

  assert.equal(throttle.size(), 50);

  throttle.check(['ip:none'], 120_000);

  assert.equal(throttle.size(), 0);
});

test('a locked record survives pruning until its lock expires', () => {
  const throttle = createAttemptThrottle(OPTIONS);

  for (let i = 0; i < 5; i++) {
    throttle.recordFailure(['stay:1'], 0);
  }

  throttle.check(['other'], 120_000);

  assert.equal(throttle.check(['stay:1'], 120_000).blocked, true);
});

test('retryAfterMs counts down', () => {
  const throttle = createAttemptThrottle(OPTIONS);

  for (let i = 0; i < 5; i++) {
    throttle.recordFailure(['stay:1'], 0);
  }

  const early = throttle.check(['stay:1'], 0).retryAfterMs;
  const later = throttle.check(['stay:1'], 300_000).retryAfterMs;

  assert.equal(early, 900_000);
  assert.equal(later, 600_000);
});

test('no keys is never blocked and records nothing', () => {
  const throttle = createAttemptThrottle(OPTIONS);

  throttle.recordFailure([], 0);

  assert.equal(throttle.check([], 0).blocked, false);
  assert.equal(throttle.size(), 0);
});
