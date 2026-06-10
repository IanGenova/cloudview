import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GuideImageGallery } from './GuideImageGallery';
import { PanoramaModalButton } from './PanoramaModalButton';
import {
  BedDouble,
  Car,
  Clock,
  HelpCircle,
  Hotel,
  Info,
  MapPin,
  Phone,
  Shield,
  Utensils,
  Waves,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { db } from '@/lib/db';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';

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
  galleryImages: {
    imageUrl: string;
    isActive: boolean;
  }[];
}) {
  return (
    section.imageUrl ||
    section.galleryImages.find((image) => image.isActive)?.imageUrl ||
    fallbackImage
  );
}

function getItemImage(item: {
  imageUrl: string | null;
  galleryImages: {
    imageUrl: string;
    isActive: boolean;
  }[];
}) {
  return item.imageUrl || item.galleryImages.find((image) => image.isActive)?.imageUrl || '';
}

function ActionLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  const className = primary
    ? 'inline-flex items-center justify-center rounded-full bg-gold px-4 py-2 text-xs font-black text-black'
    : 'inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-black text-white';

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

  const section = sections.find((currentSection) => {
    return createGuideSlug(currentSection.title) === sectionSlug;
  });

  if (!section) {
    notFound();
  }

  const SectionIcon = iconMap[section.iconKey] ?? Info;
  const heroImage = getSectionImage(section);

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title={section.title}
        subtitle={section.subtitle ?? 'Hotel Guide'}
        backHref={`/t/${tagCode}/guide`}
        variant="dark"
      >
        <div className="-mx-5 -mt-4 min-h-screen bg-[radial-gradient(circle_at_top,_rgba(184,137,56,0.20),_transparent_35%),linear-gradient(180deg,#050505,#0b0b0b_45%,#050505)] px-5 pb-32 pt-5 text-white">
          <section className="overflow-hidden rounded-[2rem] border border-gold/25 bg-white/8 shadow-2xl">
            <div
              className="relative min-h-72 bg-cover bg-center"
              style={{
                backgroundImage: `url(${heroImage})`,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/45 to-black/95" />

              <div className="relative z-10 flex min-h-72 flex-col justify-end p-5">
                <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-gold/40 bg-black/45 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-gold backdrop-blur">
                  <SectionIcon className="size-4" />
                  Hotel Guide
                </span>

                <h1 className="max-w-sm text-4xl font-black leading-tight text-white">
                  {section.title}
                </h1>

                {section.subtitle ? (
                  <p className="mt-3 max-w-sm text-sm leading-6 text-white/70">
                    {section.subtitle}
                  </p>
                ) : null}

                {section.panoramaEnabled && section.panoramaImageUrl ? (
                  <div className="mt-5">
                    <PanoramaModalButton
                      title={section.title}
                      subtitle={section.subtitle}
                      panoramaImageUrl={section.panoramaImageUrl}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {section.description ? (
              <div className="border-t border-white/10 p-5">
                <p className="whitespace-pre-line text-sm leading-7 text-white/60">
                  {section.description}
                </p>
              </div>
            ) : null}
          </section>

          {section.galleryImages.length ? (
                        <section className="mt-6">
                            <p className="text-xs font-black uppercase tracking-[0.26em] text-gold">
                            Gallery
                            </p>

                            <GuideImageGallery images={section.galleryImages} variant="section" />
                        </section>
                        ) : null}

          <section className="mt-7">
            <p className="text-xs font-black uppercase tracking-[0.26em] text-gold">
              Details
            </p>

            <h2 className="mt-2 text-2xl font-black text-white">
              What guests need to know
            </h2>

            <div className="mt-4 space-y-4">
              {section.items.map((item) => {
                const ItemIcon = iconMap[item.iconKey] ?? Info;
                const itemImage = getItemImage(item);
                const href = resolveHref(tagCode, item.buttonHref ?? '');

                return (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/8 shadow-sm backdrop-blur"
                  >
                    {itemImage ? (
                      <img
                        src={itemImage}
                        alt={item.title}
                        className="h-44 w-full object-cover"
                      />
                    ) : null}

                    <div className="p-5">
                      <h3 className="flex items-center gap-3 text-lg font-black text-white">
                        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold">
                          <ItemIcon className="size-5" />
                        </span>
                        {item.title}
                      </h3>

                      {item.subtitle ? (
                        <p className="mt-2 text-xs font-bold text-white/40">
                          {item.subtitle}
                        </p>
                      ) : null}

                      {item.content ? (
                        <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/60">
                          {item.content}
                        </p>
                      ) : null}

                      <div className="mt-4 grid gap-2 text-xs font-bold text-white/50">
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

                    {item.galleryImages.length ? (
                            <GuideImageGallery images={item.galleryImages} variant="item" />
                            ) : null}

                      <div className="mt-5 flex flex-wrap gap-2">
                              {item.buttonLabel && item.buttonHref ? (
                                <ActionLink href={href} primary>
                                  {item.buttonLabel}
                                </ActionLink>
                              ) : null}

                              {item.mapUrl ? (
                                <ActionLink href={item.mapUrl}>
                                  Open Map
                                </ActionLink>
                              ) : null}

                              {item.panoramaEnabled && item.panoramaImageUrl ? (
                                <PanoramaModalButton
                                  title={item.title}
                                  subtitle={item.subtitle}
                                  panoramaImageUrl={item.panoramaImageUrl}
                                />
                              ) : null}
                            </div>
                    </div>
                  </article>
                );
              })}

              {!section.items.length ? (
                <div className="rounded-[2rem] border border-white/10 bg-white/8 p-8 text-center">
                  <Info className="mx-auto size-9 text-gold" />
                  <h3 className="mt-4 font-black text-white">
                    No guide items yet
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    Add guide items from the dashboard to show details here.
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </GuestShell>

      <GuestBottomNav tagCode={tagCode} active="profile" dark />
    </>
  );
}