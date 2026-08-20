import 'server-only';

import { headers } from 'next/headers';

/**
 * Brute-force protection for the dashboard login.
 *
 * Dashboard passwords are deliberately allowed to be weak (see
 * `validators.ts` — temporary passwords like "12345" must be accepted), so
 * unlimited guessing is a real attack rather than a theoretical one. This
 * mirrors the lockout already used for guest room-passcode verification in
 * `guest-order-identity.ts`.
 *
 * State is per-process and in-memory. That is sufficient for the current
 * single-instance PM2 deployment; if the app is ever scaled horizontally this
 * must move to a shared store (Redis, or a database table) so attempts are
 * counted across instances.
 */

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

type AttemptRecord = {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
};

const attempts = new Map<string, AttemptRecord>();

/**
 * Drop expired records so the map cannot grow without bound from one-off
 * failures across many addresses.
 */
function pruneExpired(now: number) {
  for (const [key, record] of attempts) {
    const lockExpired = record.lockedUntil !== null && record.lockedUntil <= now;
    const windowExpired = now - record.firstAttemptAt > WINDOW_MS;

    if ((record.lockedUntil === null && windowExpired) || lockExpired) {
      attempts.delete(key);
    }
  }
}

async function getClientIp() {
  const requestHeaders = await headers();

  const forwardedFor = requestHeaders.get('x-forwarded-for') || '';
  const realIp = requestHeaders.get('x-real-ip') || '';

  return forwardedFor.split(',')[0]?.trim() || realIp.trim() || 'unknown';
}

/**
 * Key on IP *and* email so one attacker cannot lock every account out from a
 * single address, and a distributed guess against one account still counts.
 */
async function buildKeys(email: string) {
  const ip = await getClientIp();
  const normalizedEmail = email.trim().toLowerCase();

  return [`ip:${ip}`, `account:${normalizedEmail}`];
}

export type LoginThrottleState = {
  blocked: boolean;
  retryAfterMinutes: number;
};

export async function checkLoginThrottle(
  email: string
): Promise<LoginThrottleState> {
  const now = Date.now();
  pruneExpired(now);

  let longestLock = 0;

  for (const key of await buildKeys(email)) {
    const record = attempts.get(key);

    if (record?.lockedUntil && record.lockedUntil > now) {
      longestLock = Math.max(longestLock, record.lockedUntil - now);
    }
  }

  if (longestLock <= 0) {
    return {
      blocked: false,
      retryAfterMinutes: 0,
    };
  }

  return {
    blocked: true,
    retryAfterMinutes: Math.max(1, Math.ceil(longestLock / 60000)),
  };
}

export async function recordFailedLogin(email: string) {
  const now = Date.now();

  for (const key of await buildKeys(email)) {
    const record = attempts.get(key);

    if (!record || now - record.firstAttemptAt > WINDOW_MS) {
      attempts.set(key, {
        count: 1,
        firstAttemptAt: now,
        lockedUntil: null,
      });

      continue;
    }

    record.count += 1;

    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_MS;
    }
  }
}

export async function clearLoginAttempts(email: string) {
  for (const key of await buildKeys(email)) {
    attempts.delete(key);
  }
}
