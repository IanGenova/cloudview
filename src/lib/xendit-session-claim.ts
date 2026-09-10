/**
 * Which payment-session statuses a webhook delivery may write over.
 *
 * The webhook treats completion events as replayable on purpose -- a session
 * left half-finished by an older deployment gets repaired when Xendit resends.
 * That stays. What could not stay was the *unconditional* write underneath it.
 *
 * `finalizeGuestFoodXenditSessionById` claims a session PENDING/PAID ->
 * PROCESSING and then holds that claim for the length of an order-creation
 * transaction. A second delivery landing inside that window saw PROCESSING,
 * checked only that it was not COMPLETED, and wrote the session back to PAID.
 * The finalizer's own conditional update then matched zero rows and threw, the
 * order transaction rolled back entirely, and the catch dispatched a full
 * automatic refund against a payment that had nothing wrong with it.
 *
 * PROCESSING therefore means "another delivery owns this", and COMPLETED means
 * "the work is done". Refund states are excluded too: a redelivered capture
 * must not reset a refund in flight back to paid.
 *
 * Kept beside the predicate rather than inline in the route so the list the
 * database sees and the list the code believes cannot drift apart.
 */

export const WEBHOOK_OVERWRITABLE_SESSION_STATUSES = [
  'PENDING',
  'PAID',
  'PAID_REVIEW_REQUIRED',
  /*
   * A late completion for a session that already failed, expired or was
   * cancelled is the repair case the replay exists for: the money did arrive,
   * just after we gave up on it.
   */
  'FAILED',
  'EXPIRED',
  'CANCELLED',
] as const;

const OVERWRITABLE = new Set<string>(WEBHOOK_OVERWRITABLE_SESSION_STATUSES);

export function mayWebhookOverwriteSessionStatus(status: string) {
  return OVERWRITABLE.has(status);
}
