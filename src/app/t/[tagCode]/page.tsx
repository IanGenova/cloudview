import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Bell,
  ChevronRight,
  ConciergeBell,
  Gift,
  Hotel,
  KeyRound,
  Map,
  Phone,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Utensils,
  Waves,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav } from '@/components/guest/GuestShell';
import { getGuestPortalActivity } from '@/lib/guest-portal-activity';
import {
  GuestAnimatedBackground,
  GuestPressable,
  GuestReveal,
  GuestShimmer,
} from './GuestPortalMotion';

const fallbackResortImage =
  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80';

type GuestHomeProps = {
  params: Promise<{
    tagCode: string;
  }>;
};

function getGuestGreeting() {
  const manilaHour = Number(
    new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      hour12: false,
    }).format(new Date())
  );

  if (manilaHour >= 5 && manilaHour < 12) {
    return 'Good Morning';
  }

  if (manilaHour >= 12 && manilaHour < 18) {
    return 'Good Afternoon';
  }

  if (manilaHour >= 18 && manilaHour < 21) {
    return 'Good Evening';
  }

  return 'Good Night';
}

function PrimaryActionCard({
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
    <GuestPressable className="h-full">
      <Link
        href={href}
        className={
          gold
            ? 'group block h-full bg-gold p-4 text-black transition'
            : 'group block h-full border border-white/10 bg-white/10 p-4 text-white shadow-sm backdrop-blur transition hover:border-gold/50 hover:bg-gold/10'
        }
      >
      <div className="flex items-start justify-between gap-3">
        <span
          className={
            gold
              ? 'grid size-12 place-items-center bg-black/10 text-black'
              : 'grid size-12 place-items-center bg-gold/20 text-gold'
          }
        >
          <Icon className="size-6" />
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
            ? 'mt-4 text-[11px] font-semibold uppercase tracking-widest text-black/60'
            : 'mt-4 text-[11px] font-semibold uppercase tracking-widest text-gold'
        }
      >
        {title}
      </p>

      <p
        className={
          gold
            ? 'mt-1 text-base font-serif font-medium leading-5 text-black'
            : 'mt-1 text-base font-serif font-medium leading-5 text-white'
        }
      >
        {description}
      </p>
    </Link>
    </GuestPressable>
  );
}

function MiniActionCard({
  href,
  icon: Icon,
  title,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <GuestPressable className="h-full">
      <Link
        href={href}
        className="group flex min-h-24 flex-col justify-between border border-white/10 bg-white/10 p-4 text-white backdrop-blur transition hover:border-gold/50 hover:bg-gold/10"
      >
      <div className="flex items-center justify-between">
        <span className="grid size-11 place-items-center bg-gold/20 text-gold">
          <Icon className="size-5" />
        </span>

        <ChevronRight className="size-4 text-white/25 transition group-hover:translate-x-1 group-hover:text-gold" />
      </div>

      <p className="mt-3 line-clamp-2 text-[15px] font-serif font-medium leading-tight tracking-wide">{title}</p>
    </Link>
    </GuestPressable>
  );
}

function StayInfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-white/10 bg-black/35 p-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center bg-gold/20 text-gold">
          <Icon className="size-5" />
        </span>

        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
            {label}
          </p>
          {/* Swapped truncate for line-clamp-2 so longer values display fully without cutting off */}
          <p className="mt-1 line-clamp-2 text-[15px] font-serif font-medium leading-tight tracking-wide text-white">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function ActivityCard({
  href,
  activeOrderCount,
  activeRequestCount,
}: {
  href: string;
  activeOrderCount: number;
  activeRequestCount: number;
}) {
  const total = activeOrderCount + activeRequestCount;

  return (
    <GuestPressable>
      <Link
        href={href}
        className="block border border-gold/25 bg-[#11100b] p-5 text-white shadow-xl transition hover:border-gold/45"
      >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center bg-gold/20 text-gold">
            <ReceiptText className="size-6" />
          </span>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gold">
              My Activity
            </p>
            <h2 className="mt-1 text-2xl font-serif font-normal tracking-wide">Track your requests</h2>
            <p className="mt-1 text-sm font-medium leading-6 text-white/60">
              View current orders, service requests, and past activity.
            </p>
          </div>
        </div>

        {total > 0 ? (
          <span className="grid min-w-9 place-items-center bg-gold px-3 py-2 text-sm font-serif font-medium text-black">
            {total}
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="bg-white/8 p-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
            Food Orders
          </p>
          <p className="mt-1 text-2xl font-serif font-medium">{activeOrderCount}</p>
        </div>

        <div className="bg-white/8 p-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
            Services
          </p>
          <p className="mt-1 text-2xl font-serif font-medium">{activeRequestCount}</p>
        </div>
      </div>
    </Link>
    </GuestPressable>
  );
}

function RecommendedCard({
  href,
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <GuestPressable>
      <Link
        href={href}
        className="group flex items-center gap-4 border border-white/10 bg-white/8 p-4 text-white backdrop-blur transition hover:border-gold/50 hover:bg-gold/10"
      >
      <span className="grid size-12 shrink-0 place-items-center bg-gold/20 text-gold">
        <Icon className="size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-widest text-gold">
          {eyebrow}
        </span>

        <span className="mt-1 block line-clamp-2 text-[15px] font-serif font-medium leading-tight tracking-wide">
          {title}
        </span>

        <span className="mt-0.5 block line-clamp-1 text-xs font-medium text-white/50">
          {description}
        </span>
      </span>

      <ChevronRight className="size-5 shrink-0 text-white/25 transition group-hover:translate-x-1 group-hover:text-gold" />
    </Link>
    </GuestPressable>
  );
}

function getHotelInitials(hotelName: string) {
  const words = hotelName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return 'H';
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

function DynamicHotelLogo({ hotelName }: { hotelName: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="grid size-16 place-items-center border border-gold/50 bg-black/35 text-2xl font-serif font-medium tracking-wide text-gold backdrop-blur-md">
        {getHotelInitials(hotelName)}
      </div>

      <p className="mt-4 max-w-[300px] text-center text-sm font-serif uppercase leading-5 tracking-[0.2em] text-white drop-shadow-[0_3px_16px_rgba(0,0,0,0.9)]">
        {hotelName}
      </p>

      <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-gold/80">
        Guest Portal
      </p>
    </div>
  );
}

export default async function GuestHome({ params }: GuestHomeProps) {
  const { tagCode } = await params;
  const normalizedTagCode = tagCode?.trim();

  if (!normalizedTagCode) {
    notFound();
  }

  const tag = await db.nfcTag.findUnique({
    where: {
      code: normalizedTagCode,
    },
    select: {
      status: true,
      label: true,

      hotel: {
        include: {
          settings: true,
        },
      },

      room: {
        select: {
          number: true,
        },
      },

      location: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!tag || tag.status !== 'ACTIVE') {
    notFound();
  }

  const activity = await getGuestPortalActivity(normalizedTagCode);

  const greeting = getGuestGreeting();

  const locationName = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  const guestDisplayName = activity.guestName || 'Guest';

  const activeActivityCount =
    activity.currentActiveOrderCount +
    activity.currentActiveServiceRequestCount;

  const heroImage =
    tag.hotel.settings?.guestPortalHeroImageUrl?.trim() || fallbackResortImage;

  const wifiName = tag.hotel.settings?.wifiName || 'Ask front desk';

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto min-h-screen max-w-md bg-[#050505]">
        <section className="relative overflow-hidden px-5 pb-6 pt-7">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImage})` }}
          />

          <GuestAnimatedBackground />
          <GuestShimmer />

          <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/70 to-[#050505]" />
          <div className="absolute inset-y-0 left-0 w-3/4 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent" />

          <GuestReveal delay={0.05} className="relative z-10 flex justify-center pt-2">
              <DynamicHotelLogo hotelName={tag.hotel.name} />

              <Link
                href={`/t/${normalizedTagCode}/activity`}
                className="absolute right-0 top-3 grid size-11 place-items-center border border-white/10 bg-black/35 text-white backdrop-blur transition hover:bg-white/10"
                aria-label="Guest activity"
              >
                <Bell className="size-5" />

                {activeActivityCount > 0 ? (
                  <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center bg-gold px-1.5 py-0.5 text-[10px] font-semibold text-black">
                    {activeActivityCount}
                  </span>
                ) : null}
              </Link>
            </GuestReveal>
          <GuestReveal delay={0.14} className="relative z-10 pt-24">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
              {greeting}
            </p>

            {/* Added break-words, text-balance, and scaled font dynamically. Lowercased to force proper capitalize. */}
            <h1 className="mt-3 max-w-[280px] break-words font-serif text-4xl font-light capitalize leading-[1.05] tracking-wide text-white text-balance drop-shadow-md sm:text-5xl">
              {guestDisplayName.toLowerCase()}
            </h1>

            {/*
              CP-1. "Welcome to <hotel>. Everything you need during your stay is
              just one tap away." sat under the hotel's name on a screen whose
              whole content is the things you can tap. The sentence that
              remains tells the guest something only this screen knows.
            */}
            <p className="mt-4 max-w-xs text-sm font-medium leading-6 text-white/70">
              You are at {locationName}.
            </p>
          </GuestReveal>

          <GuestReveal delay={0.24} className="relative z-10 mt-6 grid grid-cols-2 gap-3">
            <StayInfoCard icon={KeyRound} label="Location" value={locationName} />
            <StayInfoCard icon={Wifi} label="Wi-Fi" value={wifiName} />
          </GuestReveal>
        </section>

        <GuestReveal delay={0.12} className="px-5 pt-6">
          {/* An eyebrow reading "Guest Concierge" above a question that asks the same thing. */}
          <h2 className="mb-4 font-serif text-2xl font-normal text-white">
            What would you like to do?
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <PrimaryActionCard
              href={`/t/${normalizedTagCode}/menu`}
              icon={ShoppingBag}
              title="Order Food"
              description="Browse menu and order room service."
              gold
            />

            <PrimaryActionCard
              href={`/t/${normalizedTagCode}/service`}
              icon={ConciergeBell}
              title="Request Service"
              description="Ask for towels, cleaning, help, and more."
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <MiniActionCard
              href={`/t/${normalizedTagCode}/guide`}
              icon={Map}
              title="Hotel Guide"
            />

            <MiniActionCard
              href={`/t/${normalizedTagCode}/pool`}
              icon={Waves}
              title="Pool"
            />

            <MiniActionCard
              href={`/t/${normalizedTagCode}/contact`}
              icon={Phone}
              title="Contact"
            />
          </div>
        </GuestReveal>

        <GuestReveal delay={0.18} className="px-5 pt-6">
          <ActivityCard
            href={`/t/${normalizedTagCode}/activity`}
            activeOrderCount={activity.currentActiveOrderCount}
            activeRequestCount={activity.currentActiveServiceRequestCount}
          />
        </GuestReveal>

        <GuestReveal delay={0.24} className="px-5 pt-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Recommended
            </p>
            <h2 className="mt-1 text-2xl font-serif font-normal text-white tracking-wide">
              Helpful during your stay
            </h2>
          </div>

          <div className="grid gap-3">
            <RecommendedCard
              href={`/t/${normalizedTagCode}/guide`}
              icon={Wifi}
              eyebrow="Essentials"
              title="Wi-Fi, check-in, & policies"
              description="Quickly find the most requested hotel information."
            />

            <RecommendedCard
              href={`/t/${normalizedTagCode}/pool`}
              icon={Waves}
              eyebrow="Leisure"
              title="Pool Guide"
              description="Hours, rules, poolside service, and assistance."
            />

            <RecommendedCard
              href={`/t/${normalizedTagCode}/rewards`}
              icon={Gift}
              eyebrow="Rewards"
              title="Claim points from your stay"
              description="Earn points from visits, orders, and completed requests."
            />

            <RecommendedCard
              href={`/t/${normalizedTagCode}/contact`}
              icon={Hotel}
              eyebrow="Support"
              title="Need staff assistance?"
              description="Contact front desk or send a service request."
            />
          </div>
        </GuestReveal>

        <GuestReveal delay={0.3} className="px-5 pb-32 pt-6">
          <div className="border border-gold/25 bg-gold p-5 text-black">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center bg-black/10">
                <ShieldCheck className="size-6" />
              </span>

              <div>
                <p className="text-2xl font-serif font-normal">One tap guest portal</p>
                <p className="mt-1 text-sm font-medium leading-6 text-black/75">
                  No app install needed. Scan, browse, order, request, and enjoy
                  your stay.
                </p>

                <Link
                  href={`/t/${normalizedTagCode}/guide`}
                  className="mt-4 inline-flex min-h-11 items-center bg-black px-5 py-3 text-sm font-semibold tracking-wide text-white"
                >
                  Explore Hotel Guide
                </Link>
              </div>
            </div>
          </div>
        </GuestReveal>
      </div>

      <GuestBottomNav tagCode={normalizedTagCode} active="home" dark />
    </main>
  );
}