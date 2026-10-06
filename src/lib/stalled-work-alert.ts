/**
 * Notice background work that cannot finish, whichever worker owns it.
 *
 * Two refunds were retried for 1,942 hours — eighty-one days — and nothing in
 * the product said so. The first attempt at this rule watched the
 * notification table, on the reasoning that a looping job must be shouting.
 * It is not. Notifications deduplicate on identical text for twelve hours, so
 * a doomed job drips rather than floods: replaying the real production
 * history, that approach fired on **day 58 of 82**, and every threshold from
 * three occurrences upward gave the same answer. Watching the announcements
 * measures how loud a failure is, not how long it has been failing.
 *
 * What was continuous was the work. A row sat in a failed, retryable state
 * for eighty-one days and was visible in its own table the entire time. So
 * this reads the work: anything still waiting to succeed after a day has
 * stopped being a hiccup and become a fault. On the same real data it fires
 * on day 2.
 *
 * It takes already-gathered items rather than querying, so the rule stays
 * pure and the caller decides which tables count as work. Adding a new kind
 * of background job means adding it to that list — which is a line in one
 * place, not instrumentation inside the worker.
 */

/**
 * How long work may go on failing before it is somebody's problem.
 *
 * A day, matching the deadline after which a refund is parked for a person.
 * Long enough that an outage lasting an afternoon resolves itself quietly;
 * short enough that nothing runs for a season unnoticed.
 */
export const STUCK_AFTER_HOURS = 24;

export type WorkItem = {
  /** What kind of work it is, in the words staff would use. */
  kind: string;
  /** Something a person can search for: an order code, a reference. */
  reference: string;
  /** When it was first attempted. The age is measured from here. */
  since: Date;
  /** Anything else worth putting in the alert. */
  detail?: string;
};

export type StuckWork = WorkItem & { ageHours: number };

export function findStuckWork(
  items: WorkItem[],
  {
    now = new Date(),
    thresholdHours = STUCK_AFTER_HOURS,
  }: { now?: Date; thresholdHours?: number } = {}
): StuckWork[] {
  return items
    .map((item) => ({
      ...item,
      ageHours: Math.round((now.getTime() - item.since.getTime()) / 3_600_000),
    }))
    .filter((item) => item.ageHours > thresholdHours)
    /* Oldest first: the one that has been wrong longest is the one to read. */
    .sort((a, b) => b.ageHours - a.ageHours);
}

/** How the alert reads to the person who gets it. */
export function describeStuckWork(item: StuckWork) {
  const days = Math.max(1, Math.round(item.ageHours / 24));
  const age = `${days} day${days === 1 ? '' : 's'}`;

  return (
    `A ${item.kind} for ${item.reference} has been retrying for ${age} ` +
    'without succeeding, and will not fix itself.' +
    (item.detail ? ` ${item.detail}` : '')
  );
}
