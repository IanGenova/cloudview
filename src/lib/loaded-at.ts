/**
 * How old the thing on screen is, in words.
 *
 * ST-8: the realtime boards carry a manual Refresh and never say when they
 * last read anything, so a quiet shift and a dead socket look identical, and
 * the Refresh button answers a question the screen never asks.
 *
 * Returns null rather than a wrong sentence when the age cannot be computed —
 * the screen then shows nothing, which is better than a figure it cannot
 * stand behind.
 */
export function describeAge(ms: number): string | null {
  if (!Number.isFinite(ms)) {
    return null;
  }

  /* A clock skew can put the load in the future. It is still "just now". */
  const seconds = Math.max(0, Math.round(ms / 1000));

  if (seconds < 45) {
    return 'just now';
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);

  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}
