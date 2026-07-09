"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BedDouble,
  Check,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  Eye,
  EyeOff,
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
} from "lucide-react";

const fallbackImage =
  "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1600&q=85";

const iconMap: Record<string, LucideIcon> = {
  Info,
  Wifi,
  BedDouble,
  Hotel,
  MapPin,
  Utensils,
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
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getSectionHref(tagCode: string, section: GuideSection) {
  return `/t/${tagCode}/guide/${createGuideSlug(section.title)}`;
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

function sectionMatches(section: GuideSection, query: string) {
  const searchableText = [
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
      ].join(" "),
    ),
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(query.toLowerCase());
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <span className="h-px w-8 bg-[#d5ad55]" />
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#d5ad55]">
          {eyebrow}
        </p>
      </div>

      <h2 className="mt-2 font-serif text-[1.85rem] font-light leading-tight tracking-[0.01em] text-[#f7f2e8]">
        {title}
      </h2>

      {description ? (
        <p className="mt-2 max-w-md text-sm leading-6 text-white/48">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function ServiceAction({
  href,
  icon: Icon,
  label,
  detail,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[92px] items-center gap-3 rounded-[1.35rem] border border-white/[0.08] bg-white/[0.045] p-3.5 transition duration-300 hover:border-[#d5ad55]/45 hover:bg-[#d5ad55]/[0.08] active:scale-[0.985]"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[#d5ad55]/20 bg-[#d5ad55]/10 text-[#e5bd63] transition group-hover:bg-[#d5ad55] group-hover:text-black">
        <Icon className="size-[18px]" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-serif text-[15px] tracking-wide text-[#f7f2e8]">
          {label}
        </span>
        <span className="mt-1 block truncate text-[10px] font-medium uppercase tracking-[0.12em] text-white/36">
          {detail}
        </span>
      </span>

      <ChevronRight className="size-4 shrink-0 text-[#d5ad55]/70 transition group-hover:translate-x-0.5" />
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
      className="group relative block min-h-[330px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#171611] shadow-[0_28px_80px_rgba(0,0,0,0.42)] active:scale-[0.99]"
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition duration-1000 ease-out group-hover:scale-[1.04]"
        style={{ backgroundImage: `url(${getSectionImage(section)})` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.28)_40%,rgba(5,5,4,0.96)_100%)]" />
      <div className="absolute inset-0 ring-1 ring-inset ring-white/[0.06]" />

      <div className="relative z-10 flex min-h-[330px] flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#d5ad55]/45 bg-black/35 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-[#e8c66f] backdrop-blur-xl">
            <Icon className="size-3.5" />
            Curated guide
          </span>

          <span className="grid size-11 place-items-center rounded-full bg-[#d5ad55] text-black shadow-[0_12px_30px_rgba(213,173,85,0.3)] transition group-hover:rotate-[-6deg] group-hover:scale-105">
            <ArrowRight className="size-[18px]" />
          </span>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d5ad55]">
            Recommended first
          </p>
          <h3 className="mt-2 font-serif text-[2rem] font-light leading-none tracking-wide text-white">
            {section.title}
          </h3>
          <p className="mt-3 line-clamp-2 max-w-sm text-sm leading-6 text-white/65">
            {section.subtitle ||
              section.description ||
              "Discover useful details thoughtfully prepared for your stay."}
          </p>

          <div className="mt-5 flex items-center gap-5 border-t border-white/10 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
            <span>{section.items.length} details</span>
            <span>{section.galleryImages.length} photos</span>
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
      className="group grid min-h-[132px] grid-cols-[116px_minmax(0,1fr)] overflow-hidden rounded-[1.45rem] border border-white/[0.08] bg-[#151512] shadow-[0_16px_45px_rgba(0,0,0,0.22)] transition duration-300 hover:border-[#d5ad55]/35 hover:bg-[#1a1914] active:scale-[0.99]"
    >
      <div
        className="relative bg-cover bg-center"
        style={{ backgroundImage: `url(${getSectionImage(section)})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/5 to-[#151512]/45" />
        <span className="absolute left-3 top-3 grid size-9 place-items-center rounded-xl border border-white/10 bg-black/50 text-[#d5ad55] backdrop-blur">
          <Icon className="size-4" />
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#d5ad55]/80">
            {section.items.length} guide item
            {section.items.length === 1 ? "" : "s"}
          </p>
          <h3 className="mt-1.5 truncate font-serif text-[18px] font-normal tracking-wide text-[#f6f0e4]">
            {section.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/42">
            {section.subtitle ||
              section.description ||
              "Open this guide for helpful hotel details."}
          </p>
        </div>

        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-[#d5ad55] transition group-hover:border-[#d5ad55]/40 group-hover:bg-[#d5ad55] group-hover:text-black">
          <ChevronRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}

function SearchResultInfoCard({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-[1.45rem] border border-white/[0.08] bg-white/[0.045] p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d5ad55]/12 text-[#d5ad55]">
          <Icon className="size-[18px]" />
        </span>
        <div>
          <h3 className="font-serif text-[17px] text-[#f7f2e8]">{title}</h3>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-white/55">
            {body}
          </p>
        </div>
      </div>
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
  const [searchQuery, setSearchQuery] = useState("");
  const [showWifiPassword, setShowWifiPassword] = useState(false);
  const [copiedWifi, setCopiedWifi] = useState(false);

  const query = searchQuery.trim();

  const staticInfoCards = useMemo<StaticInfoCard[]>(
    () => [
      {
        id: "wifi",
        title: "Wi-Fi Access",
        body: `Network: ${wifiName || "Ask the front desk"}\nPassword: ${
          wifiPassword || "Ask the front desk"
        }`,
        iconKey: "Wifi",
      },
      {
        id: "arrival",
        title: "Arrival & Departure",
        body: `Check-in: ${checkInTime || "Ask the front desk"}\nCheck-out: ${
          checkOutTime || "Ask the front desk"
        }`,
        iconKey: "BedDouble",
      },
    ],
    [checkInTime, checkOutTime, wifiName, wifiPassword],
  );

  const filteredSections = useMemo(() => {
    if (!query) return sections;
    return sections.filter((section) => sectionMatches(section, query));
  }, [query, sections]);

  const filteredStaticCards = useMemo(() => {
    if (!query) return staticInfoCards;

    const lowerQuery = query.toLowerCase();
    return staticInfoCards.filter((card) =>
      `${card.title} ${card.body}`.toLowerCase().includes(lowerQuery),
    );
  }, [query, staticInfoCards]);

  const featuredSection = sections[0];
  const otherSections = sections.slice(1);
  const heroImage = featuredSection
    ? getSectionImage(featuredSection)
    : fallbackImage;

  async function copyWifiPassword() {
    if (!wifiPassword) return;

    try {
      await navigator.clipboard.writeText(wifiPassword);
      setCopiedWifi(true);
      window.setTimeout(() => setCopiedWifi(false), 1800);
    } catch {
      setShowWifiPassword(true);
    }
  }

  return (
    <div className="relative -mx-5 -mt-4 min-h-screen overflow-hidden bg-[#080806] px-5 pb-32 pt-5 text-white">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#9f7425]/10 blur-[110px]" />

      <div className="relative mx-auto max-w-xl">
        <section className="relative mb-7 min-h-[400px] overflow-hidden rounded-[2.15rem] border border-white/10 bg-[#11110e] shadow-[0_34px_90px_rgba(0,0,0,0.48)]">
          <div
            className="absolute inset-0 scale-[1.02] bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.35)_38%,rgba(5,5,4,0.98)_100%)]" />
          <div className="absolute inset-0 ring-1 ring-inset ring-white/[0.06]" />

          <div className="relative z-10 flex min-h-[400px] flex-col justify-between p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#d5ad55]/45 bg-black/35 px-3.5 py-2 text-[9px] font-bold uppercase tracking-[0.24em] text-[#e8c66f] backdrop-blur-xl">
                <Sparkles className="size-3.5" />
                Private concierge
              </span>

              <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/45">
                CloudView
              </span>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#d5ad55]">
                Welcome to your stay
              </p>
              <h1 className="mt-3 max-w-sm font-serif text-[2.75rem] font-light leading-[0.98] tracking-[-0.02em] text-[#fbf7ee]">
                Everything,
                <br /> thoughtfully within reach.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-white/62">
                Discover hotel essentials, dining, amenities and personalised
                assistance in one refined guide.
              </p>

              <div className="mt-5 flex h-14 items-center gap-3 rounded-[1.15rem] border border-white/10 bg-black/45 px-4 backdrop-blur-xl transition focus-within:border-[#d5ad55]/55 focus-within:bg-black/60">
                <Search className="size-[18px] shrink-0 text-[#d5ad55]" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search dining, Wi-Fi, pool, checkout…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white/60"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {query ? (
          <section>
            <SectionHeading
              eyebrow="Search"
              title={`Results for “${query}”`}
              description={`${filteredSections.length + filteredStaticCards.length} matching result${
                filteredSections.length + filteredStaticCards.length === 1
                  ? ""
                  : "s"
              }`}
            />

            {filteredSections.length || filteredStaticCards.length ? (
              <div className="space-y-3">
                {filteredSections.map((section) => (
                  <GuideSectionCard
                    key={section.id}
                    tagCode={tagCode}
                    section={section}
                  />
                ))}

                {filteredStaticCards.map((card) => (
                  <SearchResultInfoCard
                    key={card.id}
                    icon={iconMap[card.iconKey] ?? Info}
                    title={card.title}
                    body={card.body}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[1.8rem] border border-white/[0.08] bg-white/[0.045] p-8 text-center">
                <Search className="mx-auto size-8 text-[#d5ad55]" />
                <h3 className="mt-4 font-serif text-xl text-[#f7f2e8]">
                  Nothing found
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  Try Wi-Fi, dining, pool, policies, transport or front desk.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-5 rounded-full border border-[#d5ad55]/40 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-[#e5bd63]"
                >
                  Clear search
                </button>
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="mb-8">
              <SectionHeading
                eyebrow="At your service"
                title="How may we assist?"
              />

              <div className="grid gap-2.5">
                <ServiceAction
                  href={`/t/${tagCode}/menu`}
                  icon={Utensils}
                  label="In-room dining"
                  detail="Browse menu & order"
                />
                <ServiceAction
                  href={`/t/${tagCode}/service`}
                  icon={Hotel}
                  label="Guest services"
                  detail="Request amenities & assistance"
                />
                <ServiceAction
                  href={`/t/${tagCode}/contact`}
                  icon={Phone}
                  label="Contact our team"
                  detail="Speak with hotel staff"
                />
              </div>
            </section>

            <section className="mb-8">
              <SectionHeading
                eyebrow="Stay essentials"
                title="The details that matter"
              />

              <div className="overflow-hidden rounded-[1.8rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] shadow-[0_22px_60px_rgba(0,0,0,0.26)]">
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[#d5ad55]/20 bg-[#d5ad55]/10 text-[#d5ad55]">
                      <Wifi className="size-5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#d5ad55]">
                        Complimentary Wi-Fi
                      </p>
                      <p className="mt-2 truncate font-serif text-lg text-[#f7f2e8]">
                        {wifiName || "Please ask the front desk"}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-xs text-white/42">
                          Password:{" "}
                          <span className="text-white/65">
                            {wifiPassword
                              ? showWifiPassword
                                ? wifiPassword
                                : "••••••••"
                              : "Ask the front desk"}
                          </span>
                        </p>

                        {wifiPassword ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setShowWifiPassword((current) => !current)
                              }
                              className="grid size-8 place-items-center rounded-full border border-white/10 text-white/45 transition hover:text-white"
                              aria-label={
                                showWifiPassword
                                  ? "Hide Wi-Fi password"
                                  : "Show Wi-Fi password"
                              }
                            >
                              {showWifiPassword ? (
                                <EyeOff className="size-3.5" />
                              ) : (
                                <Eye className="size-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={copyWifiPassword}
                              className="grid size-8 place-items-center rounded-full border border-white/10 text-white/45 transition hover:text-white"
                              aria-label="Copy Wi-Fi password"
                            >
                              {copiedWifi ? (
                                <Check className="size-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 border-t border-white/[0.07]">
                  <div className="border-r border-white/[0.07] p-5">
                    <Clock className="size-4 text-[#d5ad55]" />
                    <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">
                      Check-in
                    </p>
                    <p className="mt-1.5 font-serif text-lg text-[#f7f2e8]">
                      {checkInTime || "Ask front desk"}
                    </p>
                  </div>
                  <div className="p-5">
                    <BedDouble className="size-4 text-[#d5ad55]" />
                    <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">
                      Check-out
                    </p>
                    <p className="mt-1.5 font-serif text-lg text-[#f7f2e8]">
                      {checkOutTime || "Ask front desk"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <SectionHeading
                eyebrow="Curated for your stay"
                title="Explore the hotel"
                description="Every detail, destination and service—beautifully organised for you."
              />

              {featuredSection ? (
                <FeaturedGuideCard
                  tagCode={tagCode}
                  section={featuredSection}
                />
              ) : null}

              {otherSections.length ? (
                <div className="mt-3 space-y-3">
                  {otherSections.map((section) => (
                    <GuideSectionCard
                      key={section.id}
                      tagCode={tagCode}
                      section={section}
                    />
                  ))}
                </div>
              ) : !featuredSection ? (
                <div className="rounded-[1.8rem] border border-dashed border-white/10 bg-white/[0.035] p-8 text-center">
                  <Info className="mx-auto size-8 text-[#d5ad55]" />
                  <h3 className="mt-4 font-serif text-xl text-[#f7f2e8]">
                    Your guide is being prepared
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/45">
                    Hotel information will appear here once available.
                  </p>
                </div>
              ) : null}
            </section>
          </>
        )}

        <section className="mt-9 overflow-hidden rounded-[1.9rem] border border-[#d5ad55]/25 bg-[linear-gradient(145deg,#d9b45f,#b9882e)] p-5 text-[#17130b] shadow-[0_28px_70px_rgba(163,115,31,0.25)]">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-black/10 bg-black/[0.08]">
              <HelpCircle className="size-5" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-black/50">
                Personal assistance
              </p>
              <h2 className="mt-1.5 font-serif text-2xl font-normal leading-tight">
                Allow us to take care of the rest.
              </h2>
              <p className="mt-2 text-sm leading-6 text-black/65">
                Our team is ready to assist with requests, dining, directions
                and anything that makes your stay more comfortable.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <Link
                  href={`/t/${tagCode}/service`}
                  className="rounded-[1.1rem] bg-[#0d0d0b] px-3 py-3.5 text-center text-xs font-bold text-white transition active:scale-[0.98]"
                >
                  Request service
                </Link>
                <Link
                  href={`/t/${tagCode}/contact`}
                  className="rounded-[1.1rem] border border-black/15 bg-white/35 px-3 py-3.5 text-center text-xs font-bold text-black transition active:scale-[0.98]"
                >
                  Contact staff
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
