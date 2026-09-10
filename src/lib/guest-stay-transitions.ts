/**
 * Which way a guest stay is allowed to move.
 *
 * Orders have `staff-processing-policy.ts`. Service requests have it too.
 * Guest stays -- which decide who can open a room's guest portal, what lands
 * on a folio, and whether a folio is ever created -- had two ad-hoc checks in
 * `updateGuestStayAction` and nothing else. Everything the form sent went
 * straight to the column.
 *
 * That allowed two things it should not have:
 *
 *   A CANCELLED stay set back to Active. `checkedOutAt` was explicitly reset
 *   to null, so the stay came back to life with its room passcode and portal
 *   access, and the cancellation left no trace.
 *
 *   An ACTIVE stay set to CANCELLED or EXPIRED through the edit form, which
 *   bypasses `checkoutGuestStayAction` -- the only code that creates the
 *   folio, revokes devices and ends NFC sessions. The stay's unpaid orders and
 *   room add-on charges were then stranded: no folio existed, and checkout
 *   could never run afterwards because it rejects any non-ACTIVE stay. The
 *   only way out was to reactivate it, which is the first failure.
 */

const GUEST_STAY_TRANSITIONS: Record<string, readonly string[]> = {
  /*
   * CHECKED_OUT is absent on purpose. Checking out is a flow -- folio, device
   * revocation, session close -- and setting the column is not the same thing.
   */
  ACTIVE: ['CANCELLED', 'EXPIRED'],

  /* All three are terminal. A stay that ended does not un-end. */
  CHECKED_OUT: [],
  CANCELLED: [],
  EXPIRED: [],
};

const GUEST_STAY_STATUSES = Object.keys(GUEST_STAY_TRANSITIONS);

/**
 * Returns null for anything unrecognised.
 *
 * The original `parseGuestStayStatus` returned ACTIVE for any value it did not
 * recognise, including an empty or missing field -- so a malformed submission
 * did not fail, it reactivated the stay.
 */
export function parseGuestStayStatusStrict(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  return GUEST_STAY_STATUSES.includes(value) ? value : null;
}

export function assertGuestStayStatusTransition(
  currentStatus: string,
  nextStatus: string
) {
  if (currentStatus === nextStatus) {
    return;
  }

  /*
   * Named separately from the generic refusal because "use the checkout flow"
   * tells the operator what to do instead, where "cannot move" does not.
   */
  if (nextStatus === 'CHECKED_OUT') {
    throw new Error(
      'Please use the checkout flow to check out this guest stay.'
    );
  }

  const allowed = GUEST_STAY_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(nextStatus)) {
    throw new Error(
      `Guest stay cannot move from ${currentStatus.replaceAll(
        '_',
        ' '
      )} to ${nextStatus.replaceAll('_', ' ')}.`
    );
  }
}
