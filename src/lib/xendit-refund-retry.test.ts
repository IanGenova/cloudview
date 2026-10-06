import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RETRY_DEADLINE_HOURS,
  RETRY_SPACING_MINUTES,
  isPermanentXenditRefundError,
  refundRetryDecision,
} from './xendit-refund-retry';

/*
 * Two refunds of ₱50.00 sat in production for 1,942 hours — eighty-one days —
 * being retried every five minutes, each attempt writing PENDING and then
 * FAILED and announcing both. Xendit's answer never changed and never could:
 *
 *   Xendit 400: REFUND_NOT_SUPPORTED — Refund request failed because refunds
 *   are not supported for this channel
 *
 * The product already knows how to park a refund that cannot succeed: four
 * other rows carry a MANUAL REFUND REQUIRED message and the retry endpoint
 * skips them for good. But that message is only ever written by a check made
 * *before* the call, against the payment source type we happened to record.
 * When the channel is only revealed by Xendit's reply, nothing reads the
 * reply, so the refund is filed as a normal failure and retried for ever.
 *
 * The rule below reads what Xendit actually said. It is deliberately
 * conservative in one direction: an error it does not recognise stays
 * retryable, because giving up on returning a guest's money is worse than one
 * more attempt. The deadline is what stops the unrecognised ones.
 */

test('the error that caused this is permanent', () => {
  assert.equal(
    isPermanentXenditRefundError(
      'Xendit 400: REFUND_NOT_SUPPORTED — Refund request failed because refunds are not supported for this channel'
    ),
    true
  );
});

test('the code is recognised however the message is wrapped', () => {
  assert.equal(isPermanentXenditRefundError('REFUND_NOT_SUPPORTED'), true);
  assert.equal(
    isPermanentXenditRefundError('{"error_code":"refund_not_supported"}'),
    true
  );
});

test('the other channel refusals are permanent too', () => {
  assert.equal(isPermanentXenditRefundError('CHANNEL_NOT_SUPPORTED'), true);
  assert.equal(isPermanentXenditRefundError('INVALID_PAYMENT_STATUS'), true);
  assert.equal(isPermanentXenditRefundError('PAYMENT_NOT_FOUND'), true);
  assert.equal(
    isPermanentXenditRefundError('REFUND_AMOUNT_EXCEEDED'),
    true
  );
});

test('a timeout or an outage is not permanent: Xendit may answer differently in a minute', () => {
  assert.equal(isPermanentXenditRefundError('ETIMEDOUT'), false);
  assert.equal(isPermanentXenditRefundError('Xendit 500: SERVER_ERROR'), false);
  assert.equal(isPermanentXenditRefundError('Xendit 429: RATE_LIMIT'), false);
  assert.equal(isPermanentXenditRefundError('socket hang up'), false);
});

test('an error nobody has seen before stays retryable', () => {
  assert.equal(isPermanentXenditRefundError('Something new went wrong'), false);
  assert.equal(isPermanentXenditRefundError(''), false);
  assert.equal(isPermanentXenditRefundError(null), false);
  assert.equal(isPermanentXenditRefundError(undefined), false);
});

/* The decision the retry endpoint makes about one failed refund. */

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const now = new Date('2026-10-06T12:00:00.000Z');

test('a permanent failure is parked, not retried, however fresh it is', () => {
  const decision = refundRetryDecision({
    errorMessage: 'Xendit 400: REFUND_NOT_SUPPORTED — not supported',
    requestedAt: new Date(now.getTime() - MINUTE),
    updatedAt: new Date(now.getTime() - MINUTE),
    now,
  });

  assert.equal(decision.action, 'park');
  /* The reason is read by staff on the order, so it has to say what to do. */
  assert.match(decision.reason, /staff must settle/i);
});

test('a refund already parked for manual review is left alone', () => {
  const decision = refundRetryDecision({
    errorMessage:
      'MANUAL REFUND REQUIRED: QR Ph payments cannot be refunded through the Xendit Refund API.',
    requestedAt: new Date(now.getTime() - 100 * HOUR),
    updatedAt: new Date(now.getTime() - HOUR),
    now,
  });

  assert.equal(decision.action, 'skip');
});

test('a transient failure retried moments ago waits its turn', () => {
  const decision = refundRetryDecision({
    errorMessage: 'ETIMEDOUT',
    requestedAt: new Date(now.getTime() - HOUR),
    updatedAt: new Date(now.getTime() - MINUTE),
    now,
  });

  assert.equal(decision.action, 'wait');
});

test('a transient failure left long enough is retried', () => {
  const decision = refundRetryDecision({
    errorMessage: 'ETIMEDOUT',
    requestedAt: new Date(now.getTime() - HOUR),
    updatedAt: new Date(now.getTime() - (RETRY_SPACING_MINUTES + 1) * MINUTE),
    now,
  });

  assert.equal(decision.action, 'retry');
});

test('a transient failure past the deadline is parked for a person', () => {
  /* This is what would have caught the 81-day loop even if nobody had ever
     enumerated REFUND_NOT_SUPPORTED. */
  const decision = refundRetryDecision({
    errorMessage: 'Something nobody has classified',
    requestedAt: new Date(now.getTime() - (RETRY_DEADLINE_HOURS + 1) * HOUR),
    updatedAt: new Date(now.getTime() - 10 * HOUR),
    now,
  });

  assert.equal(decision.action, 'park');
  assert.match(decision.reason, /automatic retries/i);
});

test('the deadline is counted from the first request, not the last attempt', () => {
  /* Retrying resets updatedAt, so measuring from it would never expire. */
  const decision = refundRetryDecision({
    errorMessage: 'Something nobody has classified',
    requestedAt: new Date(now.getTime() - (RETRY_DEADLINE_HOURS + 1) * HOUR),
    updatedAt: new Date(now.getTime() - (RETRY_SPACING_MINUTES + 1) * MINUTE),
    now,
  });

  assert.equal(decision.action, 'park');
});
