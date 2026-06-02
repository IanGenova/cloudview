'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  BedDouble,
  Car,
  ChevronLeft,
  ChevronRight,
  Clock,
  HelpCircle,
  Hotel,
  Info,
  MapPin,
  Maximize2,
  Phone,
  Search,
  Shield,
  Utensils,
  Waves,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react';


const fallbackImage =
  'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=800&q=80';

const iconMap: Record<string, LucideIcon> = {
  Info,
  Wifi,
  BedDouble,
  Hotel,
  MapPin,
  Utensils,
  Car,
  Phone,
  Clock,
  Waves,
  Search,
  Shield,
  HelpCircle,
};

type GuideImage = {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
};

type GuideItem = {
  id: string;
  title: string;
  subtitle: string;
  content: string;
  iconKey: string;
  hours: string;
  location: string;
  contact: string;
  mapUrl: string;
  buttonLabel: string;
  buttonHref: string;
  galleryImages: GuideImage[];
};

type GuideSection = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  iconKey: string;
  items: GuideItem[];
  galleryImages: GuideImage[];
};

type StaticInfoCard = {
  id: string;
  title: string;
  body: string;
  iconKey: string;
};

function resolveHref(tagCode: string, href?: string | null) {
  if (!href) {
    return '#';
  }

  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href;
  }

  if (href.startsWith('/')) {
    return href;
  }

  return `/t/${tagCode}/${href.replace(/^\/+/, '')}`;
}

function includesSearch(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

function sectionMatches(section: GuideSection, query: string) {
  const searchableSectionText = [
    section.title,
    section.subtitle,
    section.description,
    ...section.galleryImages.map((image) => `${image.title} ${image.caption}`),
  ].join(' ');

  return includesSearch(searchableSectionText, query);
}

function itemMatches(item: GuideItem, query: string) {
  const searchableItemText = [
    item.title,
    item.subtitle,
    item.content,
    item.hours,
    item.location,
    item.contact,
    ...item.galleryImages.map((image) => `${image.title} ${image.caption}`),
  ].join(' ');

  return includesSearch(searchableItemText, query);
}

function staticCardMatches(card: StaticInfoCard, query: string) {
  return includesSearch(`${card.title} ${card.body}`, query);
}

function getImageTitle(image: GuideImage) {
  return image.title || 'Hotel Guide Image';
}

function getPreviousIndex(currentIndex: number, total: number) {
  return currentIndex === 0 ? total - 1 : currentIndex - 1;
}

function getNextIndex(currentIndex: number, total: number) {
  return currentIndex === total - 1 ? 0 : currentIndex + 1;
}

function FullscreenGalleryModal({
  images,
  selectedIndex,
  onSelect,
  onClose,
}: {
  images: GuideImage[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const selectedImage = images[selectedIndex];
  const hasMultipleImages = images.length > 1;

  function goPrevious() {
    if (!hasMultipleImages) {
      return;
    }

    onSelect(getPreviousIndex(selectedIndex, images.length));
  }

  function goNext() {
    if (!hasMultipleImages) {
      return;
    }

    onSelect(getNextIndex(selectedIndex, images.length));
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    setTouchStartX(event.touches[0]?.clientX ?? null);
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX === null) {
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? touchStartX;
    const deltaX = endX - touchStartX;
    const swipeThreshold = 45;

    if (Math.abs(deltaX) >= swipeThreshold) {
      if (deltaX > 0) {
        goPrevious();
      } else {
        goNext();
      }
    }

    setTouchStartX(null);
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
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
      document.body.style.overscrollBehavior = previousOverscroll;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedIndex, images.length]);

  if (!mounted || !selectedImage) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-4 bg-gradient-to-b from-black/90 via-black/55 to-transparent px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="truncate text-sm font-black">
            {getImageTitle(selectedImage)}
          </p>
          <p className="mt-1 text-xs font-bold text-white/60">
            {selectedIndex + 1} of {images.length}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md active:scale-95"
          aria-label="Close fullscreen image"
        >
          <X className="size-6" />
        </button>
      </div>

      <div
        className="flex h-[100dvh] w-screen touch-pan-y select-none items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={selectedImage.imageUrl}
          alt={getImageTitle(selectedImage)}
          className="h-full max-h-[100dvh] w-full max-w-screen object-contain"
          draggable={false}
        />
      </div>

      {hasMultipleImages ? (
        <>
          <button
            type="button"
            onClick={goPrevious}
            className="absolute left-3 top-1/2 z-30 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md active:scale-95"
            aria-label="Previous image"
          >
            <ChevronLeft className="size-8" />
          </button>

          <button
            type="button"
            onClick={goNext}
            className="absolute right-3 top-1/2 z-30 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md active:scale-95"
            aria-label="Next image"
          >
            <ChevronRight className="size-8" />
          </button>
        </>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-20">
        {selectedImage.caption ? (
          <p className="mx-auto max-w-md text-center text-sm leading-6 text-white/75">
            {selectedImage.caption}
          </p>
        ) : null}

        {hasMultipleImages ? (
          <div className="mt-4 flex items-center justify-center gap-2">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => onSelect(index)}
                className={
                  index === selectedIndex
                    ? 'h-2.5 w-8 rounded-full bg-gold'
                    : 'size-2.5 rounded-full bg-white/35'
                }
                aria-label={`Open image ${index + 1}`}
              />
            ))}
          </div>
        ) : null}

        <p className="mt-3 text-center text-[11px] font-bold text-white/40">
          Swipe left or right to browse images
        </p>
      </div>
    </div>,
    document.body
  );
}

function BrochureGallery({ images }: { images: GuideImage[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const activeImages = images
    .filter((image) => image.isActive)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }

      return a.title.localeCompare(b.title);
    });

  if (!activeImages.length) {
    return null;
  }

  return (
    <div className="mt-4 grid gap-3">
      <p className="text-xs font-black uppercase tracking-wide text-gold">
        Brochure Gallery
      </p>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {activeImages.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setSelectedIndex(index)}
            className="w-56 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/8 text-left shadow-sm transition hover:border-gold/60 hover:bg-gold/10"
          >
            <div
              className="relative h-36 bg-neutral-900 bg-cover bg-center"
              style={{
                backgroundImage: `url(${image.imageUrl})`,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />

              <div className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur">
                <Maximize2 className="size-4" />
              </div>

              <div className="absolute bottom-2 left-2 rounded-full bg-black/55 px-3 py-1 text-[10px] font-black text-white backdrop-blur">
                Tap to view
              </div>
            </div>

            <div className="p-3">
              {image.title ? (
                <p className="line-clamp-1 font-black text-white">
                  {image.title}
                </p>
              ) : (
                <p className="line-clamp-1 font-black text-white">
                  Hotel Guide Image
                </p>
              )}

              {image.caption ? (
                <p className="mt-1 line-clamp-3 text-xs leading-5 text-white/50">
                  {image.caption}
                </p>
              ) : null}
            </div>
          </button>
        ))}
      </div>

      {selectedIndex !== null ? (
        <FullscreenGalleryModal
          images={activeImages}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onClose={() => setSelectedIndex(null)}
        />
      ) : null}
    </div>
  );
}

export function HotelGuideContent({
  tagCode,
  sections,
  wifiName,
  wifiPassword,
  checkInTime,
  checkOutTime,
}: {
  tagCode: string;
  sections: GuideSection[];
  wifiName: string;
  wifiPassword: string;
  checkInTime: string;
  checkOutTime: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.trim();

  const staticInfoCards = useMemo<StaticInfoCard[]>(
    () => [
      {
        id: 'wifi',
        title: 'Wi-Fi',
        body: `Network: ${wifiName}\nPassword: ${wifiPassword}`,
        iconKey: 'Wifi',
      },
      {
        id: 'check-in-check-out',
        title: 'Check-in / Check-out',
        body: `Check-in: ${checkInTime}\nCheck-out: ${checkOutTime}`,
        iconKey: 'BedDouble',
      },
    ],
    [checkInTime, checkOutTime, wifiName, wifiPassword]
  );

  const filteredSections = useMemo(() => {
    if (!query) {
      return sections;
    }

    return sections
      .map((section) => {
        const isSectionMatch = sectionMatches(section, query);

        const matchingItems = isSectionMatch
          ? section.items
          : section.items.filter((item) => itemMatches(item, query));

        if (!isSectionMatch && matchingItems.length === 0) {
          return null;
        }

        return {
          ...section,
          items: matchingItems,
        };
      })
      .filter(Boolean) as GuideSection[];
  }, [query, sections]);

  const filteredStaticInfoCards = useMemo(() => {
    if (!query) {
      return staticInfoCards;
    }

    return staticInfoCards.filter((card) => staticCardMatches(card, query));
  }, [query, staticInfoCards]);

  const hasResults =
    filteredSections.length > 0 || filteredStaticInfoCards.length > 0;

  return (
    <div className="-mx-5 -mt-4 min-h-screen bg-[radial-gradient(circle_at_top,_rgba(184,137,56,0.20),_transparent_35%),linear-gradient(180deg,#050505,#0b0b0b_45%,#050505)] px-5 pb-32 pt-5 text-white">
      <div className="mb-5 rounded-2xl border border-gold/20 bg-white/8 px-4 py-3 shadow-sm backdrop-blur">
        <label className="mb-2 block text-xs font-black uppercase tracking-wide text-gold">
          Search Hotel Guide
        </label>

        <div className="flex items-center gap-3">
          <Search className="size-5 shrink-0 text-gold" />

          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search Wi-Fi, pool, dining, policies..."
            className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/35"
          />

          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/60 hover:bg-white/15"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {query ? (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-white/50">
          Showing results for:{' '}
          <span className="text-gold">“{query}”</span>
        </div>
      ) : null}

      {hasResults ? (
        <>
          {filteredSections.length ? (
            <div className="space-y-3">
              {filteredSections.map((section) => {
                const Icon = iconMap[section.iconKey] ?? Info;

                return (
                  <Link
                    key={section.id}
                    href={`#section-${section.id}`}
                    className="grid grid-cols-[76px_1fr_24px] items-center gap-4 rounded-[1.5rem] border border-white/10 bg-white/8 p-3 shadow-sm backdrop-blur transition hover:border-gold/50 hover:bg-gold/10"
                  >
                    <div
                      className="relative size-[76px] overflow-hidden rounded-2xl bg-neutral-900 bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${
                          section.imageUrl || fallbackImage
                        })`,
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-black/10 to-black/60" />
                      <div className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-black/50 text-gold backdrop-blur">
                        <Icon className="size-4" />
                      </div>
                    </div>

                    <span>
                      <span className="block font-black text-white">
                        {section.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-white/50">
                        {section.subtitle ||
                          section.description ||
                          'Tap to view information'}
                      </span>
                    </span>

                    <ChevronRight className="size-5 text-gold/80" />
                  </Link>
                );
              })}
            </div>
          ) : null}

          {filteredStaticInfoCards.length ? (
            <div id="hotel-info" className="mt-5 space-y-3">
              {filteredStaticInfoCards.map((card) => (
                <InfoCard
                  key={card.id}
                  icon={iconMap[card.iconKey] ?? Info}
                  title={card.title}
                  body={card.body}
                />
              ))}
            </div>
          ) : null}

          <div className="mt-5 space-y-4 pb-10">
            {filteredSections.map((section) => {
              const SectionIcon = iconMap[section.iconKey] ?? Info;

              return (
                <section
                  key={section.id}
                  id={`section-${section.id}`}
                  className="scroll-mt-5"
                >
                  <div className="rounded-[2rem] border border-white/10 bg-white/8 p-5 shadow-2xl backdrop-blur">
                    <h2 className="flex items-center gap-2 text-lg font-black text-white">
                      <span className="grid size-9 place-items-center rounded-2xl bg-gold/15 text-gold">
                        <SectionIcon className="size-5" />
                      </span>
                      {section.title}
                    </h2>

                    {section.description ? (
                      <p className="mt-3 text-sm leading-6 text-white/50">
                        {section.description}
                      </p>
                    ) : null}

                    <BrochureGallery images={section.galleryImages} />

                    <div className="mt-4 space-y-3">
                      {section.items.map((item) => {
                        const ItemIcon = iconMap[item.iconKey] ?? Info;
                        const href = resolveHref(tagCode, item.buttonHref);

                        return (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-white/10 bg-black/35 p-4"
                          >
                            <h3 className="flex items-center gap-2 font-black text-white">
                              <ItemIcon className="size-4 text-gold" />
                              {item.title}
                            </h3>

                            {item.subtitle ? (
                              <p className="mt-1 text-xs font-bold text-white/40">
                                {item.subtitle}
                              </p>
                            ) : null}

                            {item.content ? (
                              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-white/55">
                                {item.content}
                              </p>
                            ) : null}

                            <div className="mt-3 space-y-1 text-xs font-bold text-white/45">
                              {item.hours ? (
                                <p>
                                  <span className="text-gold">Hours:</span>{' '}
                                  {item.hours}
                                </p>
                              ) : null}

                              {item.location ? (
                                <p>
                                  <span className="text-gold">Location:</span>{' '}
                                  {item.location}
                                </p>
                              ) : null}

                              {item.contact ? (
                                <p>
                                  <span className="text-gold">Contact:</span>{' '}
                                  {item.contact}
                                </p>
                              ) : null}
                            </div>

                            <BrochureGallery images={item.galleryImages} />

                            <div className="mt-4 flex flex-wrap gap-2">
                              {item.buttonLabel && item.buttonHref ? (
                                <Link
                                  href={href}
                                  className="rounded-full bg-gold px-4 py-2 text-xs font-black text-black"
                                >
                                  {item.buttonLabel}
                                </Link>
                              ) : null}

                              {item.mapUrl ? (
                                <Link
                                  href={item.mapUrl}
                                  className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-black text-white"
                                >
                                  Open Map
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}

                      {!section.items.length ? (
                        <p className="rounded-2xl bg-white/5 p-4 text-sm font-bold text-white/40">
                          No guide items available in this section.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <div className="rounded-[2rem] border border-white/10 bg-white/8 p-8 text-center shadow-sm backdrop-blur">
          <Search className="mx-auto size-9 text-gold" />
          <h3 className="mt-4 font-black text-white">No results found</h3>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Try searching for Wi-Fi, dining, pool, check-in, policies,
            transportation, or front desk.
          </p>

          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="mt-5 rounded-2xl bg-gold px-5 py-3 text-sm font-black text-black"
          >
            Clear Search
          </button>
        </div>
      )}
    </div>
  );
}

function InfoCard({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/8 p-5 shadow-sm backdrop-blur">
      <h3 className="flex items-center gap-2 font-black text-white">
        <span className="grid size-9 place-items-center rounded-2xl bg-gold/15 text-gold">
          <Icon className="size-5" />
        </span>
        {title}
      </h3>

      <p className="mt-4 whitespace-pre-line text-sm leading-6 text-white/55">
        {body}
      </p>
    </div>
  );
}