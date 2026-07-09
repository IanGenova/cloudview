"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Images,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";

type GalleryImage = {
  id: string;
  title?: string | null;
  caption?: string | null;
  imageUrl: string;
};

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type WebkitFullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
};

function getFullscreenElement() {
  const fullscreenDocument = document as WebkitFullscreenDocument;

  return (
    document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement
  );
}

export function GuideImageGallery({
  images,
  variant = "section",
}: {
  images: GalleryImage[];
  variant?: "section" | "item";
}) {
  const [mounted, setMounted] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const activeThumbnailRef = useRef<HTMLButtonElement | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);

  const selectedImage =
    selectedIndex !== null ? (images[selectedIndex] ?? null) : null;

  useEffect(() => {
    setMounted(true);

    const fullscreenDocument = document as WebkitFullscreenDocument;

    setFullscreenSupported(
      Boolean(
        document.fullscreenEnabled ||
        fullscreenDocument.webkitFullscreenEnabled ||
        document.documentElement.requestFullscreen ||
        (document.documentElement as WebkitFullscreenElement)
          .webkitRequestFullscreen,
      ),
    );
  }, []);

  const exitNativeFullscreen = useCallback(async () => {
    const fullscreenDocument = document as WebkitFullscreenDocument;

    if (!getFullscreenElement()) return;

    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else {
        await fullscreenDocument.webkitExitFullscreen?.();
      }
    } catch {
      // The full-viewport gallery remains usable as a fallback.
    }
  }, []);

  const closeImage = useCallback(async () => {
    await exitNativeFullscreen();
    setSelectedIndex(null);
  }, [exitNativeFullscreen]);

  const goPrevious = useCallback(() => {
    setSelectedIndex((current) => {
      if (current === null || images.length === 0) return current;
      return current === 0 ? images.length - 1 : current - 1;
    });
  }, [images.length]);

  const goNext = useCallback(() => {
    setSelectedIndex((current) => {
      if (current === null || images.length === 0) return current;
      return current === images.length - 1 ? 0 : current + 1;
    });
  }, [images.length]);

  async function toggleNativeFullscreen() {
    const target = viewerRef.current as WebkitFullscreenElement | null;
    const fullscreenDocument = document as WebkitFullscreenDocument;

    if (!target) return;

    try {
      if (getFullscreenElement()) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else {
          await fullscreenDocument.webkitExitFullscreen?.();
        }
        return;
      }

      if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else {
        await target.webkitRequestFullscreen?.();
      }
    } catch {
      // Keep the lightbox open if native full screen is unavailable.
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchEndX.current = touch.clientX;
    touchEndY.current = touch.clientY;
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchEndX.current = touch.clientX;
    touchEndY.current = touch.clientY;
  }

  function handleTouchEnd() {
    const deltaX = touchStartX.current - touchEndX.current;
    const deltaY = touchStartY.current - touchEndY.current;

    if (Math.abs(deltaX) <= Math.abs(deltaY) || Math.abs(deltaX) < 55) {
      return;
    }

    if (deltaX > 0) goNext();
    else goPrevious();
  }

  useEffect(() => {
    function handleFullscreenChange() {
      setIsNativeFullscreen(Boolean(getFullscreenElement()));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener(
      "webkitfullscreenchange",
      handleFullscreenChange as EventListener,
    );

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (selectedIndex === null) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverscroll =
      document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";

    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") void closeImage();
      if (event.key === "ArrowLeft") goPrevious();
      if (event.key === "ArrowRight") goNext();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior = previousOverscroll;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeImage, goNext, goPrevious, selectedIndex]);

  useEffect(() => {
    if (selectedIndex === null || images.length < 2) return;

    const previousIndex =
      selectedIndex === 0 ? images.length - 1 : selectedIndex - 1;
    const nextIndex =
      selectedIndex === images.length - 1 ? 0 : selectedIndex + 1;

    [images[previousIndex], images[nextIndex]].forEach((image) => {
      const preloadedImage = new Image();
      preloadedImage.src = image.imageUrl;
    });

    activeThumbnailRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [images, selectedIndex]);

  if (!images.length) return null;

  const lightbox =
    selectedImage && selectedIndex !== null ? (
      <div
        ref={viewerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Hotel guide photo gallery"
        className="fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden bg-[#050504] text-white"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(213,173,85,0.07),transparent_48%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-40 bg-gradient-to-b from-black via-black/75 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-64 bg-gradient-to-t from-black via-black/90 to-transparent" />

        <header className="absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-4 px-4 pb-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-px w-6 bg-[#d5ad55]" />
              <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-[#d5ad55]">
                Private gallery
              </p>
            </div>
            <p className="mt-2 truncate font-serif text-lg text-[#f7f2e8]">
              {selectedImage.title || `Photograph ${selectedIndex + 1}`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {fullscreenSupported ? (
              <button
                type="button"
                onClick={toggleNativeFullscreen}
                className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.07] text-white/80 backdrop-blur-xl transition hover:border-[#d5ad55]/45 hover:text-[#d5ad55] active:scale-95"
                aria-label={
                  isNativeFullscreen
                    ? "Exit browser full screen"
                    : "Enter browser full screen"
                }
              >
                {isNativeFullscreen ? (
                  <Minimize2 className="size-[18px]" />
                ) : (
                  <Maximize2 className="size-[18px]" />
                )}
              </button>
            ) : null}

            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => void closeImage()}
              className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.07] text-white/80 backdrop-blur-xl transition hover:bg-white/15 active:scale-95"
              aria-label="Close gallery"
            >
              <X className="size-5" />
            </button>
          </div>
        </header>

        <div
          className="flex h-full w-full touch-pan-y select-none items-center justify-center px-2 pb-48 pt-24 sm:px-20 sm:pb-44"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={toggleNativeFullscreen}
        >
          <img
            key={selectedImage.id}
            src={selectedImage.imageUrl}
            alt={selectedImage.title || "Hotel guide photograph"}
            className="max-h-full max-w-full object-contain drop-shadow-[0_30px_90px_rgba(0,0,0,0.95)]"
            draggable={false}
          />
        </div>

        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrevious}
              className="absolute left-3 top-1/2 z-40 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/45 text-white/80 backdrop-blur-xl transition hover:border-[#d5ad55]/45 hover:text-[#d5ad55] active:scale-95 sm:left-7 sm:size-12"
              aria-label="Previous image"
            >
              <ChevronLeft className="size-6" />
            </button>

            <button
              type="button"
              onClick={goNext}
              className="absolute right-3 top-1/2 z-40 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/45 text-white/80 backdrop-blur-xl transition hover:border-[#d5ad55]/45 hover:text-[#d5ad55] active:scale-95 sm:right-7 sm:size-12"
              aria-label="Next image"
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        ) : null}

        <footer className="absolute inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7">
          <div className="mx-auto max-w-4xl">
            <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d5ad55]">
                  {String(selectedIndex + 1).padStart(2, "0")} /{" "}
                  {String(images.length).padStart(2, "0")}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/48">
                  {selectedImage.caption ||
                    "Swipe or use the arrows to continue through the gallery."}
                </p>
              </div>

              {fullscreenSupported ? (
                <p className="hidden shrink-0 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/28 sm:block">
                  Double-click for full screen
                </p>
              ) : null}
            </div>

            {images.length > 1 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {images.map((image, index) => (
                  <button
                    ref={index === selectedIndex ? activeThumbnailRef : null}
                    key={image.id}
                    type="button"
                    onClick={() => setSelectedIndex(index)}
                    aria-label={`Open photograph ${index + 1}`}
                    aria-current={index === selectedIndex ? "true" : undefined}
                    className={
                      index === selectedIndex
                        ? "h-14 w-20 shrink-0 overflow-hidden rounded-xl border border-[#d5ad55] opacity-100 shadow-[0_0_0_2px_rgba(213,173,85,0.15)]"
                        : "h-14 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 opacity-40 transition hover:opacity-90"
                    }
                  >
                    <img
                      src={image.imageUrl}
                      alt={image.title || `Gallery thumbnail ${index + 1}`}
                      className="size-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </footer>
      </div>
    ) : null;

  return (
    <>
      {variant === "section" ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {images.slice(0, 5).map((image, index) => {
            const isHero = index === 0;
            const isLastVisible = index === 4 && images.length > 5;

            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={
                  isHero
                    ? "group relative col-span-2 h-56 overflow-hidden rounded-[1.55rem] border border-white/10 bg-[#111] text-left active:scale-[0.99]"
                    : "group relative h-32 overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#111] text-left active:scale-[0.99]"
                }
              >
                <img
                  src={image.imageUrl}
                  alt={image.title || "Gallery image"}
                  className="size-full object-cover transition duration-700 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-black/5" />

                {isHero ? (
                  <>
                    <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white/75 backdrop-blur">
                      <Images className="size-3.5 text-[#d5ad55]" />
                      {images.length} photographs
                    </span>
                    <span className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur">
                      <Maximize2 className="size-4" />
                    </span>
                    <span className="absolute inset-x-4 bottom-4">
                      <span className="block font-serif text-lg text-white">
                        {image.title || "Gallery highlight"}
                      </span>
                      {image.caption ? (
                        <span className="mt-1 line-clamp-1 block text-xs text-white/55">
                          {image.caption}
                        </span>
                      ) : null}
                    </span>
                  </>
                ) : null}

                {isLastVisible ? (
                  <span className="absolute inset-0 grid place-items-center bg-black/65 backdrop-blur-[1px]">
                    <span className="text-center">
                      <span className="block font-serif text-2xl text-white">
                        +{images.length - 5}
                      </span>
                      <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.2em] text-[#d5ad55]">
                        View all
                      </span>
                    </span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className="group relative h-24 w-28 shrink-0 overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#111] transition hover:border-[#d5ad55]/45 active:scale-95"
            >
              <img
                src={image.imageUrl}
                alt={image.title || "Gallery image"}
                className="size-full object-cover transition duration-500 group-hover:scale-105"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
              <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur">
                <Maximize2 className="size-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      {mounted && lightbox ? createPortal(lightbox, document.body) : null}
    </>
  );
}
