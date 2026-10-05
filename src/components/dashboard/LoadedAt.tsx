'use client';

import { useEffect, useState } from 'react';
import { describeAge } from '@/lib/loaded-at';

/*
 * ST-8. The realtime boards ship a manual Refresh and never say when the
 * numbers on screen were read, so staff cannot tell a quiet shift from a dead
 * socket — and the Refresh button answers a question the screen never asks.
 *
 * The timestamp comes from the server on every render, so a refresh triggered
 * by the realtime subscription updates it exactly as a manual one does. The
 * wording is `describeAge`, tested in `src/lib/loaded-at.ts`.
 */
export function LoadedAt({ at }: { at: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());

    const id = window.setInterval(() => setNow(Date.now()), 15_000);

    return () => window.clearInterval(id);
  }, [at]);

  const loadedMs = new Date(at).getTime();
  const age = now === null ? 'just now' : describeAge(now - loadedMs);

  if (age === null) {
    return null;
  }

  return (
    <span
      suppressHydrationWarning
      className="text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400"
    >
      Updated {age}
    </span>
  );
}
