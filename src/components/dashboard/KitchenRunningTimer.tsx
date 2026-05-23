'use client';

import { useEffect, useMemo, useState } from 'react';

function formatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function KitchenRunningTimer({ startedAt }: { startedAt: string }) {
  const startedTime = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const elapsedSeconds = Math.floor((now - startedTime) / 1000);

  return (
    <div className="mt-2 rounded-full bg-black px-3 py-1 text-center text-[11px] font-black text-white">
      {formatElapsed(elapsedSeconds)}
    </div>
  );
}