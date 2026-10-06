import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WATCHED_WORKERS,
  describeSilentWorker,
  findSilentWorkers,
} from './worker-heartbeat';

/*
 * The stuck-work scan catches a job that keeps failing. It cannot catch a job
 * that stops running, because a job that stops running writes nothing: no row
 * is late, nothing is in a failed state, and every check stays green while
 * the work silently does not happen. The only evidence of a dead worker is
 * the absence of evidence, and absence is not something you can query for
 * unless you first write down what you expected to see.
 *
 * So each scheduled job reports in, and this decides when the silence has
 * gone on too long. The tolerance is a multiple of the job's own interval,
 * not a fixed number of minutes, because a job that runs every minute and a
 * job that runs every five have very different ideas of "late".
 */

const MINUTE = 60 * 1000;
const now = new Date('2026-10-06T12:00:00.000Z');

const beat = (name: string, minutesAgo: number) => ({
  name,
  lastSeenAt: new Date(now.getTime() - minutesAgo * MINUTE),
});

test('a worker that reported a moment ago is fine', () => {
  const silent = findSilentWorkers(
    [beat('xendit-refund-retry', 2), beat('scheduled-release', 1)],
    { now }
  );

  assert.deepEqual(silent, []);
});

test('one missed pass is not an outage', () => {
  /* Workers skip a beat: a slow query, a deploy, a restart. Crying wolf at
     the first miss would make this as ignorable as the thing it replaces. */
  const silent = findSilentWorkers(
    [beat('xendit-refund-retry', 7), beat('scheduled-release', 1)],
    { now }
  );

  assert.deepEqual(silent, []);
});

test('a worker silent for many of its own intervals has stopped', () => {
  const silent = findSilentWorkers(
    [beat('xendit-refund-retry', 120), beat('scheduled-release', 1)],
    { now }
  );

  assert.equal(silent.length, 1);
  assert.equal(silent[0].name, 'xendit-refund-retry');
  assert.equal(silent[0].silentMinutes, 120);
});

test('the tolerance follows each job’s own cadence', () => {
  /* Thirty minutes is twice over for a job that runs every minute and well
     inside tolerance for one that runs every five. An hour would be an
     outage for both, which would not demonstrate anything. */
  const silent = findSilentWorkers(
    [beat('scheduled-release', 30), beat('xendit-refund-retry', 30)],
    { now }
  );

  assert.deepEqual(
    silent.map((s) => s.name),
    ['scheduled-release']
  );
});

test('a worker that has never reported at all is silent, not absent', () => {
  /* The dangerous case: deployed, never scheduled, no row ever written.
     Reporting nothing here would be the exact failure this exists to stop. */
  const silent = findSilentWorkers([], { now });

  assert.equal(silent.length, WATCHED_WORKERS.length);
  assert.ok(silent.every((s) => s.neverSeen));
});

test('a worker nobody declared is ignored rather than guessed about', () => {
  const silent = findSilentWorkers(
    [beat('something-else-entirely', 10_000), beat('xendit-refund-retry', 1), beat('scheduled-release', 1)],
    { now }
  );

  assert.deepEqual(silent, []);
});

test('the longest silence is reported first', () => {
  const silent = findSilentWorkers(
    [beat('xendit-refund-retry', 400), beat('scheduled-release', 1200)],
    { now }
  );

  assert.deepEqual(
    silent.map((s) => s.name),
    ['scheduled-release', 'xendit-refund-retry']
  );
});

test('the description says how long and what stops working', () => {
  const [silent] = findSilentWorkers(
    [beat('xendit-refund-retry', 2880), beat('scheduled-release', 1)],
    { now }
  );
  const text = describeSilentWorker(silent);

  assert.match(text, /2 days/);
  assert.match(text, /refund/i);
});

test('silence under an hour reads in minutes, not as 0 hours', () => {
  const [silent] = findSilentWorkers(
    [beat('scheduled-release', 45), beat('xendit-refund-retry', 1)],
    { now }
  );

  assert.match(describeSilentWorker(silent), /45 minutes/);
});

test('every watched worker declares what breaks when it stops', () => {
  for (const worker of WATCHED_WORKERS) {
    assert.ok(worker.intervalMinutes > 0, `${worker.name} has no interval`);
    assert.ok(
      worker.consequence.length > 10,
      `${worker.name} does not say what stops working`
    );
  }
});

/*
 * "Never reported" is ambiguous at the moment of a deploy: every worker looks
 * dead for the first minute because the table is empty, and an alert that
 * fires on its own installation is the thing this whole exercise exists to
 * stop. But "deployed and never scheduled" is also a real fault worth
 * catching, so it cannot simply be ignored.
 *
 * The evidence that distinguishes them is already in the table: if some other
 * watched worker has been reporting steadily for a while, the system has been
 * up a while, and a peer with no row at all is genuinely missing.
 */

test('nothing has reported yet: assume a fresh deploy, not a dead estate', () => {
  const silent = findSilentWorkers([], { now, alertOnNeverSeen: true });

  assert.deepEqual(silent, []);
});

test('a worker reported seconds ago: still too early to judge its peers', () => {
  const silent = findSilentWorkers([beat('xendit-refund-retry', 1)], {
    now,
    alertOnNeverSeen: true,
  });

  assert.deepEqual(silent, []);
});

test('another worker has been up a while: a peer with no row is missing', () => {
  /* Forty minutes: past the grace period that proves the system is up, and
     still inside the refund worker's own 50-minute tolerance, so it is the
     peer that is reported and not both. */
  const silent = findSilentWorkers([beat('xendit-refund-retry', 40)], {
    now,
    alertOnNeverSeen: true,
  });

  assert.equal(silent.length, 1);
  assert.equal(silent[0].name, 'scheduled-release');
  assert.ok(silent[0].neverSeen);
});

test('the display still shows never-seen workers, because a person can judge', () => {
  /* alertOnNeverSeen defaults off for alerting and on for the screen. */
  const shown = findSilentWorkers([], { now });

  assert.equal(shown.length, WATCHED_WORKERS.length);
});
