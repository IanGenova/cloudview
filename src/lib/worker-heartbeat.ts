/**
 * Notice a scheduled job that has stopped running.
 *
 * The stuck-work scan catches a job that keeps failing. It cannot catch one
 * that stops, because a job that stops writes nothing: no row is late,
 * nothing sits in a failed state, and every check stays green while the work
 * silently does not happen. The only evidence of a dead worker is the absence
 * of evidence — and absence cannot be queried for unless somebody first wrote
 * down what they expected to see.
 *
 * So each scheduled job reports in, and this list is that expectation. A
 * worker missing from the list is not watched; a worker on the list that has
 * never reported at all is treated as silent rather than as absent, because
 * "deployed but never scheduled" is exactly the failure this exists to catch
 * and it leaves no row behind either.
 *
 * What this still cannot do: notice that the thing *reading* these heartbeats
 * has stopped. That is why the console shows worker health on the overview as
 * well as alerting from the scheduled pass — a page a person opens is the one
 * check that still works when the schedule itself is dead.
 */

export type WatchedWorker = {
  /** Stable identifier the worker reports under. */
  name: string;
  /** What a person calls it. */
  label: string;
  /** How often it is supposed to run. */
  intervalMinutes: number;
  /** What stops working while it is down. Goes in the alert. */
  consequence: string;
};

/*
 * Tolerance is a multiple of each job's own interval rather than a fixed
 * number of minutes: a job running every minute and a job running every five
 * have very different ideas of "late". Ten intervals is roughly an hour for
 * the refund worker and ten minutes for the release worker, which is long
 * enough to ride out a deploy or a slow pass without crying wolf.
 */
export const SILENCE_TOLERANCE_INTERVALS = 10;

/** A floor, so a very frequent job cannot alert on a momentary hiccup. */
export const MINIMUM_SILENCE_MINUTES = 15;

/**
 * How long some other worker must have been reporting before a peer with no
 * row at all counts as missing rather than as a fresh deploy.
 *
 * At the moment of a deploy the table is empty and every worker looks dead.
 * An alert that fires on its own installation is exactly the noise this is
 * here to prevent, so alerting waits for evidence that the system has been
 * up a while — which is itself in the table.
 */
export const NEVER_SEEN_GRACE_MINUTES = 30;

export const WATCHED_WORKERS: WatchedWorker[] = [
  {
    name: 'xendit-refund-retry',
    label: 'Refund retry',
    intervalMinutes: 5,
    consequence:
      'Refunds that fail are not being retried, and nothing is being parked for staff.',
  },
  {
    name: 'scheduled-release',
    label: 'Scheduled release',
    intervalMinutes: 1,
    consequence:
      'Scheduled orders are not being released to the kitchen at their time.',
  },
];

export type Heartbeat = {
  name: string;
  lastSeenAt: Date;
};

export type SilentWorker = WatchedWorker & {
  silentMinutes: number;
  /** True when the worker has never reported at all. */
  neverSeen: boolean;
};

export function findSilentWorkers(
  heartbeats: Heartbeat[],
  {
    now = new Date(),
    workers = WATCHED_WORKERS,
    toleranceIntervals = SILENCE_TOLERANCE_INTERVALS,
    alertOnNeverSeen = false,
  }: {
    now?: Date;
    workers?: WatchedWorker[];
    toleranceIntervals?: number;
    /*
     * False when the caller is deciding whether to raise an alert, true
     * when it is drawing a screen. A person reading "has never reported"
     * can tell a fresh deploy from a missing job; an alert cannot.
     */
    alertOnNeverSeen?: boolean;
  } = {}
): SilentWorker[] {
  const seen = new Map(heartbeats.map((h) => [h.name, h.lastSeenAt]));

  /*
   * The oldest heartbeat is how long we can prove the system has been up.
   * Nothing older than the grace period means we cannot yet tell a missing
   * worker from a deploy that finished a moment ago.
   */
  const oldestHeartbeatMinutes = heartbeats.length
    ? Math.max(
        ...heartbeats.map(
          (h) => (now.getTime() - h.lastSeenAt.getTime()) / 60_000
        )
      )
    : 0;

  const systemHasBeenUpAWhile =
    oldestHeartbeatMinutes >= NEVER_SEEN_GRACE_MINUTES;

  const silent: SilentWorker[] = [];

  for (const worker of workers) {
    const lastSeenAt = seen.get(worker.name);
    const tolerance = Math.max(
      MINIMUM_SILENCE_MINUTES,
      worker.intervalMinutes * toleranceIntervals
    );

    if (!lastSeenAt) {
      /*
       * Never reported. Deployed and never scheduled looks identical to
       * working perfectly if you only check rows that exist — but it also
       * looks identical to a deploy that finished ten seconds ago, so an
       * alert waits for proof that the system has been up a while. A screen
       * shows it either way, because a person can tell the difference.
       */
      if (alertOnNeverSeen && !systemHasBeenUpAWhile) {
        continue;
      }

      silent.push({ ...worker, silentMinutes: Infinity, neverSeen: true });
      continue;
    }

    const silentMinutes = Math.round(
      (now.getTime() - lastSeenAt.getTime()) / 60_000
    );

    if (silentMinutes > tolerance) {
      silent.push({ ...worker, silentMinutes, neverSeen: false });
    }
  }

  return silent.sort((a, b) => b.silentMinutes - a.silentMinutes);
}

/** How the alert reads to the person who gets it. */
export function describeSilentWorker(worker: SilentWorker) {
  if (worker.neverSeen) {
    return (
      `${worker.label} has never reported running. ` +
      `It may not be scheduled at all. ${worker.consequence}`
    );
  }

  const age =
    worker.silentMinutes >= 1440
      ? `${Math.round(worker.silentMinutes / 1440)} day${
          Math.round(worker.silentMinutes / 1440) === 1 ? '' : 's'
        }`
      : worker.silentMinutes >= 60
        ? `${Math.round(worker.silentMinutes / 60)} hour${
            Math.round(worker.silentMinutes / 60) === 1 ? '' : 's'
          }`
        : `${worker.silentMinutes} minutes`;

  return (
    `${worker.label} last ran ${age} ago, and should run every ` +
    `${worker.intervalMinutes} minute${worker.intervalMinutes === 1 ? '' : 's'}. ` +
    worker.consequence
  );
}
