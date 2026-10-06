import { db } from '@/lib/db';
import {
  describeSilentWorker,
  findSilentWorkers,
  type SilentWorker,
} from '@/lib/worker-heartbeat';

/**
 * Reading and writing the heartbeats themselves.
 *
 * Kept apart from the rule in `worker-heartbeat.ts` so the rule stays pure and
 * testable; this half is the database and nothing else.
 */

/**
 * Record that a scheduled job has just run.
 *
 * Never throws. A worker must not fail its real job because it could not
 * write a heartbeat — that would turn a monitoring feature into an outage,
 * which is a worse bug than the one it is here to catch.
 */
export async function recordHeartbeat(name: string, detail?: string) {
  try {
    await db.workerHeartbeat.upsert({
      where: { name },
      create: { name, detail: detail?.slice(0, 500) ?? null },
      update: { lastSeenAt: new Date(), detail: detail?.slice(0, 500) ?? null },
    });
  } catch (error) {
    console.warn('[heartbeat] Unable to record a heartbeat.', {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Which watched workers have gone quiet.
 *
 * Returns an empty list if the heartbeat table cannot be read, rather than
 * throwing: a monitoring query must not be able to take down the page that
 * displays it.
 */
export async function getSilentWorkers(
  now = new Date(),
  { alertOnNeverSeen = false }: { alertOnNeverSeen?: boolean } = {}
): Promise<SilentWorker[]> {
  try {
    const heartbeats = await db.workerHeartbeat.findMany({
      select: { name: true, lastSeenAt: true },
    });

    return findSilentWorkers(heartbeats, { now, alertOnNeverSeen });
  } catch (error) {
    console.warn('[heartbeat] Unable to read heartbeats.', {
      error: error instanceof Error ? error.message : String(error),
    });

    return [];
  }
}

export { describeSilentWorker };
