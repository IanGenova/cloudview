/**
 * Drives /api/xendit/refunds/retry on an interval.
 *
 * The endpoint and the retry logic behind it already existed and were correct.
 * Nothing called them. There was no cron entry, no systemd unit, no nginx
 * location and no PM2 app -- `retryGuestXenditRefund` had exactly one caller,
 * that route, and the route had none.
 *
 * So when a guest paid, fulfilment failed, and the automatic refund attempt
 * also failed, the GuestXenditRefund row sat at FAILED forever. No automated
 * recovery, and no dashboard surface to retry it by hand. The guest's money
 * stayed taken.
 *
 * Deliberately a copy of release-scheduled-worker.mjs rather than a shared
 * abstraction: two twenty-line pollers that will diverge as their endpoints do
 * are cheaper to read than one parameterised runner, and this file has to keep
 * working when nobody is watching it.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  'http://127.0.0.1:3000';

/*
 * Five minutes by default. A failed refund is not urgent to the minute, and
 * each run talks to Xendit, so polling this as hard as the scheduler polls for
 * due orders would be rude to an API we do not own.
 */
const intervalMs = Number(
  process.env.XENDIT_REFUND_RETRY_INTERVAL_MS || 300000
);

const cronSecret =
  process.env.XENDIT_REFUND_CRON_SECRET ||
  process.env.SCHEDULED_RELEASE_CRON_SECRET ||
  '';

const endpoint = new URL('/api/xendit/refunds/retry', appUrl).toString();

let isRunning = false;

async function runRefundRetryJob() {
  if (isRunning) {
    console.log('[refund-retry] Previous run still active. Skipping.');
    return;
  }

  isRunning = true;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...(cronSecret ? { 'x-cron-secret': cronSecret } : {}),
      },
    });

    const text = await response.text();

    let payload;

    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }

    if (!response.ok) {
      console.error('[refund-retry] Failed:', response.status, payload);
      return;
    }

    const retried = payload?.retried?.length ?? payload?.retried ?? 0;
    const count = typeof retried === 'number' ? retried : retried.length;

    if (count > 0) {
      console.log(`[refund-retry] Retried ${count} refund(s).`);
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log('[refund-retry] Nothing to retry.');
    }
  } catch (error) {
    console.error(
      '[refund-retry] Worker error:',
      error instanceof Error ? error.message : error
    );
  } finally {
    isRunning = false;
  }
}

if (!cronSecret) {
  /*
   * The endpoint fails closed without a secret, so every run would 401. Say so
   * once at boot rather than filling the log with them.
   */
  console.warn(
    '[refund-retry] No XENDIT_REFUND_CRON_SECRET set. Every call will be rejected.'
  );
}

console.log('[refund-retry] Worker started.');
console.log(`[refund-retry] Endpoint: ${endpoint}`);
console.log(`[refund-retry] Interval: ${intervalMs}ms`);

await runRefundRetryJob();

setInterval(() => {
  runRefundRetryJob();
}, intervalMs);
