import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WEBHOOK_OVERWRITABLE_SESSION_STATUSES,
  mayWebhookOverwriteSessionStatus,
} from './xendit-session-claim';

/*
 * Which payment-session statuses a webhook delivery may write over.
 *
 * Completion deliveries are deliberately replayable: `payment.capture`,
 * `payment.succeeded` and `payment_session.completed` all fall through the
 * idempotency check so a session left behind by an older deployment can be
 * repaired. That is a good property and this does not remove it.
 *
 * What it removes is the unconditional write. The finalizer claims the session
 * PENDING/PAID -> PROCESSING and then spends the length of an order-creation
 * transaction inside that claim -- stock reads, series-code upsert, order and
 * item inserts. A second delivery arriving in that window read PROCESSING,
 * decided it was not COMPLETED, and wrote the session back to PAID. The
 * finalizer's own conditional update then matched zero rows, threw, rolled the
 * whole order back, and the catch dispatched a full automatic refund for a
 * payment where nothing had gone wrong.
 *
 * So: PROCESSING means another delivery owns this session, and COMPLETED means
 * the work is already done. Everything else is fair game.
 */

test('a fresh or paid session may be written', () => {
  for (const status of ['PENDING', 'PAID', 'PAID_REVIEW_REQUIRED']) {
    assert.equal(mayWebhookOverwriteSessionStatus(status), true, status);
  }
});

test('a session another delivery is finalizing is never written', () => {
  assert.equal(mayWebhookOverwriteSessionStatus('PROCESSING'), false);
});

test('a completed session is never written', () => {
  assert.equal(mayWebhookOverwriteSessionStatus('COMPLETED'), false);
});

/*
 * A late completion for a session that already failed, expired or was
 * cancelled is exactly the repair case the replay exists for -- the money
 * arrived after all. Refund states are terminal for this purpose: a refund in
 * flight must not be reset to PAID by a redelivered capture.
 */
test('failed, expired and cancelled sessions may still be repaired', () => {
  for (const status of ['FAILED', 'EXPIRED', 'CANCELLED']) {
    assert.equal(mayWebhookOverwriteSessionStatus(status), true, status);
  }
});

test('a session in or past refund is never written back to paid', () => {
  for (const status of ['REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED']) {
    assert.equal(mayWebhookOverwriteSessionStatus(status), false, status);
  }
});

test('an unknown status is not written', () => {
  for (const status of ['', 'paid', ' PAID ', 'SOMETHING_NEW']) {
    assert.equal(
      mayWebhookOverwriteSessionStatus(status),
      false,
      JSON.stringify(status)
    );
  }
});

/*
 * The exported set is what the conditional update sends to the database, so it
 * has to agree with the predicate exactly -- a divergence here means the guard
 * in the query and the guard in the code disagree, which is worse than either.
 */
test('the exported status list matches the predicate', () => {
  for (const status of WEBHOOK_OVERWRITABLE_SESSION_STATUSES) {
    assert.equal(
      mayWebhookOverwriteSessionStatus(status),
      true,
      `${status} is in the list but the predicate rejects it`
    );
  }

  // Widened, because the list is `as const` and these two are the values it
  // must not contain -- which is exactly what the narrow type will not admit.
  const listed: readonly string[] = WEBHOOK_OVERWRITABLE_SESSION_STATUSES;

  assert.equal(listed.includes('PROCESSING'), false);
  assert.equal(listed.includes('COMPLETED'), false);
});
