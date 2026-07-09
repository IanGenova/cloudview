import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BedDouble,
  ChevronRight,
  Clock,
  Compass,
  HelpCircle,
  Hotel,
  ImageIcon,
  Info,
  MapPin,
  Phone,
  Shield,
  Sparkles,
  Star,
  Utensils,
  Waves,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { GuideImageGallery } from "./GuideImageGallery";
import { PanoramaModalButton } from "./PanoramaModalButton";
import { GuestShell } from "@/components/guest/GuestShell";
import { db } from "@/lib/db";
import { requireNfcGuestAccess } from "@/lib/nfc-security";

export const dynamic = "force-dynamic";

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
  Shield,
  HelpCircle,
  Compass,
  Star,
  Sparkles,
};

type GuideImage = {
  id: string;
  title: string | null;
  caption: string | null;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
};

type GuideItemCardProps = {
  id: string;
  title: string;
  subtitle: string | null;
  content: string | null;
  iconKey: string;
  hours: string | null;
  location: string | null;
  contact: string | null;
  mapUrl: string | null;
  buttonLabel: string | null;
  buttonHref: string | null;
  imageUrl: string | null;
  panoramaEnabled: boolean;
  panoramaImageUrl: string | null;
  galleryImages: GuideImage[];
};

function createGuideSlug(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveHref(tagCode: string, href?: string | null) {
  if (!href) return "#";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("/")) return href;
  return `/t/${tagCode}/${href.replace(/^\/+/, "")}`;
}

function getSectionImage(section: {
  imageUrl: string | null;
  galleryImages: GuideImage[];
}) {
  return (
    section.imageUrl ||
    section.galleryImages.find((image) => image.isActive)?.imageUrl ||
    fallbackImage
  );
}

function getItemImage(item: {
  imageUrl: string | null;
  galleryImages: GuideImage[];
}) {
  return (
    item.imageUrl ||
    item.galleryImages.find((image) => image.isActive)?.imageUrl ||
    ""
  );
}

function getIcon(iconKey: string) {
  return iconMap[iconKey] ?? Info;
}

function ActionLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
}) {
  const className = primary
    ? "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#e6c873]/30 bg-[linear-gradient(135deg,#dfba5d,#b78329)] px-5 py-3 text-xs font-bold uppercase tracking-[0.13em] text-[#17130b] shadow-[0_14px_35px_rgba(181,132,40,0.24)] transition hover:brightness-110 active:scale-[0.98]"
    : "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-xs font-bold uppercase tracking-[0.13em] text-white/80 backdrop-blur transition hover:border-[#d5ad55]/40 hover:text-[#d5ad55] active:scale-[0.98]";

  if (href.startsWith("http://") || href.startsWith("https://")) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-7 bg-[#d5ad55]" />
      <p className="text-[9px] font-bold uppercase tracking-[0.27em] text-[#d5ad55]">
        {children}
      </p>
    </div>
  );
}

function AtAGlanceCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.2)]">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#d5ad55]/20 bg-[#d5ad55]/10 text-[#d5ad55]">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-[8px] font-bold uppercase tracking-[0.22em] text-white/35">
            {label}
          </p>
          <p className="mt-1 truncate font-serif text-base text-[#f7f2e8]">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-white/[0.07] py-3.5 last:border-b-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#d5ad55]/10 text-[#d5ad55]">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/32">
          {label}
        </p>
        <p className="mt-1 text-sm leading-5 text-white/72">{value}</p>
      </div>
    </div>
  );
}

function GuideItemCard({
  item,
  tagCode,
  index,
}: {
  item: GuideItemCardProps;
  tagCode: string;
  index: number;
}) {
  const Icon = getIcon(item.iconKey);
  const imageUrl = getItemImage(item);
  const primaryHref = resolveHref(tagCode, item.buttonHref);
  const mapHref = resolveHref(tagCode, item.mapUrl);

  return (
    <article className="overflow-hidden rounded-[1.85rem] border border-white/[0.08] bg-[#141411] shadow-[0_24px_65px_rgba(0,0,0,0.3)]">
      {imageUrl ? (
        <div className="relative h-60 overflow-hidden bg-[#0d0d0b]">
          <img
            src={imageUrl}
            alt={item.title}
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.18)_45%,rgba(10,10,8,0.96))]" />
          <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.22em] text-[#e5bd63] backdrop-blur-xl">
              <Icon className="size-3.5" />
              Detail {String(index + 1).padStart(2, "0")}
            </span>

            {item.panoramaEnabled && item.panoramaImageUrl ? (
              <PanoramaModalButton
                title={item.title}
                subtitle={item.subtitle}
                panoramaImageUrl={item.panoramaImageUrl}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="p-5">
        {!imageUrl ? (
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="grid size-11 place-items-center rounded-2xl border border-[#d5ad55]/20 bg-[#d5ad55]/10 text-[#d5ad55]">
              <Icon className="size-5" />
            </span>

            {item.panoramaEnabled && item.panoramaImageUrl ? (
              <PanoramaModalButton
                title={item.title}
                subtitle={item.subtitle}
                panoramaImageUrl={item.panoramaImageUrl}
              />
            ) : null}
          </div>
        ) : null}

        <Eyebrow>{item.subtitle || `Guide detail ${index + 1}`}</Eyebrow>
        <h3 className="mt-3 font-serif text-[1.75rem] font-light leading-tight tracking-[0.01em] text-[#f8f2e7]">
          {item.title}
        </h3>

        {item.content ? (
          <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/57">
            {item.content}
          </p>
        ) : null}

        {item.hours || item.location || item.contact ? (
          <div className="mt-5 rounded-[1.25rem] border border-white/[0.07] bg-black/20 px-4">
            {item.hours ? (
              <DetailRow icon={Clock} label="Hours" value={item.hours} />
            ) : null}
            {item.location ? (
              <DetailRow icon={MapPin} label="Location" value={item.location} />
            ) : null}
            {item.contact ? (
              <DetailRow icon={Phone} label="Contact" value={item.contact} />
            ) : null}
          </div>
        ) : null}

        {item.buttonLabel && item.buttonHref ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <ActionLink href={primaryHref} primary>
              {item.buttonLabel}
              <ArrowRight className="size-4" />
            </ActionLink>
            {item.mapUrl ? (
              <ActionLink href={mapHref}>
                Open map
                <MapPin className="size-4" />
              </ActionLink>
            ) : null}
          </div>
        ) : item.mapUrl ? (
          <div className="mt-5">
            <ActionLink href={mapHref}>
              Open map
              <MapPin className="size-4" />
            </ActionLink>
          </div>
        ) : null}

        {item.galleryImages.length ? (
          <GuideImageGallery images={item.galleryImages} variant="item" />
        ) : null}
      </div>
    </article>
  );
}

function RelatedGuideCard({
  tagCode,
  section,
}: {
  tagCode: string;
  section: {
    id: string;
    title: string;
    subtitle: string | null;
    imageUrl: string | null;
    iconKey: string;
    items: unknown[];
    galleryImages: GuideImage[];
  };
}) {
  const Icon = getIcon(section.iconKey);

  return (
    <Link
      href={`/t/${tagCode}/guide/${createGuideSlug(section.title)}`}
      className="group grid grid-cols-[82px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-[1.3rem] border border-white/[0.08] bg-white/[0.04] p-2.5 transition hover:border-[#d5ad55]/35 hover:bg-[#d5ad55]/[0.06]"
    >
      <div
        className="relative h-[72px] overflow-hidden rounded-[1rem] bg-cover bg-center"
        style={{ backgroundImage: `url(${getSectionImage(section)})` }}
      >
        <div className="absolute inset-0 bg-black/15" />
        <span className="absolute left-2 top-2 grid size-7 place-items-center rounded-lg bg-black/50 text-[#d5ad55] backdrop-blur">
          <Icon className="size-3.5" />
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate font-serif text-[16px] text-[#f7f2e8]">
          {section.title}
        </p>
        <p className="mt-1 line-clamp-1 text-[11px] text-white/38">
          {section.subtitle || `${section.items.length} guide items`}
        </p>
      </div>

      <span className="grid size-8 place-items-center rounded-full border border-white/10 text-[#d5ad55] transition group-hover:bg-[#d5ad55] group-hover:text-black">
        <ChevronRight className="size-4" />
      </span>
    </Link>
  );
}

export default async function GuideSectionDetailPage({
  params,
}: {
  params: Promise<{
    tagCode: string;
    sectionSlug: string;
  }>;
}) {
  const { tagCode, sectionSlug } = await params;
  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag || tag.status !== "ACTIVE") notFound();

  const sections = await db.hotelGuideSection.findMany({
    where: {
      hotelId: tag.hotelId,
      isActive: true,
    },
    include: {
      galleryImages: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      },
      items: {
        where: { isActive: true },
        include: {
          galleryImages: {
            where: { isActive: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });

  const section = sections.find(
    (currentSection) => createGuideSlug(currentSection.title) === sectionSlug,
  );

  if (!section) notFound();

  const SectionIcon = getIcon(section.iconKey);
  const heroImage = getSectionImage(section);
  const otherSections = sections
    .filter((item) => item.id !== section.id)
    .slice(0, 4);

  return (
    <GuestShell
      hotel={tag.hotel}
      title={section.title}
      subtitle={section.subtitle ?? "Hotel Guide"}
      backHref={`/t/${tagCode}/guide`}
      variant="dark"
    >
      <div className="relative -mx-5 -mt-4 min-h-screen overflow-hidden bg-[#080806] px-5 pb-32 pt-5 text-white">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-[#9f7425]/10 blur-[110px]" />

        <div className="relative mx-auto max-w-xl">
          <section className="relative mb-5 min-h-[440px] overflow-hidden rounded-[2.1rem] border border-white/10 bg-[#11110e] shadow-[0_34px_90px_rgba(0,0,0,0.48)]">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${heroImage})` }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1)_0%,rgba(0,0,0,0.28)_38%,rgba(5,5,4,0.98)_100%)]" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/[0.06]" />

            <div className="relative z-10 flex min-h-[440px] flex-col justify-between p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#d5ad55]/45 bg-black/35 px-3.5 py-2 text-[9px] font-bold uppercase tracking-[0.22em] text-[#e8c66f] backdrop-blur-xl">
                  <SectionIcon className="size-3.5" />
                  Hotel collection
                </span>

                <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/42">
                  CloudView
                </span>
              </div>

              <div>
                <Eyebrow>Curated guest guide</Eyebrow>
                <h1 className="mt-3 max-w-sm font-serif text-[2.7rem] font-light leading-[0.98] tracking-[-0.02em] text-[#fbf7ee]">
                  {section.title}
                </h1>

                {section.subtitle ? (
                  <p className="mt-4 max-w-md text-sm leading-6 text-white/62">
                    {section.subtitle}
                  </p>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  {section.panoramaEnabled && section.panoramaImageUrl ? (
                    <PanoramaModalButton
                      title={section.title}
                      subtitle={section.subtitle}
                      panoramaImageUrl={section.panoramaImageUrl}
                    />
                  ) : null}

                  <span className="rounded-full border border-white/10 bg-black/35 px-3.5 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/58 backdrop-blur">
                    {section.items.length} detail
                    {section.items.length === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/35 px-3.5 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/58 backdrop-blur">
                    {section.galleryImages.length} photo
                    {section.galleryImages.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <div className="mb-6 grid grid-cols-2 gap-2.5">
            <AtAGlanceCard
              icon={Sparkles}
              label="Guide details"
              value={`${section.items.length} available`}
            />
            <AtAGlanceCard
              icon={ImageIcon}
              label="Photo collection"
              value={`${section.galleryImages.length} images`}
            />
          </div>

          {section.description ? (
            <section className="mb-7 rounded-[1.7rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] p-5 shadow-[0_20px_55px_rgba(0,0,0,0.24)]">
              <Eyebrow>About this collection</Eyebrow>
              <p className="mt-4 whitespace-pre-line font-serif text-[1.15rem] font-light leading-8 text-white/72">
                {section.description}
              </p>
            </section>
          ) : null}

          {section.galleryImages.length ? (
            <section className="mb-8">
              <Eyebrow>Visual journey</Eyebrow>
              <div className="mt-2 flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-serif text-[1.9rem] font-light text-[#f7f2e8]">
                    A glimpse inside
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-white/38">
                    Tap any photograph to enter the full-screen gallery.
                  </p>
                </div>
                <ImageIcon className="mb-1 size-5 text-[#d5ad55]" />
              </div>

              <GuideImageGallery
                images={section.galleryImages}
                variant="section"
              />
            </section>
          ) : null}

          {section.items.length ? (
            <section className="mt-8">
              <Eyebrow>Essential details</Eyebrow>
              <h2 className="mt-2 font-serif text-[1.9rem] font-light leading-tight text-[#f7f2e8]">
                Everything you need to know
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-white/42">
                Hours, locations, services and useful information, arranged for
                effortless browsing.
              </p>

              <div className="mt-5 space-y-4">
                {section.items.map((item, index) => (
                  <GuideItemCard
                    key={item.id}
                    item={item}
                    tagCode={tagCode}
                    index={index}
                  />
                ))}
              </div>
            </section>
          ) : (
            <section className="mt-8 rounded-[1.8rem] border border-dashed border-white/10 bg-white/[0.035] p-8 text-center">
              <Info className="mx-auto size-8 text-[#d5ad55]" />
              <h2 className="mt-4 font-serif text-xl text-[#f7f2e8]">
                More details are being prepared
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/42">
                This collection will be updated as new information becomes
                available.
              </p>
            </section>
          )}

          {section.items.length ? (
            <section className="mt-7 overflow-hidden rounded-[1.7rem] border border-[#d5ad55]/25 bg-[linear-gradient(145deg,#d9b45f,#b9882e)] p-5 text-[#17130b] shadow-[0_25px_65px_rgba(163,115,31,0.22)]">
              <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-black/10 bg-black/[0.08]">
                  <Star className="size-5" />
                </span>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-black/48">
                    Guest note
                  </p>
                  <p className="mt-1.5 font-serif text-xl leading-tight">
                    Keep this guide close during your stay.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-black/65">
                    It contains the most useful information for{" "}
                    {section.title.toLowerCase()}.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {otherSections.length ? (
            <section className="mt-9">
              <Eyebrow>Continue exploring</Eyebrow>
              <h2 className="mt-2 font-serif text-[1.75rem] font-light text-[#f7f2e8]">
                More from the hotel
              </h2>

              <div className="mt-4 space-y-2.5">
                {otherSections.map((otherSection) => (
                  <RelatedGuideCard
                    key={otherSection.id}
                    tagCode={tagCode}
                    section={otherSection}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-9 rounded-[1.8rem] border border-white/[0.08] bg-white/[0.045] p-5">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[#d5ad55]/20 bg-[#d5ad55]/10 text-[#d5ad55]">
                <HelpCircle className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#d5ad55]">
                  Personal assistance
                </p>
                <h2 className="mt-1.5 font-serif text-xl text-[#f7f2e8]">
                  May we assist you?
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  Our team can help with dining, directions, service requests
                  and hotel information.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link
                    href={`/t/${tagCode}/service`}
                    className="rounded-full bg-[#d5ad55] px-3 py-3 text-center text-xs font-bold text-black transition active:scale-[0.98]"
                  >
                    Request service
                  </Link>
                  <Link
                    href={`/t/${tagCode}/contact`}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-3 text-center text-xs font-bold text-white/75 transition active:scale-[0.98]"
                  >
                    Contact staff
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </GuestShell>
  );
}
