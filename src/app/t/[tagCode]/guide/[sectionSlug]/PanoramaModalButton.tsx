"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Maximize2, Move, Rotate3D, Sparkles, X } from "lucide-react";

function PanoramaViewer({
  panoramaImageUrl,
  title,
}: {
  panoramaImageUrl: string;
  title: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let viewer: { destroy: () => void } | null = null;
    let destroyed = false;

    async function startViewer() {
      if (!containerRef.current) return;

      try {
        const { Viewer } = await import("@photo-sphere-viewer/core");

        if (destroyed || !containerRef.current) return;

        viewer = new Viewer({
          container: containerRef.current,
          panorama: panoramaImageUrl,
          caption: title,
          defaultZoomLvl: 22,
          mousewheel: false,
          touchmoveTwoFingers: false,
          navbar: ["zoom", "move", "caption", "fullscreen"],
        });

        setLoading(false);
      } catch {
        setLoading(false);
        setError("Unable to load the 360° experience.");
      }
    }

    void startViewer();

    return () => {
      destroyed = true;
      viewer?.destroy();
    };
  }, [panoramaImageUrl, title]);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={containerRef} className="h-full w-full bg-black" />

      {loading ? (
        <div className="absolute inset-0 grid place-items-center bg-[#070706]">
          <div className="text-center">
            <span className="mx-auto grid size-14 animate-pulse place-items-center rounded-full border border-[#d5ad55]/30 bg-[#d5ad55]/10 text-[#d5ad55]">
              <Rotate3D className="size-6" />
            </span>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.26em] text-[#d5ad55]">
              Preparing virtual view
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-0 grid place-items-center bg-[#070706] px-6 text-center">
          <div className="max-w-sm">
            <span className="mx-auto grid size-14 place-items-center rounded-full border border-red-400/20 bg-red-400/10 text-red-300">
              <X className="size-6" />
            </span>
            <p className="mt-4 font-serif text-xl text-white">{error}</p>
            <p className="mt-2 text-sm leading-6 text-white/45">
              Confirm that the image URL is valid and uses a 2:1 equirectangular
              panorama.
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
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!panoramaImageUrl) return null;

  const modal = open ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`360 degree view of ${title}`}
      className="fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden bg-black text-white"
    >
      <PanoramaViewer panoramaImageUrl={panoramaImageUrl} title={title} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-44 bg-gradient-to-b from-black via-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-48 bg-gradient-to-t from-black via-black/75 to-transparent" />

      <header className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-4 px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-[#d5ad55]" />
            <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-[#d5ad55]">
              Immersive experience
            </p>
          </div>
          <h2 className="mt-2 truncate font-serif text-xl font-normal text-[#f8f2e7]">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 max-w-xs truncate text-xs text-white/45">
              {subtitle}
            </p>
          ) : null}
        </div>

        <button
          ref={closeButtonRef}
          type="button"
          onClick={() => setOpen(false)}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10 bg-black/35 text-white/80 backdrop-blur-xl transition hover:bg-white/15 active:scale-95"
          aria-label="Close 360 viewer"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="pointer-events-none absolute inset-x-4 bottom-0 z-30 pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:pb-0">
        <div className="rounded-[1.35rem] border border-white/10 bg-black/55 p-3.5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d5ad55]/12 text-[#d5ad55]">
              <Move className="size-[18px]" />
            </span>
            <div>
              <p className="text-xs font-semibold text-white/90">
                Drag or swipe to explore
              </p>
              <p className="mt-0.5 text-[10px] leading-4 text-white/40">
                Pinch to zoom, or use the viewer controls for full screen.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex min-h-11 items-center justify-center gap-2.5 rounded-full border border-[#e4c36f]/45 bg-[linear-gradient(135deg,#e0bb60,#b98529)] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.17em] text-[#17130b] shadow-[0_14px_35px_rgba(181,132,40,0.28)] transition hover:brightness-110 active:scale-[0.98]"
      >
        <span className="grid size-7 place-items-center rounded-full bg-black/10 transition group-hover:rotate-6">
          <Eye className="size-3.5" />
        </span>
        Experience 360°
        <Maximize2 className="size-3.5 opacity-55" />
      </button>

      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
