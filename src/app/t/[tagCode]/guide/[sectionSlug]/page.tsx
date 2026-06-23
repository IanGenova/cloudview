import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  BedDouble,
  Car,
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
} from 'lucide-react';
import { PanoramaModalButton } from './PanoramaModalButton';
import { db } from '@/lib/db';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { GuestShell } from '@/components/guest/GuestShell';

export const dynamic = 'force-dynamic';

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
  galleryImages: GuideImage[];
};

function createGuideSlug(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
  return item.imageUrl || item.galleryImages.find((image) => image.isActive)?.imageUrl || '';
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
    ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-3 text-sm font-black text-black shadow-[0_14px_30px_rgba(214,167,56,0.25)]'
    : 'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white backdrop-blur hover:bg-white/15';

  if (href.startsWith('http://') || href.startsWith('https://')) {
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

function DetailPill({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
      <span className="grid size-10 place-items-center rounded-2xl bg-gold/20 text-gold">
        <Icon className="size-5" />
      </span>

      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-gold">
        {label}
      </p>

      <p className="mt-1 line-clamp-2 text-sm font-black text-white">
        {value}
      </p>
    </div>
  );
}

function PhotoStrip({ images }: { images: GuideImage[] }) {
  const activeImages = images.filter((image) => image.isActive).slice(0, 6);

  if (!activeImages.length) {
    return null;
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-gold">
            Gallery
          </p>
          <h2 className="mt-1 text-xl font-black text-white">
            Preview photos
          </h2>
        </div>

        <span className="grid size-10 place-items-center rounded-2xl bg-gold/20 text-gold">
          <ImageIcon className="size-5" />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {activeImages.map((image, index) => (
          <figure
            key={image.id}
            className={
              index === 0
                ? 'col-span-2 overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/30'
                : 'overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/30'
            }
          >
            <img
              src={image.imageUrl}
              alt={image.title || 'Hotel guide photo'}
              className={index === 0 ? 'h-52 w-full object-cover' : 'h-32 w-full object-cover'}
            />

            {(image.title || image.caption) && index === 0 ? (
              <figcaption className="p-3">
                {image.title ? (
                  <p className="text-sm font-black text-white">{image.title}</p>
                ) : null}

                {image.caption ? (
                  <p className="mt-1 text-xs font-semibold leading-5 text-white/50">
                    {image.caption}
                  </p>
                ) : null}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>
    </section>
  );
}

function GuideItemCard({
  item,
  tagCode,
}: {
  item: GuideItemCardProps;
  tagCode: string;
}) {
  const Icon = getIcon(item.iconKey);
  const imageUrl = getItemImage(item);
  const primaryHref = resolveHref(tagCode, item.buttonHref);
  const mapHref = resolveHref(tagCode, item.mapUrl);

  return (
    <article className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 shadow-sm backdrop-blur">
      {imageUrl ? (
        <div className="relative h-48 bg-neutral-900">
          <img
            src={imageUrl}
            alt={item.title}
            className="h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/80" />

          <span className="absolute left-4 top-4 grid size-11 place-items-center rounded-2xl bg-black/45 text-gold backdrop-blur">
            <Icon className="size-5" />
          </span>
        </div>
      ) : null}

      <div className="p-5">
        {!imageUrl ? (
          <span className="grid size-11 place-items-center rounded-2xl bg-gold/20 text-gold">
            <Icon className="size-5" />
          </span>
        ) : null}

        <h3 className={imageUrl ? 'text-2xl font-black text-white' : 'mt-4 text-2xl font-black text-white'}>
          {item.title}
        </h3>

        {item.subtitle ? (
          <p className="mt-2 text-sm font-semibold leading-6 text-gold">
            {item.subtitle}
          </p>
        ) : null}

        {item.content ? (
          <p className="mt-4 whitespace-pre-line text-sm font-semibold leading-7 text-white/60">
            {item.content}
          </p>
        ) : null}

        {(item.hours || item.location || item.contact) ? (
          <div className="mt-5 grid gap-2">
            {item.hours ? (
              <div className="flex items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-sm font-bold text-white/70">
                <Clock className="size-4 shrink-0 text-gold" />
                {item.hours}
              </div>
            ) : null}

            {item.location ? (
              <div className="flex items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-sm font-bold text-white/70">
                <MapPin className="size-4 shrink-0 text-gold" />
                {item.location}
              </div>
            ) : null}

            {item.contact ? (
              <div className="flex items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-sm font-bold text-white/70">
                <Phone className="size-4 shrink-0 text-gold" />
                {item.contact}
              </div>
            ) : null}
          </div>
        ) : null}

        {(item.buttonLabel && item.buttonHref) || item.mapUrl ? (
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {item.buttonLabel && item.buttonHref ? (
              <ActionLink href={primaryHref} primary>
                {item.buttonLabel}
                <ArrowRight className="size-4" />
              </ActionLink>
            ) : null}

            {item.mapUrl ? (
              <ActionLink href={mapHref}>
                Open Map
                <MapPin className="size-4" />
              </ActionLink>
            ) : null}
          </div>
        ) : null}

        {item.galleryImages.length > 0 ? (
          <div className="mt-5 grid grid-cols-3 gap-2">
            {item.galleryImages.slice(0, 3).map((image) => (
              <img
                key={image.id}
                src={image.imageUrl}
                alt={image.title || item.title}
                className="h-20 rounded-2xl object-cover"
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
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

  if (!tag || tag.status !== 'ACTIVE') {
    notFound();
  }

  const sections = await db.hotelGuideSection.findMany({
    where: {
      hotelId: tag.hotelId,
      isActive: true,
    },
    include: {
      galleryImages: {
        where: {
          isActive: true,
        },
        orderBy: [
          {
            sortOrder: 'asc',
          },
          {
            createdAt: 'desc',
          },
        ],
      },
      items: {
        where: {
          isActive: true,
        },
        include: {
          galleryImages: {
            where: {
              isActive: true,
            },
            orderBy: [
              {
                sortOrder: 'asc',
              },
              {
                createdAt: 'desc',
              },
            ],
          },
        },
        orderBy: [
          {
            sortOrder: 'asc',
          },
          {
            title: 'asc',
          },
        ],
      },
    },
    orderBy: [
      {
        sortOrder: 'asc',
      },
      {
        title: 'asc',
      },
    ],
  });

  const section = sections.find(
    (currentSection) => createGuideSlug(currentSection.title) === sectionSlug
  );

  if (!section) {
    notFound();
  }

  const SectionIcon = getIcon(section.iconKey);
  const heroImage = getSectionImage(section);
  const featuredItems = section.items.slice(0, 3);
  const otherSections = sections.filter((item) => item.id !== section.id).slice(0, 4);

  return (
    <GuestShell
      hotel={tag.hotel}
      title={section.title}
      subtitle={section.subtitle ?? 'Hotel Guide'}
      backHref={`/t/${tagCode}/guide`}
      variant="dark"
    >
      <div className="-mx-5 -mt-4 min-h-screen bg-[radial-gradient(circle_at_top,_rgba(214,167,56,0.26),_transparent_34%),linear-gradient(180deg,#050505,#0b0b0b_45%,#050505)] px-5 pb-32 pt-5 text-white">
        <section className="relative mb-5 overflow-hidden rounded-[2.4rem] border border-white/10 bg-neutral-950 shadow-2xl">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-55"
            style={{
              backgroundImage: `url(${heroImage})`,
            }}
          />

          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/60 to-black" />

          <div className="relative z-10 flex min-h-[430px] flex-col justify-end p-5">
            <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-gold/40 bg-black/45 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-gold backdrop-blur">
              <SectionIcon className="size-4" />
              Hotel Guide
            </span>

            <h1 className="max-w-sm text-5xl font-black leading-[0.94] tracking-tight text-white">
              {section.title}
            </h1>

            {section.subtitle ? (
              <p className="mt-4 max-w-md text-sm font-semibold leading-7 text-white/65">
                {section.subtitle}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white backdrop-blur">
                {section.items.length} guide item
                {section.items.length === 1 ? '' : 's'}
              </span>

              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white backdrop-blur">
                {section.galleryImages.length} photo
                {section.galleryImages.length === 1 ? '' : 's'}
              </span>
            </div>

            {section.panoramaEnabled && section.panoramaImageUrl ? (
              <div className="mt-5">
                <PanoramaModalButton
                  title={section.title}
                  subtitle={section.subtitle ?? undefined}
                  panoramaImageUrl={section.panoramaImageUrl}
                />
              </div>
            ) : null}
          </div>
        </section>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <DetailPill
            icon={Clock}
            label="Guide Items"
            value={`${section.items.length} available`}
          />

          <DetailPill
            icon={ImageIcon}
            label="Photos"
            value={`${section.galleryImages.length} gallery image${
              section.galleryImages.length === 1 ? '' : 's'
            }`}
          />
        </div>

        {section.description ? (
          <section className="mb-5 rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-gold">
              About This Guide
            </p>

            <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-7 text-white/60">
              {section.description}
            </p>
          </section>
        ) : null}

        <PhotoStrip images={section.galleryImages} />

        {section.items.length > 0 ? (
          <section className="mt-6">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-gold">
                Details
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                What guests need to know
              </h2>

              <p className="mt-1 text-sm font-semibold leading-6 text-white/50">
                Tap buttons, open maps, and view helpful details for this hotel
                guide section.
              </p>
            </div>

            <div className="grid gap-4">
              {section.items.map((item) => (
                <GuideItemCard key={item.id} item={item} tagCode={tagCode} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/10 p-8 text-center backdrop-blur">
            <Info className="mx-auto size-10 text-gold" />

            <h2 className="mt-4 text-xl font-black text-white">
              No guide items yet
            </h2>

            <p className="mt-2 text-sm font-semibold leading-6 text-white/50">
              More details will appear here once the hotel updates this guide
              section.
            </p>
          </section>
        )}

        {featuredItems.length > 0 ? (
          <section className="mt-8 rounded-[2rem] border border-gold/30 bg-gold p-5 text-black shadow-[0_20px_50px_rgba(214,167,56,0.22)]">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black/10">
                <Star className="size-6" />
              </span>

              <div>
                <p className="text-xl font-black">Guest tip</p>

                <p className="mt-1 text-sm font-bold leading-6 text-black/65">
                  Save this page during your stay. This section contains the
                  most useful details for {section.title.toLowerCase()}.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {otherSections.length > 0 ? (
          <section className="mt-8">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-gold">
              More Hotel Guides
            </p>

            <div className="mt-3 grid gap-3">
              {otherSections.map((otherSection) => {
                const OtherIcon = getIcon(otherSection.iconKey);

                return (
                  <Link
                    key={otherSection.id}
                    href={`/t/${tagCode}/guide/${createGuideSlug(
                      otherSection.title
                    )}`}
                    className="flex items-center gap-3 rounded-[1.5rem] border border-white/10 bg-white/10 p-3 backdrop-blur transition hover:border-gold/50 hover:bg-gold/10"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/20 text-gold">
                      <OtherIcon className="size-5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-black text-white">
                        {otherSection.title}
                      </span>
                      <span className="mt-1 block truncate text-xs font-semibold text-white/45">
                        {otherSection.subtitle ||
                          `${otherSection.items.length} guide item${
                            otherSection.items.length === 1 ? '' : 's'
                          }`}
                      </span>
                    </span>

                    <ChevronRight className="size-5 shrink-0 text-gold" />
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/20 text-gold">
              <HelpCircle className="size-6" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-xl font-black text-white">Need help?</p>

              <p className="mt-1 text-sm font-semibold leading-6 text-white/50">
                Our team can help with directions, service requests, food
                orders, and hotel information.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link
                  href={`/t/${tagCode}/service`}
                  className="rounded-2xl bg-gold px-4 py-3 text-center text-sm font-black text-black"
                >
                  Request Service
                </Link>

                <Link
                  href={`/t/${tagCode}/contact`}
                  className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-center text-sm font-black text-white"
                >
                  Contact Staff
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </GuestShell>
  );
}