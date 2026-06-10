'use client';

import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';

type GalleryImage = {
  id: string;
  title?: string | null;
  caption?: string | null;
  imageUrl: string;
};

export function GuideImageGallery({
  images,
  variant = 'section',
}: {
  images: GalleryImage[];
  variant?: 'section' | 'item';
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);

  const selectedImage =
    selectedIndex !== null ? images[selectedIndex] : null;

  function openImage(index: number) {
    setSelectedIndex(index);
  }

  function closeImage() {
    setSelectedIndex(null);
  }

  function goPrevious() {
    setSelectedIndex((current) => {
      if (current === null) return current;
      return current === 0 ? images.length - 1 : current - 1;
    });
  }

  function goNext() {
    setSelectedIndex((current) => {
      if (current === null) return current;
      return current === images.length - 1 ? 0 : current + 1;
    });
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0].clientX;
    touchStartY.current = event.touches[0].clientY;
    touchEndX.current = event.touches[0].clientX;
    touchEndY.current = event.touches[0].clientY;
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    touchEndX.current = event.touches[0].clientX;
    touchEndY.current = event.touches[0].clientY;
  }

  function handleTouchEnd() {
    const deltaX = touchStartX.current - touchEndX.current;
    const deltaY = touchStartY.current - touchEndY.current;

    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
    const minimumSwipeDistance = 55;

    if (!isHorizontalSwipe || Math.abs(deltaX) < minimumSwipeDistance) {
      return;
    }

    if (deltaX > 0) {
      goNext();
    } else {
      goPrevious();
    }
  }

  useEffect(() => {
    if (selectedIndex === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeImage();
      }

      if (event.key === 'ArrowLeft') {
        goPrevious();
      }

      if (event.key === 'ArrowRight') {
        goNext();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedIndex]);

  if (!images.length) {
    return null;
  }

  return (
    <>
      {variant === 'section' ? (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {images.map((image, index) => (
            <button
                        key={image.id}
                        type="button"
                        onClick={() => openImage(index)}
                        className="group w-64 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/8 text-left"
                        >
                        <div className="relative h-40 bg-neutral-900">
                            <img
                            src={image.imageUrl}
                            alt={image.title || 'Gallery image'}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            />

                            <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/25" />

                            <span className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur">
                            <Maximize2 className="size-4" />
                            </span>
                        </div>
                        </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => openImage(index)}
              className="group relative size-24 shrink-0 overflow-hidden rounded-2xl bg-neutral-900"
            >
              <img
                src={image.imageUrl}
                alt={image.title || 'Gallery image'}
                className="size-full object-cover transition duration-300 group-hover:scale-105"
              />

              <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/30" />

              <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                <Maximize2 className="size-3.5" />
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedImage && selectedIndex !== null ? (
        <div className="fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden bg-black text-white">
          <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-4 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-gold">
                Gallery
              </p>

              <p className="mt-1 truncate text-sm font-black text-white">
                {selectedImage.title || `Image ${selectedIndex + 1}`}
              </p>
            </div>

            <button
              type="button"
              onClick={closeImage}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
              aria-label="Close image"
            >
              <X className="size-5" />
            </button>
          </div>

          <div
            className="flex h-full w-full items-center justify-center px-4 pb-36 pt-24"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={selectedImage.imageUrl}
              alt={selectedImage.title || 'Gallery image'}
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
              draggable={false}
            />
          </div>

          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={goPrevious}
                className="absolute left-4 top-1/2 z-30 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75"
                aria-label="Previous image"
              >
                <ChevronLeft className="size-6" />
              </button>

              <button
                type="button"
                onClick={goNext}
                className="absolute right-4 top-1/2 z-30 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75"
                aria-label="Next image"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          ) : null}

          <div className="absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/80 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black text-white">
                  {selectedIndex + 1} / {images.length}
                </p>

                {selectedImage.caption ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">
                    {selectedImage.caption}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-white/40">
                    Swipe left or right to browse images.
                  </p>
                )}
              </div>
            </div>

            {images.length > 1 ? (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {images.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setSelectedIndex(index)}
                    className={
                      index === selectedIndex
                        ? 'size-16 shrink-0 overflow-hidden rounded-2xl border-2 border-gold'
                        : 'size-16 shrink-0 overflow-hidden rounded-2xl border border-white/15 opacity-60'
                    }
                  >
                    <img
                      src={image.imageUrl}
                      alt={image.title || 'Gallery thumbnail'}
                      className="size-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}