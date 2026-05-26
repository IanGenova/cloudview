'use client';

import { useEffect, useMemo, useState } from 'react';

function formatElapsedTime(totalSeconds: number) {
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

export function LiveElapsedTimer({
  from,
  to,
}: {
  from: string | Date;
  to?: string | Date | null;
}) {
  const fromTime = useMemo(() => new Date(from).getTime(), [from]);
  const toTime = useMemo(() => (to ? new Date(to).getTime() : null), [to]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (toTime) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [toTime]);

  const elapsedSeconds = Math.floor(((toTime ?? now) - fromTime) / 1000);

  return <>{formatElapsedTime(elapsedSeconds)}</>;
}