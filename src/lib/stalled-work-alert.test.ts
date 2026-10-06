import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STUCK_AFTER_HOURS,
  describeStuckWork,
  findStuckWork,
} from './stalled-work-alert';

/*
 * Two refunds were retried for 1,942 hours and nothing in the product noticed.
 *
 * The first thing this rule tried was watching the notification table: if a
 * job is looping, surely it is shouting. It is not. Notifications deduplicate
 * on identical text for twelve hours, so a doomed job does not flood, it
 * drips — and replaying the real production history showed that approach
 * firing on **day 58 of 82**, with every threshold from 3 occurrences upward
 * giving the same answer. The notifications were sparse because the dedupe
 * made them sparse. Watching them measures how loud a failure is, not how
 * long it has been failing.
 *
 * What was continuous was the work. A row sat in a failed, retryable state
 * for eighty-one days, and that was visible in the table the whole time. So
 * this rule reads the work, not the announcements: anything still waiting to
 * succeed after a day has stopped being a hiccup and become a fault.
 *
 * On the same real data this fires on day 2.
 */

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-10-06T12:00:00.000Z');

const item = (kind: string, reference: string, hoursOld: number) => ({
  kind,
  reference,
  since: new Date(now.getTime() - hoursOld * HOUR),
});

test('work still unfinished after a day is stuck', () => {
  const stuck = findStuckWork([item('refund', 'CVDHSE000001', 1942)], { now });

  assert.equal(stuck.length, 1);
  assert.equal(stuck[0].reference, 'CVDHSE000001');
  assert.equal(stuck[0].ageHours, 1942);
});

test('work that has only just failed is not stuck yet', () => {
  /* Retrying is normal and usually works. The alert is for when it does not. */
  const stuck = findStuckWork([item('refund', 'fresh', 2)], { now });

  assert.deepEqual(stuck, []);
});

test('the threshold is the one the rule documents', () => {
  assert.deepEqual(
    findStuckWork([item('refund', 'just under', STUCK_AFTER_HOURS - 1)], { now }),
    []
  );
  assert.equal(
    findStuckWork([item('refund', 'just over', STUCK_AFTER_HOURS + 1)], { now })
      .length,
    1
  );
});

test('the oldest is reported first, because it is the one to look at', () => {
  const stuck = findStuckWork(
    [
      item('refund', 'newer', 30),
      item('session', 'oldest', 900),
      item('refund', 'middle', 200),
    ],
    { now }
  );

  assert.deepEqual(
    stuck.map((s) => s.reference),
    ['oldest', 'middle', 'newer']
  );
});

test('every kind of work is reported, not just refunds', () => {
  /* The next doomed job will not be a refund, and whoever writes it will not
     think to instrument it. The scan has to be about the shape, not the type. */
  const stuck = findStuckWork(
    [item('refund', 'a', 100), item('payment session', 'b', 100), item('pos sync', 'c', 100)],
    { now }
  );

  assert.equal(stuck.length, 3);
  assert.deepEqual(
    [...new Set(stuck.map((s) => s.kind))].sort(),
    ['payment session', 'pos sync', 'refund']
  );
});

test('nothing stuck reports nothing, rather than throwing', () => {
  assert.deepEqual(findStuckWork([], { now }), []);
});

test('the description leads with how long, because that is the part nobody could see', () => {
  const [stuck] = findStuckWork([item('refund', 'CVDHSE000001', 1942)], { now });
  const text = describeStuckWork(stuck);

  assert.match(text, /81 days/);
  assert.match(text, /CVDHSE000001/);
  assert.match(text, /refund/);
});

test('a day and a bit reads as a day, not as 0 days', () => {
  const [stuck] = findStuckWork([item('refund', 'x', 26)], { now });

  assert.match(describeStuckWork(stuck), /1 day\b/);
});

test('it would have caught the real fault on day 2', () => {
  /* The two refunds were requested 1,942 hours before they were found by a
     person. Replayed hour by hour, this is the first day it fires. */
  const requestedAt = new Date(now.getTime() - 1942 * HOUR);
  let firstDay: number | null = null;

  for (let day = 1; day <= 81; day++) {
    const asOf = new Date(requestedAt.getTime() + day * 24 * HOUR);
    const found = findStuckWork(
      [{ kind: 'refund', reference: 'CVDHSE000001', since: requestedAt }],
      { now: asOf }
    );

    if (found.length && firstDay === null) {
      firstDay = day;
    }
  }

  assert.equal(firstDay, 2);
});
