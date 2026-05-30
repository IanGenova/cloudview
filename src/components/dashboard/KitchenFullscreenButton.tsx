'use client';

import { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

export function KitchenFullscreenButton({
  targetId = 'kitchen-display-fullscreen',
}: {
  targetId?: string;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        const target = document.getElementById(targetId);

        if (!target) {
          console.error(`Fullscreen target "${targetId}" was not found.`);
          return;
        }

        await target.requestFullscreen();
        setIsFullscreen(true);
        return;
      }

      await document.exitFullscreen();
      setIsFullscreen(false);
    } catch (error) {
      console.error('Unable to toggle fullscreen:', error);
    }
  }

  return (
    <button
      type="button"
      onClick={toggleFullscreen}
      className="inline-flex h-11 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
    >
      {isFullscreen ? (
        <Minimize2 className="size-4" />
      ) : (
        <Maximize2 className="size-4" />
      )}

      {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
    </button>
  );
}