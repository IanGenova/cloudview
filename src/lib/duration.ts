/**
 * Human-readable elapsed durations.
 *
 * Hours must roll into days. Without it a stale order reads as "807h 3m",
 * which no one can parse at a glance on a kitchen screen.
 */

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatElapsedDuration(
  elapsedMs: number,
  options: {
    withSeconds?: boolean;
  } = {}
) {
  const safeElapsed = Math.max(0, Math.floor(elapsedMs));

  const days = Math.floor(safeElapsed / DAY_MS);
  const hours = Math.floor((safeElapsed % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((safeElapsed % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((safeElapsed % MINUTE_MS) / SECOND_MS);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return options.withSeconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Same rollover rules for a duration already expressed in minutes
 * (report columns, average-resolution stats).
 */
export function formatElapsedMinutes(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return '0 min';
  }

  if (totalMinutes < 60) {
    return `${Math.round(totalMinutes)} min`;
  }

  return formatElapsedDuration(Math.round(totalMinutes) * MINUTE_MS);
}

/**
 * An order sitting in the kitchen far longer than any real service time is
 * almost certainly abandoned rather than genuinely in progress. Surfacing that
 * lets the UI flag it instead of quietly counting upward forever.
 */
export const STALE_ORDER_THRESHOLD_MS = 12 * HOUR_MS;

export function isStaleElapsed(elapsedMs: number) {
  return elapsedMs >= STALE_ORDER_THRESHOLD_MS;
}
