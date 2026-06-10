'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  BedDouble,
  Car,
  ChevronRight,
  Clock,
  HelpCircle,
  Hotel,
  Info,
  MapPin,
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

function createGuideSlug(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getSectionHref(tagCode: string, section: GuideSection) {
  return `/t/${tagCode}/guide/${createGuideSlug(section.title)}`;
}

function includesSearch(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

function sectionMatches(section: GuideSection, query: string) {
  const searchableSectionText = [
    section.title,
    section.subtitle,
    section.description,
    section.iconKey,
    ...section.galleryImages.map((image) => `${image.title} ${image.caption}`),
    ...section.items.map((item) =>
      [
        item.title,
        item.subtitle,
        item.content,
        item.hours,
        item.location,
        item.contact,
      ].join(' ')
    ),
  ].join(' ');

  return includesSearch(searchableSectionText, query);
}

function staticCardMatches(card: StaticInfoCard, query: string) {
  return includesSearch(`${card.title} ${card.body}`, query);
}

function getSectionImage(section: GuideSection) {
  return (
    section.imageUrl ||
    section.galleryImages.find((image) => image.isActive)?.imageUrl ||
    fallbackImage
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
    <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 shadow-sm backdrop-blur">
      <h3 className="flex items-center gap-2 font-black text-white">
        <span className="grid size-9 place-items-center rounded-2xl bg-gold/15 text-gold">
          <Icon className="size-5" />
        </span>
        {title}
      </h3>

      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-white/55">
        {body}
      </p>
    </div>
  );
}

function QuickEssentialsCard({
  icon: Icon,
  title,
  value,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-black/35 p-4">
      <span className="grid size-10 place-items-center rounded-2xl bg-gold/15 text-gold">
        <Icon className="size-5" />
      </span>

      <p className="mt-3 text-xs font-black uppercase tracking-wide text-gold">
        {title}
      </p>

      <p className="mt-1 line-clamp-2 text-sm font-black text-white">
        {value}
      </p>
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

    return sections.filter((section) => sectionMatches(section, query));
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
      <div className="sticky top-0 z-20 -mx-5 mb-5 bg-black/85 px-5 pb-4 pt-2 backdrop-blur-xl">
        <div className="rounded-2xl border border-gold/20 bg-white/8 px-4 py-3 shadow-sm backdrop-blur">
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
      </div>

      {!query ? (
        <>
          <section className="mb-6">
            <p className="text-xs font-black uppercase tracking-[0.26em] text-gold">
              Stay Essentials
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              Important details first
            </h2>

            <p className="mt-1 text-sm leading-6 text-white/50">
              Fast access to the information guests usually need immediately.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <QuickEssentialsCard
                icon={Wifi}
                title="Wi-Fi"
                value={wifiName}
              />

              <QuickEssentialsCard
                icon={BedDouble}
                title="Check-in"
                value={checkInTime}
              />

              <QuickEssentialsCard
                icon={Clock}
                title="Check-out"
                value={checkOutTime}
              />

              <Link
                href={`/t/${tagCode}/contact`}
                className="rounded-[1.35rem] border border-gold/30 bg-gold/15 p-4"
              >
                <span className="grid size-10 place-items-center rounded-2xl bg-gold/20 text-gold">
                  <Phone className="size-5" />
                </span>

                <p className="mt-3 text-xs font-black uppercase tracking-wide text-gold">
                  Need Help?
                </p>

                <p className="mt-1 text-sm font-black text-white">
                  Contact Staff
                </p>
              </Link>
            </div>
          </section>

          <section className="mb-6">
            <p className="text-xs font-black uppercase tracking-[0.26em] text-gold">
              Explore
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              Choose a guide section
            </h2>

            <p className="mt-1 text-sm leading-6 text-white/50">
              Tap a category to open a clean detail page. No more endless scroll.
              You’re welcome. 😌
            </p>
          </section>
        </>
      ) : (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-white/50">
          Showing results for:{' '}
          <span className="text-gold">“{query}”</span>
        </div>
      )}

      {hasResults ? (
        <>
          {filteredSections.length ? (
            <div className="grid gap-4">
              {filteredSections.map((section) => {
                const Icon = iconMap[section.iconKey] ?? Info;

                return (
                  <Link
                    key={section.id}
                    href={getSectionHref(tagCode, section)}
                    className="group overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/8 shadow-sm backdrop-blur transition hover:border-gold/60 hover:bg-gold/10"
                  >
                    <div
                      className="relative h-40 bg-neutral-900 bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${getSectionImage(section)})`,
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/35 to-black/90" />

                      <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-black/45 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-gold backdrop-blur">
                        <Icon className="size-3.5" />
                        {section.title}
                      </span>

                      <div className="absolute bottom-4 left-4 right-4">
                        <h3 className="text-2xl font-black text-white">
                          {section.title}
                        </h3>

                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-white/65">
                          {section.subtitle ||
                            section.description ||
                            'Tap to view hotel guide details'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 p-4">
                      <div className="text-xs font-bold text-white/45">
                        {section.items.length} item
                        {section.items.length === 1 ? '' : 's'} available
                      </div>

                      <span className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-xs font-black text-black">
                        Open
                        <ChevronRight className="size-4" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : null}

          {filteredStaticInfoCards.length ? (
            <div className="mt-5 space-y-3">
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