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

const intervalMs = Number(process.env.SCHEDULED_RELEASE_INTERVAL_MS || 60000);

const cronSecret = process.env.SCHEDULED_RELEASE_CRON_SECRET || '';

const endpoint = new URL('/api/cron/release-scheduled', appUrl).toString();

let isRunning = false;

async function runReleaseJob() {
  if (isRunning) {
    console.log('[scheduled-release] Previous run still active. Skipping.');
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
      console.error('[scheduled-release] Failed:', response.status, payload);
      return;
    }

    const orderCount = payload?.orders?.released?.length ?? 0;
    const serviceCount = payload?.serviceRequests?.released?.length ?? 0;

    if (orderCount > 0 || serviceCount > 0) {
      console.log(
        `[scheduled-release] Released ${orderCount} order(s), ${serviceCount} service request(s).`
      );
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log('[scheduled-release] No due scheduled items.');
    }
  } catch (error) {
    console.error(
      '[scheduled-release] Worker error:',
      error instanceof Error ? error.message : error
    );
  } finally {
    isRunning = false;
  }
}

console.log('[scheduled-release] Worker started.');
console.log(`[scheduled-release] Endpoint: ${endpoint}`);
console.log(`[scheduled-release] Interval: ${intervalMs}ms`);

await runReleaseJob();

setInterval(() => {
  runReleaseJob();
}, intervalMs);