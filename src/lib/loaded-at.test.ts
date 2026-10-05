import assert from 'node:assert/strict';
import test from 'node:test';

import { describeAge } from './loaded-at';

/*
 * ST-8. The realtime boards ship a manual Refresh and never say when what is
 * on screen was read, so staff cannot tell a quiet shift from a dead socket —
 * and the Refresh button means nothing, because there is no answer to "has
 * this already updated?".
 *
 * The wording has to be honest at the edges: a clock skew that makes the load
 * look like it happened in the future must not render "Updated -3 min ago",
 * and a page left open overnight must not say "Updated 840 min ago".
 */

test('a fresh load says just now rather than a number', () => {
  assert.equal(describeAge(0), 'just now');
  assert.equal(describeAge(20_000), 'just now');
});

test('past three quarters of a minute it starts counting', () => {
  assert.equal(describeAge(60_000), '1 min ago');
  assert.equal(describeAge(9 * 60_000), '9 min ago');
});

test('past an hour it counts in hours, and one hour is singular', () => {
  assert.equal(describeAge(60 * 60_000), '1 hour ago');
  assert.equal(describeAge(3 * 60 * 60_000), '3 hours ago');
});

test('a clock running backwards never reports a negative age', () => {
  assert.equal(describeAge(-5_000), 'just now');
  assert.equal(describeAge(-60 * 60_000), 'just now');
});

test('a value that is not a number says nothing at all', () => {
  assert.equal(describeAge(Number.NaN), null);
  assert.equal(describeAge(Number.POSITIVE_INFINITY), null);
});
