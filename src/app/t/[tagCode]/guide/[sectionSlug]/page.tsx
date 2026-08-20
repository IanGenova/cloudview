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
import { GuideWifiCard } from "./GuideWifiCard";
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

  /*
    Live Wi-Fi credentials for the guide's Wi-Fi item. Read from settings so a
    password change in the dashboard is reflected here immediately.
  */
  const wifiName = tag.hotel.settings?.wifiName ?? "";
  const wifiPassword = tag.hotel.settings?.wifiPassword ?? "";

  const sections = await db.hotelGuideSection.findMany({
    where: {
      hotelId: tag.hotelId,
      isActive: true,
    },
    include: {
      /**
       * Section-level photos only.
       *
       * An image attached to an item carries both `sectionId` and `itemId`, so
       * without the `itemId: null` filter it is returned here *and* under its
       * item — and the page renders both galleries, showing the guest every
       * item photo twice.
       */
      galleryImages: {
        where: { isActive: true, itemId: null },
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
          {/*
            Compact banner instead of a full-height hero.

            The guest arrived here by tapping this section's card, and the
            shell header above already shows the title and subtitle. Repeating
            both over a 440px photo — plus counts of the very facts they are
            about to read — pushed the actual answer below three screens.
            The photograph stays, at a size that sets tone without displacing
            content.
          */}
          <section className="relative mb-5 h-[168px] overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#11110e] shadow-[0_20px_50px_rgba(0,0,0,0.38)]">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${heroImage})` }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.45)_55%,rgba(5,5,4,0.95)_100%)]" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/[0.06]" />

            <div className="relative z-10 flex h-full flex-col justify-end p-4">
              <h1 className="font-serif text-[1.9rem] font-light leading-[1.02] tracking-[-0.02em] text-[#fbf7ee]">
                {section.title}
              </h1>

              {section.panoramaEnabled && section.panoramaImageUrl ? (
                <div className="mt-3">
                  <PanoramaModalButton
                    title={section.title}
                    subtitle={section.subtitle}
                    panoramaImageUrl={section.panoramaImageUrl}
                  />
                </div>
              ) : null}
            </div>
          </section>

          {section.description ? (
            <p className="mb-7 whitespace-pre-line font-serif text-[1.1rem] font-light leading-8 text-white/72">
              {section.description}
            </p>
          ) : null}

          {/*
            Content leads. The gallery and the guide items are the payload, so
            they start immediately rather than behind a heading, a restated
            heading and a sentence explaining how to scroll.
          */}
          {section.galleryImages.length ? (
            <section className="mb-8">
              <GuideImageGallery
                images={section.galleryImages}
                variant="section"
              />
            </section>
          ) : null}

          {section.items.length ? (
            <section>
              <div className="space-y-4">
                {section.items.map((item, index) =>
                  /*
                    A Wi-Fi item shows the hotel's real credentials from
                    settings rather than its stored text, which was a pointer to
                    another screen. Keyed on the existing iconKey so it does not
                    depend on matching the title string.
                  */
                  item.iconKey === "Wifi" && wifiName ? (
                    <GuideWifiCard
                      key={item.id}
                      title={item.title}
                      subtitle={item.subtitle}
                      wifiName={wifiName}
                      wifiPassword={wifiPassword}
                    />
                  ) : (
                    <GuideItemCard
                      key={item.id}
                      item={item}
                      tagCode={tagCode}
                      index={index}
                    />
                  )
                )}
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

          {/*
            The "Guest note" panel was removed: it told the guest to keep the
            guide close and that it contained information about the section
            they were already reading, with the section title interpolated into
            the sentence. It carried no information and occupied a full screen
            band directly after the content that does.
          */}

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

          {/*
            The "Personal assistance" panel was removed here for the same
            reason as on the guide index: Request service and Contact staff are
            already reachable from the persistent bottom tab bar on every
            screen, so repeating them at the foot of each section pushed the
            section's own content further from the top.
          */}
        </div>
      </div>
    </GuestShell>
  );
}
