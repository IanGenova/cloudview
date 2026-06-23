'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BedDouble,
  Car,
  ChevronRight,
  Clock,
  Compass,
  HelpCircle,
  Hotel,
  Info,
  MapPin,
  Phone,
  Search,
  Shield,
  Sparkles,
  Star,
  Utensils,
  Waves,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react';

const fallbackImage =
  'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1200&q=80';

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
  Compass,
  Star,
  Sparkles,
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

function getSectionIcon(section: GuideSection) {
  return iconMap[section.iconKey] ?? Info;
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
    <div className="rounded-[1.5rem] border border-white/10 bg-white/10 p-4 shadow-sm backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold text-black">
          <Icon className="size-5" />
        </span>

        <div className="min-w-0">
          <h3 className="font-black text-white">{title}</h3>
          <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-white/60">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({
  icon: Icon,
  title,
  value,
  href,
  gold = false,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  href?: string;
  gold?: boolean;
}) {
  const content = (
    <div
      className={
        gold
          ? 'h-full rounded-[1.5rem] border border-gold/40 bg-gold p-4 text-black shadow-[0_18px_38px_rgba(214,167,56,0.24)]'
          : 'h-full rounded-[1.5rem] border border-white/10 bg-white/10 p-4 text-white shadow-sm backdrop-blur'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={
            gold
              ? 'grid size-11 shrink-0 place-items-center rounded-2xl bg-black/10 text-black'
              : 'grid size-11 shrink-0 place-items-center rounded-2xl bg-gold/20 text-gold'
          }
        >
          <Icon className="size-5" />
        </span>

        {href ? (
          <ArrowRight
            className={gold ? 'size-4 text-black/60' : 'size-4 text-white/35'}
          />
        ) : null}
      </div>

      <p
        className={
          gold
            ? 'mt-4 text-[11px] font-black uppercase tracking-[0.16em] text-black/55'
            : 'mt-4 text-[11px] font-black uppercase tracking-[0.16em] text-gold'
        }
      >
        {title}
      </p>

      <p
        className={
          gold
            ? 'mt-1 line-clamp-2 text-sm font-black text-black'
            : 'mt-1 line-clamp-2 text-sm font-black text-white'
        }
      >
        {value}
      </p>
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="block h-full active:scale-[0.99]">
      {content}
    </Link>
  );
}

function FeaturedGuideCard({
  tagCode,
  section,
}: {
  tagCode: string;
  section: GuideSection;
}) {
  const Icon = getSectionIcon(section);

  return (
    <Link
      href={getSectionHref(tagCode, section)}
      className="group relative block min-h-[250px] overflow-hidden rounded-[2rem] border border-white/10 bg-neutral-900 shadow-2xl active:scale-[0.99]"
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-105"
        style={{
          backgroundImage: `url(${getSectionImage(section)})`,
        }}
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/45 to-black/95" />

      <div className="relative z-10 flex min-h-[250px] flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-black/45 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-gold backdrop-blur">
            <Icon className="size-3.5" />
            Featured
          </span>

          <span className="grid size-10 place-items-center rounded-full bg-gold text-black shadow-lg">
            <ChevronRight className="size-5" />
          </span>
        </div>

        <div>
          <h3 className="text-3xl font-black leading-tight text-white">
            {section.title}
          </h3>

          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-white/65">
            {section.subtitle ||
              section.description ||
              'Discover useful details for your stay.'}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white backdrop-blur">
              {section.items.length} guide item
              {section.items.length === 1 ? '' : 's'}
            </span>

            {section.galleryImages.length > 0 ? (
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white backdrop-blur">
                {section.galleryImages.length} photo
                {section.galleryImages.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

function GuideSectionCard({
  tagCode,
  section,
}: {
  tagCode: string;
  section: GuideSection;
}) {
  const Icon = getSectionIcon(section);

  return (
    <Link
      href={getSectionHref(tagCode, section)}
      className="group overflow-hidden rounded-[1.65rem] border border-white/10 bg-white/10 shadow-sm backdrop-blur transition hover:border-gold/60 hover:bg-gold/10 active:scale-[0.99]"
    >
      <div
        className="relative h-36 bg-neutral-900 bg-cover bg-center"
        style={{
          backgroundImage: `url(${getSectionImage(section)})`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/85" />

        <span className="absolute left-3 top-3 grid size-10 place-items-center rounded-2xl bg-black/45 text-gold backdrop-blur">
          <Icon className="size-5" />
        </span>

        <span className="absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[10px] font-black text-white/80 backdrop-blur">
          {section.items.length} item{section.items.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black text-white">
              {section.title}
            </h3>

            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-white/50">
              {section.subtitle ||
                section.description ||
                'Tap to view hotel guide details.'}
            </p>
          </div>

          <ChevronRight className="mt-1 size-5 shrink-0 text-gold transition group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
}

function PopularShortcut({
  href,
  icon: Icon,
  title,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur transition hover:border-gold/50 hover:bg-gold/10 active:scale-[0.98]"
    >
      <Icon className="size-4 text-gold" />
      {title}
    </Link>
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
        title: 'Wi-Fi Access',
        body: `Network: ${wifiName || 'Ask the front desk'}\nPassword: ${
          wifiPassword || 'Ask the front desk'
        }`,
        iconKey: 'Wifi',
      },
      {
        id: 'check-in-check-out',
        title: 'Check-in / Check-out',
        body: `Check-in: ${checkInTime || 'Ask the front desk'}\nCheck-out: ${
          checkOutTime || 'Ask the front desk'
        }`,
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

  const featuredSections = sections.slice(0, 2);
  const remainingSections = sections.slice(2);

  const hasResults =
    filteredSections.length > 0 || filteredStaticInfoCards.length > 0;

  return (
    <div className="-mx-5 -mt-4 min-h-screen bg-[radial-gradient(circle_at_top,_rgba(214,167,56,0.28),_transparent_34%),linear-gradient(180deg,#050505,#0b0b0b_45%,#050505)] px-5 pb-32 pt-5 text-white">
      <section className="relative mb-5 overflow-hidden rounded-[2.25rem] border border-white/10 bg-neutral-950 shadow-2xl">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-45"
          style={{
            backgroundImage: `url(${
              sections[0] ? getSectionImage(sections[0]) : fallbackImage
            })`,
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/65 to-black" />

        <div className="relative z-10 p-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-black/40 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-gold backdrop-blur">
            <Sparkles className="size-4" />
            Digital Concierge
          </div>

          <h1 className="mt-5 text-4xl font-black leading-[0.95] tracking-tight text-white">
            Your stay, made simple.
          </h1>

          <p className="mt-4 max-w-md text-sm font-semibold leading-7 text-white/65">
            Explore hotel essentials, amenities, dining, services, and local
            tips in one beautiful guide.
          </p>

          <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/45 p-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <Search className="size-5 shrink-0 text-gold" />

              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search Wi-Fi, pool, dining, checkout..."
                className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/35"
              />

              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/15"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {!query ? (
        <>
          <section className="mb-6">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-gold">
                  Quick Essentials
                </p>

                <h2 className="mt-2 text-2xl font-black text-white">
                  Need-to-know details
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <QuickActionCard
                icon={Wifi}
                title="Wi-Fi"
                value={wifiName || 'Ask front desk'}
              />

              <QuickActionCard
                icon={BedDouble}
                title="Check-in"
                value={checkInTime || 'Ask front desk'}
              />

              <QuickActionCard
                icon={Clock}
                title="Check-out"
                value={checkOutTime || 'Ask front desk'}
              />

              <QuickActionCard
                icon={Phone}
                title="Need Help?"
                value="Contact Staff"
                href={`/t/${tagCode}/contact`}
                gold
              />
            </div>
          </section>

          <section className="mb-6">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-gold">
              Popular Shortcuts
            </p>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <PopularShortcut
                href={`/t/${tagCode}/menu`}
                icon={Utensils}
                title="Order Food"
              />

              <PopularShortcut
                href={`/t/${tagCode}/service`}
                icon={Hotel}
                title="Request Service"
              />

              <PopularShortcut
                href={`/t/${tagCode}/contact`}
                icon={Phone}
                title="Contact Staff"
              />

              {sections.slice(0, 3).map((section) => (
                <PopularShortcut
                  key={section.id}
                  href={getSectionHref(tagCode, section)}
                  icon={getSectionIcon(section)}
                  title={section.title}
                />
              ))}
            </div>
          </section>

          {featuredSections.length > 0 ? (
            <section className="mb-7">
              <div className="mb-4">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-gold">
                  Featured Guides
                </p>

                <h2 className="mt-2 text-2xl font-black text-white">
                  Start here
                </h2>

                <p className="mt-1 text-sm font-semibold leading-6 text-white/50">
                  The most useful guide sections for guests during their stay.
                </p>
              </div>

              <div className="grid gap-4">
                {featuredSections.map((section) => (
                  <FeaturedGuideCard
                    key={section.id}
                    tagCode={tagCode}
                    section={section}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="mb-5">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-gold">
                Explore More
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Hotel guide categories
              </h2>
            </div>

            {remainingSections.length > 0 ? (
              <div className="grid gap-4">
                {remainingSections.map((section) => (
                  <GuideSectionCard
                    key={section.id}
                    tagCode={tagCode}
                    section={section}
                  />
                ))}
              </div>
            ) : featuredSections.length === 0 ? (
              <div className="rounded-[2rem] border border-white/10 bg-white/10 p-8 text-center backdrop-blur">
                <Info className="mx-auto size-9 text-gold" />
                <h3 className="mt-4 font-black text-white">
                  No guide sections yet
                </h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-white/50">
                  Hotel guide content will appear here once configured.
                </p>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <>
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-bold text-white/60 backdrop-blur">
            Showing results for:{' '}
            <span className="text-gold">“{query}”</span>
          </div>

          {hasResults ? (
            <>
              {filteredSections.length ? (
                <div className="grid gap-4">
                  {filteredSections.map((section) => (
                    <GuideSectionCard
                      key={section.id}
                      tagCode={tagCode}
                      section={section}
                    />
                  ))}
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
            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-8 text-center shadow-sm backdrop-blur">
              <Search className="mx-auto size-9 text-gold" />

              <h3 className="mt-4 font-black text-white">No results found</h3>

              <p className="mt-2 text-sm font-semibold leading-6 text-white/50">
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
        </>
      )}

      <section className="mt-8 rounded-[2rem] border border-gold/30 bg-gold p-5 text-black shadow-[0_20px_50px_rgba(214,167,56,0.22)]">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black/10">
            <HelpCircle className="size-6" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-xl font-black">Need something else?</p>

            <p className="mt-1 text-sm font-bold leading-6 text-black/65">
              Our staff can help with room requests, food orders, directions,
              and hotel information.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link
                href={`/t/${tagCode}/service`}
                className="rounded-2xl bg-black px-4 py-3 text-center text-sm font-black text-white"
              >
                Request Service
              </Link>

              <Link
                href={`/t/${tagCode}/contact`}
                className="rounded-2xl border border-black/15 bg-white/40 px-4 py-3 text-center text-sm font-black text-black"
              >
                Contact Staff
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}