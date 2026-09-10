/**
 * Counting failed attempts, and locking a key out after too many.
 *
 * The logic existed twice already -- keyed on the NFC guest session in
 * guest-order-identity.ts, and in memory in login-rate-limit.ts -- and the one
 * entry point that needed it most had neither:
 * `authorizeGuestStayDeviceWithPasscode` verified a six-digit room passcode
 * and minted a device cookie with no counter, no lockout and no delay.
 *
 * Pulled out here with `now` as a parameter and no dependency on request
 * headers, which is what makes the boundaries testable rather than a matter of
 * waiting fifteen minutes to find out.
 *
 * State is per-process and in-memory, the same caveat login-rate-limit carries:
 * fine for the current single-instance PM2 deployment, and the first thing to
 * move to a shared store if this is ever scaled horizontally.
 */

type AttemptRecord = {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
};

export type AttemptThrottleOptions = {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
};

export function createAttemptThrottle(options: AttemptThrottleOptions) {
  const attempts = new Map<string, AttemptRecord>();

  /*
   * Drop records that can no longer block anything, so a single failure from
   * each of many addresses cannot grow the map for the life of the process.
   * A record still inside its lockout is kept however old it is -- that is the
   * one thing pruning must not throw away.
   */
  function pruneExpired(now: number) {
    for (const [key, record] of attempts) {
      const lockExpired =
        record.lockedUntil !== null && record.lockedUntil <= now;
      const windowExpired = now - record.firstAttemptAt > options.windowMs;

      if ((record.lockedUntil === null && windowExpired) || lockExpired) {
        attempts.delete(key);
      }
    }
  }

  return {
    /**
     * Blocked if *any* key is locked, so an address cannot escape its lockout
     * by switching target, and a target cannot be hammered from many addresses.
     */
    check(keys: string[], now: number) {
      pruneExpired(now);

      let longestLock = 0;

      for (const key of keys) {
        const record = attempts.get(key);

        if (record?.lockedUntil && record.lockedUntil > now) {
          longestLock = Math.max(longestLock, record.lockedUntil - now);
        }
      }

      return {
        blocked: longestLock > 0,
        retryAfterMs: longestLock,
      };
    },

    recordFailure(keys: string[], now: number) {
      for (const key of keys) {
        const record = attempts.get(key);

        /*
         * Attempts spread wider than the window start a fresh count rather
         * than accumulating, so a guest who mistypes once a day is never
         * locked out for it.
         */
        if (!record || now - record.firstAttemptAt > options.windowMs) {
          attempts.set(key, {
            count: 1,
            firstAttemptAt: now,
            lockedUntil: null,
          });

          continue;
        }

        record.count += 1;

        if (record.count >= options.maxAttempts) {
          record.lockedUntil = now + options.lockoutMs;
        }
      }
    },

    /** Called on success, so a correct entry wipes the slate for its keys. */
    clear(keys: string[]) {
      for (const key of keys) {
        attempts.delete(key);
      }
    },

    /** For tests, and for anything that wants to assert the map stays bounded. */
    size() {
      return attempts.size;
    },
  };
}
