/**
 * What the room-passcode screen says when authorisation fails.
 *
 * The verify action redirects to `/n/<tag>/verify?error=<code>` and the page
 * renders a sentence for the code. That table used to live inside the page,
 * and when the passcode throttle was added its PASSCODE_LOCKED error was never
 * mapped there -- so a guest who had just been locked out fell through to the
 * generic "Unable to authorize this device. Please try again or contact
 * staff.", which told them to do the one thing that would not work. The
 * minutes the throttle computed were never shown.
 *
 * One exported list of codes, consumed by both the action and the page, so a
 * code cannot be added to one side and not the other again.
 */

export const PASSCODE_ERROR_CODES = [
  'missing_passcode',
  'invalid_passcode',
  'passcode_locked',
  'device_limit',
  'no_active_stay',
  'authorization_failed',
] as const;

export type PasscodeErrorCode = (typeof PASSCODE_ERROR_CODES)[number];

const STATIC_MESSAGES: Record<Exclude<PasscodeErrorCode, 'passcode_locked'>, string> = {
  missing_passcode: 'Please enter the room passcode.',
  invalid_passcode: 'Invalid room passcode. Please try again.',
  device_limit:
    'Device limit reached for this room stay. Please contact the front desk.',
  no_active_stay:
    'No active guest stay was found for this room. Please contact the front desk.',
  authorization_failed:
    'Unable to authorize this device. Please try again or contact staff.',
};

/*
 * The lockout line carries a number the throttle computed, so it is built
 * rather than looked up. A missing or nonsensical count still produces a
 * lockout sentence -- the guest must not be told to try again -- just without
 * a figure it cannot stand behind.
 */
function lockedMessage(retryAfterMinutes?: number) {
  const minutes =
    typeof retryAfterMinutes === 'number' &&
    Number.isFinite(retryAfterMinutes) &&
    retryAfterMinutes > 0
      ? Math.ceil(retryAfterMinutes)
      : null;

  const wait =
    minutes === null
      ? 'in a few minutes'
      : `in ${minutes} minute${minutes === 1 ? '' : 's'}`;

  return `Too many incorrect passcode attempts. Try again ${wait} or contact the front desk.`;
}

export function passcodeVerifyMessage(
  error?: string | null,
  retryAfterMinutes?: number
): string | null {
  if (!error) {
    return null;
  }

  if (error === 'passcode_locked') {
    return lockedMessage(retryAfterMinutes);
  }

  return (
    STATIC_MESSAGES[error as keyof typeof STATIC_MESSAGES] ??
    'Unable to verify room access.'
  );
}
