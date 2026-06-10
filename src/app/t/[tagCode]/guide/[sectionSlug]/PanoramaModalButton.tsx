'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, Maximize2, X } from 'lucide-react';

function PanoramaViewer({
  panoramaImageUrl,
  title,
}: {
  panoramaImageUrl: string;
  title: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let viewer: {
      destroy: () => void;
    } | null = null;

    let destroyed = false;

    async function startViewer() {
      if (!containerRef.current) {
        return;
      }

      try {
        const { Viewer } = await import('@photo-sphere-viewer/core');

        if (destroyed || !containerRef.current) {
          return;
        }

        viewer = new Viewer({
          container: containerRef.current,
          panorama: panoramaImageUrl,
          caption: title,
          defaultZoomLvl: 20,
          mousewheel: false,
          navbar: ['zoom', 'move', 'caption', 'fullscreen'],
        });
      } catch {
        setError('Unable to load the 360° viewer.');
      }
    }

    startViewer();

    return () => {
      destroyed = true;
      viewer?.destroy();
    };
  }, [panoramaImageUrl, title]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full bg-black" />

      {error ? (
        <div className="absolute inset-0 grid place-items-center bg-black px-6 text-center">
          <div>
            <p className="font-black text-white">{error}</p>
            <p className="mt-2 text-sm leading-6 text-white/50">
              Make sure the panorama image URL is valid and uses a 2:1
              equirectangular image.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PanoramaModalButton({
  title,
  subtitle,
  panoramaImageUrl,
}: {
  title: string;
  subtitle?: string | null;
  panoramaImageUrl: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!panoramaImageUrl) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-gold px-4 py-2 text-xs font-black text-black"
      >
        <Eye className="size-4" />
        View 360°
      </button>

      {open ? (
        <div className="fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden bg-black text-white">
          <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-4 bg-gradient-to-b from-black/90 to-transparent px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-gold">
                360° Virtual View
              </p>

              <h2 className="mt-1 truncate text-lg font-black text-white">
                {title}
              </h2>

              {subtitle ? (
                <p className="mt-1 truncate text-xs text-white/50">
                  {subtitle}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
              aria-label="Close 360 viewer"
            >
              <X className="size-5" />
            </button>
          </div>

          <PanoramaViewer panoramaImageUrl={panoramaImageUrl} title={title} />

          <div className="pointer-events-none absolute inset-x-4 bottom-0 z-30 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="rounded-[1.5rem] border border-white/10 bg-black/70 p-4 backdrop-blur-xl">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gold/20 text-gold">
                  <Maximize2 className="size-5" />
                </span>

                <div>
                  <p className="text-sm font-black text-white">
                    Drag or swipe to look around
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/55">
                    Pinch or use controls to zoom. Use fullscreen for the best
                    experience.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}