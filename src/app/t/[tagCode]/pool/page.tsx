import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  BedDouble,
  Bell,
  Car,
  ChevronRight,
  Clock3,
  HelpCircle,
  Hotel,
  Info,
  MapPin,
  Phone,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Utensils,
  Waves,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

const fallbackPoolImage =
  'https://images.unsplash.com/photo-1572331165267-854da2b10ccc?auto=format&fit=crop&w=1200&q=80';

const guideIconMap: Record<string, LucideIcon> = {
  Info,
  Wifi,
  BedDouble,
  Hotel,
  MapPin,
  Utensils,
  Car,
  Phone,
  Clock: Clock3,
  Clock3,
  Waves,
  Search,
  Shield,
  ShieldCheck,
  HelpCircle,
  Sparkles,
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
  iconKey: string;
}) {
  const title = normalizeText(item.title);
  const buttonHref = normalizeText(item.buttonHref);

  return (
    buttonHref === 'pool' ||
    buttonHref.startsWith('pool') ||
    buttonHref.includes('/pool') ||
    title === 'infinity pool' ||
    title === 'pool hours' ||
    title === 'swimming pool'
  );
}

function isPoolRulesItem(item: {
  title: string;
  itemType: string;
}) {
  const title = normalizeText(item.title);
  const itemType = normalizeText(item.itemType);

  return title.includes('rule') || itemType === 'policy';
}

export default async function PoolPage({
  params,
}: {
  params: Promise<{ tagCode: string }>;
}) {
  const { tagCode } = await params;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag || tag.status !== 'ACTIVE') notFound();

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
      : 'Infinity Pool';

  const poolHours =
    poolHeroItem?.hours || settings?.poolHours || '7:00 AM - 9:00 PM';

  const heroDescription =
    poolHeroItem?.subtitle ||
    poolSection?.subtitle ||
    'Take a dip and unwind in a refined resort atmosphere with a breathtaking view.';

  const poolRules =
    rulesItem?.content ||
    poolHeroItem?.content ||
    settings?.poolRules ||
    'Shower before entering. No running. Children must be supervised. Follow lifeguard and staff instructions.';
    const heroImage =
      poolHeroItem?.galleryImages[0]?.imageUrl ||
      poolSection?.galleryImages[0]?.imageUrl ||
      poolHeroItem?.imageUrl ||
      poolSection?.imageUrl ||
      fallbackPoolImage;

  const dynamicGuideLinks =
    poolSection?.items
      .filter((item) => item.id !== poolHeroItem?.id)
      .map((item) => ({
        href: resolveGuestHref(tagCode, item.buttonHref),
        icon: getIcon(item.iconKey),
        title: item.title,
        description: item.subtitle || firstLine(item.content) || 'View details',
      }))
      .slice(0, 4) ?? [];

  const guideLinks = dynamicGuideLinks.length
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
          description: 'Ask staff for extra towels',
        },
        {
          href: '#pool-rules',
          icon: ShieldCheck,
          title: 'Pool Rules',
          description: 'Guidelines for your safety',
        },
        {
          href: `/t/${tagCode}/guide`,
          icon: Sparkles,
          title: 'Spa & Wellness',
          description: 'Relax and rejuvenate',
        },
      ];

  const accessValue =
    poolHeroItem?.location || poolSection?.description || 'Relaxing resort view';

  const safetyValue =
    rulesItem?.subtitle || 'Guided pool rules';

  return (
    <>
      <main className="mx-auto min-h-screen max-w-md bg-[#0b0905] pb-28 text-white">
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#2b210f_0%,#11100b_42%,#080704_100%)]">
          <header className="sticky top-0 z-20 border-b border-[#2d2413]/80 bg-[#050403]/95 px-5 py-4 backdrop-blur">
            <div className="grid grid-cols-[40px_1fr_40px] items-center">
              <Link
                href={`/t/${tagCode}`}
                className="grid size-10 place-items-center rounded-full text-white transition hover:bg-white/10"
                aria-label="Go back"
              >
                <ArrowLeft className="size-5" />
              </Link>

              <div className="text-center">
                <h1 className="text-base font-black tracking-tight text-white">
                  Pool & Amenities
                </h1>
                <p className="text-xs text-[#a69a83]">
                  Luxury leisure during your stay
                </p>
              </div>

              <button
                type="button"
                className="grid size-10 place-items-center rounded-full text-white transition hover:bg-white/10"
                aria-label="Notifications"
              >
                <Bell className="size-5" />
              </button>
            </div>
          </header>

          <section className="px-5 py-5">
            <div className="overflow-hidden rounded-[2rem] border border-[#b88a2d]/35 bg-[#171207] shadow-[0_28px_70px_rgba(0,0,0,0.55)]">
              <div className="relative h-72 overflow-hidden">
                <div
                  className="absolute inset-0 scale-105 bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${heroImage})`,
                  }}
                />

                <div className="absolute inset-0 bg-gradient-to-t from-[#050403] via-[#050403]/55 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#090602]/85 via-transparent to-[#c99c38]/15" />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />

                <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-[#c99c38]/40 bg-black/45 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-[#f4d58a] backdrop-blur">
                  <Sparkles className="size-3.5" />
                  Luxury Pool
                </div>

                <div className="absolute bottom-0 p-5">
                  <h2 className="font-serif text-4xl leading-none text-white drop-shadow">
                    {heroTitle}
                  </h2>

                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#c99c38]/35 bg-black/45 px-3 py-1.5 text-xs font-black text-[#f6d98d] backdrop-blur">
                    <Clock3 className="size-4" />
                    {poolHours}
                  </div>

                  <p className="mt-4 max-w-[18rem] text-sm leading-6 text-white/85">
                    {heroDescription}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-white/10 bg-[#120e08] p-4">
                <MiniAmenity
                  icon={Waves}
                  label="Pool Access"
                  value={accessValue}
                />

                <MiniAmenity
                  icon={ShieldCheck}
                  label="Guest Safety"
                  value={safetyValue}
                />
              </div>
            </div>
          </section>

          <section className="px-5">
            <div className="mb-3">
              <p className="text-[11px] font-black uppercase tracking-[0.26em] text-[#b88a2d]">
                Concierge Services
              </p>

              <h3 className="mt-1 text-lg font-black text-white">
                Enhance your pool day
              </h3>
            </div>

            <div className="space-y-3">
              {guideLinks.map((link) => (
                <GuideLink
                  key={`${link.title}-${link.href}`}
                  href={link.href}
                  icon={link.icon}
                  title={link.title}
                  description={link.description}
                />
              ))}
            </div>
          </section>

          <section id="pool-rules" className="px-5 pt-5">
            <div className="rounded-[2rem] border border-[#3b301b] bg-[#151106]/95 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-[#2b210f] text-[#d6a738] ring-1 ring-[#b88a2d]/25">
                  <Info className="size-5" />
                </span>

                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#b88a2d]">
                    Guest Safety
                  </p>

                  <h3 className="font-black text-white">Pool Rules</h3>
                </div>
              </div>

              <p className="whitespace-pre-line text-sm leading-7 text-[#bdb19d]">
                {poolRules}
              </p>
            </div>
          </section>
        </div>
      </main>

      <GuestBottomNav tagCode={tagCode} active="services" />
    </>
  );
}

function MiniAmenity({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[#2f2818] bg-[#0d0a05] p-3">
      <div className="mb-2 grid size-9 place-items-center rounded-xl bg-[#2b210f] text-[#d6a738]">
        <Icon className="size-4" />
      </div>

      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#d6a738]">
        {label}
      </p>

      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#a79c89]">
        {value}
      </p>
    </div>
  );
}

function GuideLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group grid grid-cols-[54px_1fr_24px] items-center gap-3 rounded-[1.7rem] border border-[#302819] bg-[#171207] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.35)] transition hover:border-[#b88a2d]/70 hover:bg-[#1f180b]"
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-[#2b210f] text-[#d6a738] ring-1 ring-[#b88a2d]/25">
        <Icon className="size-5" />
      </span>

      <span>
        <span className="block text-[15px] font-black text-white">
          {title}
        </span>

        <span className="mt-1 block text-xs text-[#a79c89]">
          {description}
        </span>
      </span>

      <ChevronRight className="size-5 text-[#b88a2d] transition group-hover:translate-x-0.5" />
    </Link>
  );
}