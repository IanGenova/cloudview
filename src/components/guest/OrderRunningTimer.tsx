'use client';

import { useEffect, useMemo, useState } from 'react';

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export function OrderRunningTimer({
  startedAt,
  completedAt,
  isRunning = true
}: {
  startedAt: string;
  completedAt?: string | null;
  isRunning?: boolean;
}) {
  const startTime = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const endTime = useMemo(() => {
    return completedAt ? new Date(completedAt).getTime() : null;
  }, [completedAt]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning || endTime) return;

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [endTime, isRunning]);

  const effectiveEnd = endTime || now;
  const elapsedSeconds = Math.floor((effectiveEnd - startTime) / 1000);

  return (
    <div className="rounded-[1.5rem] border border-gold/20 bg-gold/10 p-4 text-center">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-gold">
        Running Timer
      </p>

      <p className="mt-2 text-3xl font-black text-white">
        {formatDuration(elapsedSeconds)}
      </p>

      <p className="mt-1 text-xs text-white/50">
        {endTime ? 'Final order time' : 'Time since order confirmation'}
      </p>
    </div>
  );
}