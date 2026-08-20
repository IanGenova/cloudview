'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatElapsedDuration, isStaleElapsed } from '@/lib/duration';
import { cn } from '@/lib/utils';

export function KitchenRunningTimer({
  startedAt,
}: {
  startedAt: string;
}) {
  const startedAtMs = useMemo(() => {
    const timestamp = new Date(startedAt).getTime();

    return Number.isFinite(timestamp) ? timestamp : null;
  }, [startedAt]);

  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [startedAt]);

  const elapsedMs =
    mounted && nowMs !== null && startedAtMs !== null ? nowMs - startedAtMs : null;

  const label =
    elapsedMs === null ? '—' : formatElapsedDuration(elapsedMs, { withSeconds: true });

  /**
   * Orders older than the stale threshold are almost certainly abandoned.
   * Flag them so a day-old ticket cannot masquerade as active work.
   */
  const stale = elapsedMs !== null && isStaleElapsed(elapsedMs);

  return (
    <div
      suppressHydrationWarning
      title={stale ? 'This order has been open unusually long — check if it is still valid.' : undefined}
      className={cn(
        'mt-2 rounded-full px-3 py-1 text-center text-[11px] font-black',
        stale
          ? 'bg-red-600 text-white dark:bg-red-500 dark:text-white'
          : 'bg-black text-white dark:bg-gold dark:text-black'
      )}
    >
      {stale ? `⚠ ${label}` : label}
    </div>
  );
}