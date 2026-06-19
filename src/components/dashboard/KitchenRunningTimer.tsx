'use client';

import { useEffect, useMemo, useState } from 'react';

function formatElapsedTime(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

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

  const label =
    mounted && nowMs !== null && startedAtMs !== null
      ? formatElapsedTime(nowMs - startedAtMs)
      : '—';

  return (
    <div
      suppressHydrationWarning
      className="mt-2 rounded-full bg-black px-3 py-1 text-center text-[11px] font-black text-white dark:bg-gold dark:text-black"
    >
      {label}
    </div>
  );
}