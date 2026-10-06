/**
 * When a failed Xendit refund is worth retrying, and when it needs a person.
 *
 * Two refunds of ₱50.00 sat in production for 1,942 hours — eighty-one days —
 * being retried every five minutes. Each attempt set the row to PENDING,
 * announced "Refund Processing", called Xendit, got the same answer it had
 * always got, set the row to FAILED and announced "Refund Failed". Roughly
 * ninety thousand notifications from two rows, and the guests' ₱50 never moved.
 *
 * Xendit's answer was not ambiguous:
 *
 *   Xendit 400: REFUND_NOT_SUPPORTED — Refund request failed because refunds
 *   are not supported for this channel
 *
 * The product already knew how to handle a refund that cannot succeed. Four
 * other rows carry a `MANUAL REFUND REQUIRED:` message and the retry endpoint
 * skips them permanently. But that message was only ever written by a check
 * made *before* the call, against the payment source type recorded on the
 * session. Where the channel is only revealed by Xendit's reply, nothing read
 * the reply.
 *
 * Two rules, and the second is the one that matters:
 *
 *   1. If Xendit said something that cannot change, park it for a person now.
 *   2. If it said anything else, retry — but space the attempts out, and give
 *      up after a deadline. An error nobody has classified is still allowed to
 *      stop. That is what would have caught these two in a day instead of
 *      eighty-one, without anyone having to know the code in advance.
 *
 * Unrecognised errors stay retryable on purpose. Parking a refund means a
 * guest's money waits for a human, so the bias is towards trying again — the
 * deadline, not the classifier, is what guarantees termination.
 */

export const MANUAL_REFUND_REQUIRED_PREFIX = 'MANUAL REFUND REQUIRED:';

/** Minimum gap between two automatic attempts at the same refund. */
export const RETRY_SPACING_MINUTES = 30;

/** How long a refund may go on being retried before it needs a person. */
export const RETRY_DEADLINE_HOURS = 24;

/*
 * Xendit answers that will read the same tomorrow. Each is a statement about
 * the payment or the channel, not about the moment the request was made.
 */
const PERMANENT_CODES = [
  'REFUND_NOT_SUPPORTED',
  'CHANNEL_NOT_SUPPORTED',
  'INVALID_PAYMENT_STATUS',
  'PAYMENT_NOT_FOUND',
  'REFUND_AMOUNT_EXCEEDED',
  'REFUND_NOT_ALLOWED',
];

export function isPermanentXenditRefundError(message?: string | null): boolean {
  const text = String(message ?? '').toUpperCase();

  if (!text) {
    return false;
  }

  return PERMANENT_CODES.some((code) => text.includes(code));
}

export function isManualRefundRequired(message?: string | null): boolean {
  return String(message ?? '').startsWith(MANUAL_REFUND_REQUIRED_PREFIX);
}

export type RefundRetryDecision =
  /** Already parked for a person; the retry pass ignores it. */
  | { action: 'skip'; reason: string }
  /** Park it now: write the manual-review message and stop retrying. */
  | { action: 'park'; reason: string }
  /** Retried too recently; leave it for the next pass. */
  | { action: 'wait'; reason: string }
  /** Try again. */
  | { action: 'retry'; reason: string };

export function refundRetryDecision({
  errorMessage,
  requestedAt,
  updatedAt,
  now = new Date(),
}: {
  errorMessage?: string | null;
  /** When the refund was first asked for. The deadline counts from here. */
  requestedAt: Date;
  /** When it was last touched. The spacing counts from here. */
  updatedAt: Date;
  now?: Date;
}): RefundRetryDecision {
  if (isManualRefundRequired(errorMessage)) {
    return {
      action: 'skip',
      reason: 'Already waiting for a member of staff.',
    };
  }

  if (isPermanentXenditRefundError(errorMessage)) {
    return {
      action: 'park',
      reason:
        'Xendit reported that this payment cannot be refunded through its API. ' +
        'Retrying will return the same answer, so staff must settle the amount ' +
        'with the guest or take it up with Xendit Support.',
    };
  }

  const ageHours = (now.getTime() - requestedAt.getTime()) / 3_600_000;

  /*
   * Measured from the first request, never from the last attempt: retrying
   * writes updatedAt, so a deadline counted from there could never arrive.
   */
  if (ageHours >= RETRY_DEADLINE_HOURS) {
    return {
      action: 'park',
      reason:
        `This refund has been failing for over ${RETRY_DEADLINE_HOURS} hours. ` +
        'Automatic retries have stopped; it needs a person.',
    };
  }

  const sinceLastMinutes = (now.getTime() - updatedAt.getTime()) / 60_000;

  if (sinceLastMinutes < RETRY_SPACING_MINUTES) {
    return {
      action: 'wait',
      reason: `Tried less than ${RETRY_SPACING_MINUTES} minutes ago.`,
    };
  }

  return { action: 'retry', reason: 'Worth another attempt.' };
}
