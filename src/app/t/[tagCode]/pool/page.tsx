import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  BedDouble,
  ChevronRight,
  Clock3,
  HelpCircle,
  Info,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Utensils,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

export const dynamic = 'force-dynamic';

const fallbackPoolImage =
  'https://images.unsplash.com/photo-1572331165267-854da2b10ccc?auto=format&fit=crop&w=1200&q=80';

const guideIconMap: Record<string, LucideIcon> = {
  Info,
  BedDouble,
  MapPin,
  Phone,
  Clock: Clock3,
  Clock3,
  Waves,
  ShieldCheck,
  HelpCircle,
  Sparkles,
  Utensils,
};

function getIcon(iconKey?: string | null) {
  if (!iconKey) return Info;
  return guideIconMap[iconKey] ?? Info;
}

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function firstLine(value?: string | null) {
  return (
    value
      ?.split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  );
}

function resolveGuestHref(tagCode: string, href?: string | null) {
  const rawHref = href?.trim();

  if (!rawHref) {
    return `/t/${tagCode}/guide`;
  }

  if (
    rawHref.startsWith('http://') ||
    rawHref.startsWith('https://') ||
    rawHref.startsWith('tel:') ||
    rawHref.startsWith('mailto:')
  ) {
    return rawHref;
  }

  if (rawHref.startsWith('#')) {
    return rawHref;
  }

  if (rawHref.startsWith('/t/')) {
    return rawHref;
  }

  const cleanHref = rawHref.replace(/^\/+/, '');

  return `/t/${tagCode}/${cleanHref}`;
}

function isPoolHeroItem(item: {
  title: string;
  buttonHref: string | null;
  iconKey: string | null;
}) {
  const title = normalizeText(item.title);
  const buttonHref = normalizeText(item.buttonHref);
  const iconKey = normalizeText(item.iconKey);

  return (
    buttonHref === 'pool' ||
    buttonHref.startsWith('pool') ||
    buttonHref.includes('/pool') ||
    title === 'infinity pool' ||
    title === 'pool hours' ||
    title === 'swimming pool' ||
    iconKey === 'waves'
  );
}

function isPoolRulesItem(item: {
  title: string;
  itemType?: string | null;
}) {
  const title = normalizeText(item.title);
  const itemType = normalizeText(item.itemType);

  return title.includes('rule') || title.includes('safety') || itemType === 'policy';
}

function splitRules(value: string) {
  const rules = value
    .split(/\n|\. /)
    .map((rule) => rule.trim().replace(/\.$/, ''))
    .filter(Boolean);

  return rules.length
    ? rules
    : [
        'Shower before entering the pool.',
        'No running around the pool area.',
        'Children must be supervised at all times.',
        'Follow staff and lifeguard instructions.',
      ];
}

function isExternalHref(href: string) {
  return (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('tel:') ||
    href.startsWith('mailto:')
  );
}

function SmartLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  if (isExternalHref(href)) {
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

function InfoStatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.45rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
      <span className="grid size-10 place-items-center rounded-2xl bg-gold/20 text-gold">
        <Icon className="size-5" />
      </span>

      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-gold">
        {label}
      </p>

      <p className="mt-1 line-clamp-2 text-sm font-black leading-5 text-white">
        {value}
      </p>
    </div>
  );
}

function QuickActionCard({
  href,
  icon: Icon,
  title,
  description,
  gold = false,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  gold?: boolean;
}) {
  return (
    <SmartLink
      href={href}
      className={
        gold
          ? 'group block rounded-[1.55rem] bg-gold p-4 text-black shadow-[0_18px_40px_rgba(214,167,56,0.22)] active:scale-[0.99]'
          : 'group block rounded-[1.55rem] border border-white/10 bg-white/10 p-4 text-white backdrop-blur transition hover:border-gold/50 hover:bg-gold/10 active:scale-[0.99]'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={
            gold
              ? 'grid size-11 place-items-center rounded-2xl bg-black/10 text-black'
              : 'grid size-11 place-items-center rounded-2xl bg-gold/20 text-gold'
          }
        >
          <Icon className="size-5" />
        </span>

        <ChevronRight
          className={
            gold
              ? 'size-5 text-black/45 transition group-hover:translate-x-1'
              : 'size-5 text-gold transition group-hover:translate-x-1'
          }
        />
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
        {description}
      </p>
    </SmartLink>
  );
}

function PoolRuleCard({ rules }: { rules: string[] }) {
  return (
    <section id="pool-rules" className="rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold text-black">
          <ShieldCheck className="size-6" />
        </span>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-gold">
            Safety First
          </p>
          <h2 className="mt-1 text-2xl font-black text-white">Pool Rules</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-white/55">
            Please follow these guidelines so everyone can enjoy the pool safely.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {rules.map((rule, index) => (
          <div
            key={`${rule}-${index}`}
            className="flex gap-3 rounded-2xl bg-black/25 px-4 py-3 text-sm font-semibold leading-6 text-white/70"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold text-xs font-black text-black">
              {index + 1}
            </span>
            <span>{rule}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PoolGallery({
  images,
}: {
  images: {
    id: string;
    imageUrl: string;
    title?: string | null;
    caption?: string | null;
  }[];
}) {
  if (!images.length) {
    return null;
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
      <div className="mb-4">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-gold">
          Gallery
        </p>
        <h2 className="mt-1 text-2xl font-black text-white">Pool Preview</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {images.slice(0, 5).map((image, index) => (
          <figure
            key={image.id}
            className={
              index === 0
                ? 'col-span-2 overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/30'
                : 'overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/30'
            }
          >
            <img
              src={image.imageUrl}
              alt={image.title || 'Pool image'}
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

export default async function PoolPage({
  params,
}: {
  params: Promise<{ tagCode: string }>;
}) {
  const { tagCode } = await params;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag || tag.status !== 'ACTIVE') {
    notFound();
  }

  const hotelId = tag.hotel.id;
  const settings = tag.hotel.settings;

  const candidateSections = await db.hotelGuideSection.findMany({
    where: {
      hotelId,
      isActive: true,
      OR: [
        {
          title: {
            contains: 'Pool',
          },
        },
        {
          subtitle: {
            contains: 'Pool',
          },
        },
        {
          description: {
            contains: 'Pool',
          },
        },
        {
          items: {
            some: {
              isActive: true,
              OR: [
                {
                  title: {
                    contains: 'Pool',
                  },
                },
                {
                  subtitle: {
                    contains: 'Pool',
                  },
                },
                {
                  buttonHref: {
                    contains: 'pool',
                  },
                },
                {
                  iconKey: 'Waves',
                },
              ],
            },
          },
        },
      ],
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

  const poolSection =
    candidateSections.find(
      (section) => normalizeText(section.title) === 'pool & amenities'
    ) ??
    candidateSections.find((section) =>
      normalizeText(section.title).includes('pool')
    ) ??
    candidateSections.find((section) =>
      section.items.some((item) => normalizeText(item.buttonHref).includes('pool'))
    ) ??
    candidateSections[0] ??
    null;

  const poolHeroItem =
    poolSection?.items.find((item) => isPoolHeroItem(item)) ?? null;

  const rulesItem =
    poolSection?.items.find((item) => isPoolRulesItem(item)) ?? null;

  const heroTitle =
    poolHeroItem?.title && normalizeText(poolHeroItem.title) !== 'pool hours'
      ? poolHeroItem.title
      : 'Pool & Leisure';

  const poolHours =
    poolHeroItem?.hours || settings?.poolHours || '7:00 AM - 9:00 PM';

  const heroDescription =
    poolHeroItem?.subtitle ||
    poolSection?.subtitle ||
    'Relax, swim, and enjoy a refreshing hotel pool experience.';

  const poolRules =
    rulesItem?.content ||
    poolHeroItem?.content ||
    settings?.poolRules ||
    'Shower before entering. No running. Children must be supervised. Follow staff and lifeguard instructions.';

  const heroImage =
    poolHeroItem?.galleryImages[0]?.imageUrl ||
    poolSection?.galleryImages[0]?.imageUrl ||
    poolHeroItem?.imageUrl ||
    poolSection?.imageUrl ||
    fallbackPoolImage;

  const accessValue =
    poolHeroItem?.location ||
    poolSection?.description ||
    'Please ask the front desk for pool access details.';

  const safetyValue = rulesItem?.subtitle || 'Guest safety guidelines apply.';

  const dynamicGuideLinks =
    poolSection?.items
      .filter((item) => item.id !== poolHeroItem?.id && item.id !== rulesItem?.id)
      .map((item) => ({
        href: resolveGuestHref(tagCode, item.buttonHref),
        icon: getIcon(item.iconKey),
        title: item.title,
        description: item.subtitle || firstLine(item.content) || 'View details',
      }))
      .slice(0, 4) ?? [];

  const quickActions = dynamicGuideLinks.length
    ? dynamicGuideLinks
    : [
        {
          href: `/t/${tagCode}/menu`,
          icon: Utensils,
          title: 'Poolside Menu',
          description: 'Order food and drinks',
        },
        {
          href: `/t/${tagCode}/service`,
          icon: Waves,
          title: 'Request Towels',
          description: 'Ask staff for pool towels',
        },
        {
          href: '#pool-rules',
          icon: ShieldCheck,
          title: 'Pool Rules',
          description: 'Read safety guidelines',
        },
        {
          href: `/t/${tagCode}/contact`,
          icon: Phone,
          title: 'Contact Staff',
          description: 'Need pool assistance?',
        },
      ];

  const galleryImageMap = new Map<
    string,
    {
      id: string;
      imageUrl: string;
      title?: string | null;
      caption?: string | null;
    }
  >();

  for (const image of [
    ...(poolSection?.galleryImages ?? []),
    ...(poolHeroItem?.galleryImages ?? []),
    ...(rulesItem?.galleryImages ?? []),
  ]) {
    galleryImageMap.set(image.id, {
      id: image.id,
      imageUrl: image.imageUrl,
      title: image.title,
      caption: image.caption,
    });
  }

  const galleryImages = Array.from(galleryImageMap.values());

  return (
    <>
      <main className="mx-auto min-h-screen max-w-md bg-[#070604] pb-28 text-white">
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(214,167,56,0.25),_transparent_35%),linear-gradient(180deg,#050505,#0b0b0b_45%,#050505)]">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-black/80 px-5 py-4 backdrop-blur-xl">
            <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2">
              <Link
                href={`/t/${tagCode}`}
                className="grid size-10 place-items-center rounded-full text-white transition hover:bg-white/10"
                aria-label="Go back"
              >
                <ArrowLeft className="size-5" />
              </Link>

              <div className="min-w-0 text-center">
                <h1 className="truncate text-base font-black tracking-tight text-white">
                  Pool Guide
                </h1>
                <p className="truncate text-xs font-semibold text-white/45">
                  Hours, rules, and poolside services
                </p>
              </div>

              <Link
                href={`/t/${tagCode}/contact`}
                className="grid size-10 place-items-center rounded-full text-white transition hover:bg-white/10"
                aria-label="Contact staff"
              >
                <Phone className="size-5" />
              </Link>
            </div>
          </header>

          <section className="px-5 py-5">
            <div className="relative overflow-hidden rounded-[2.4rem] border border-gold/30 bg-neutral-950 shadow-2xl">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-65"
                style={{
                  backgroundImage: `url(${heroImage})`,
                }}
              />

              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/55 to-black" />

              <div className="relative z-10 flex min-h-[430px] flex-col justify-end p-5">
                <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-gold/40 bg-black/45 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-gold backdrop-blur">
                  <Sparkles className="size-4" />
                  Pool Experience
                </span>

                <h2 className="max-w-sm text-5xl font-black leading-[0.92] tracking-tight text-white">
                  {heroTitle}
                </h2>

                <p className="mt-4 max-w-sm text-sm font-semibold leading-7 text-white/65">
                  {heroDescription}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white backdrop-blur">
                    Open {poolHours}
                  </span>

                  <span className="rounded-full bg-gold px-3 py-1 text-xs font-black text-black">
                    Guest Access
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="px-5">
            <div className="grid grid-cols-3 gap-3">
              <InfoStatCard icon={Clock3} label="Hours" value={poolHours} />
              <InfoStatCard icon={MapPin} label="Access" value={accessValue} />
              <InfoStatCard icon={ShieldCheck} label="Safety" value={safetyValue} />
            </div>
          </section>

          <section className="px-5 pt-6">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-gold">
                Quick Actions
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                What do you need?
              </h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-white/50">
                Fast access to poolside dining, towels, rules, and staff help.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action, index) => (
                <QuickActionCard
                  key={`${action.title}-${index}`}
                  href={action.href}
                  icon={action.icon}
                  title={action.title}
                  description={action.description}
                  gold={index === 0}
                />
              ))}
            </div>
          </section>

          <section className="px-5 pt-6">
            <PoolRuleCard rules={splitRules(poolRules)} />
          </section>

          {galleryImages.length > 0 ? (
            <section className="px-5 pt-6">
              <PoolGallery images={galleryImages} />
            </section>
          ) : null}

          <section className="px-5 pt-6">
            <div className="rounded-[2rem] border border-gold/30 bg-gold p-5 text-black shadow-[0_20px_50px_rgba(214,167,56,0.22)]">
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black/10">
                  <HelpCircle className="size-6" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-xl font-black">Need pool assistance?</p>

                  <p className="mt-1 text-sm font-bold leading-6 text-black/65">
                    Request towels, order poolside food, or contact the staff for help.
                  </p>

                  <div className="mt-4 grid gap-2">
                    <Link
                      href={`/t/${tagCode}/service`}
                      className="rounded-2xl bg-black px-4 py-3 text-center text-sm font-black text-white"
                    >
                      Request Service
                    </Link>

                    <Link
                      href={`/t/${tagCode}/menu`}
                      className="rounded-2xl border border-black/15 bg-white/40 px-4 py-3 text-center text-sm font-black text-black"
                    >
                      Order Food & Drinks
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <GuestBottomNav tagCode={tagCode} active="profile" dark />
    </>
  );
}