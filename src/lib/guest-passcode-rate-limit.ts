import 'server-only';

import { headers } from 'next/headers';

import { createAttemptThrottle } from '@/lib/attempt-throttle';

/**
 * Brute-force protection for the room passcode.
 *
 * `authorizeGuestStayDeviceWithPasscode` verified a six-digit passcode and
 * minted a device cookie with no attempt counter, no lockout and no delay. The
 * sibling path for public-location tags has had a lockout since
 * guest-order-identity.ts was written, and the dashboard login has one in
 * login-rate-limit.ts; this entry point, which grants access to a specific
 * occupied room, had neither.
 *
 * The attack it allows is concrete. Scan secrets are rotated only by an
 * explicit rotateTagSecretAction, so they survive checkout -- a former guest
 * of room 301 still holds a working `/n/<TAG>?k=<secret>` in their history.
 * After a new guest checks in they can replay the verify action across
 * 000000-999999. Six digits is half a million tries on average, which is hours
 * at a polite rate, and on success they receive an authorized device cookie
 * and a full guest session for the current occupant's stay: room service and
 * service requests charged to that guest's folio, and their stay data.
 *
 * The counting lives in attempt-throttle.ts, which takes `now` as a parameter
 * and is tested there. This file is only the request-shaped edge of it.
 */

/*
 * Tighter than the dashboard login's eight. A passcode is six digits with no
 * user-chosen entropy, and a guest who cannot remember theirs has a front desk
 * twenty metres away -- so the cost of a short lockout is small and the cost of
 * a generous one is a materially faster search.
 */
const throttle = createAttemptThrottle({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000,
});

async function getClientIp() {
  const requestHeaders = await headers();

  const forwardedFor = requestHeaders.get('x-forwarded-for') || '';
  const realIp = requestHeaders.get('x-real-ip') || '';

  return forwardedFor.split(',')[0]?.trim() || realIp.trim() || 'unknown';
}

/**
 * Keyed on the stay and on the caller's address, so one address cannot lock
 * every room in the hotel out, and a guess distributed across addresses still
 * accumulates against the room it is aimed at.
 */
export async function buildPasscodeThrottleKeys(guestStayId: string) {
  const ip = await getClientIp();

  return [`passcode-ip:${ip}`, `passcode-stay:${guestStayId}`];
}

export function checkPasscodeAttempts(keys: string[]) {
  const state = throttle.check(keys, Date.now());

  return {
    blocked: state.blocked,
    retryAfterMinutes: Math.max(1, Math.ceil(state.retryAfterMs / 60000)),
  };
}

export function recordFailedPasscodeAttempt(keys: string[]) {
  throttle.recordFailure(keys, Date.now());
}

export function clearPasscodeAttempts(keys: string[]) {
  throttle.clear(keys);
}
