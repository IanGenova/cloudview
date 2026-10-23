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
import { getGuestContact } from '@/lib/guest-contact';
import {
  GuestPressable,
  GuestReveal,
} from './GuestPortalMotion';

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
      {/*
        Each of these was a bordered, filled, blurred box carrying an icon in
        its own gold plate, a chevron, a tracked-caps label and a sentence —
        four pieces of furniture around one destination, five times over. A
        guest choosing where to go does not need a diagram of the choice.
        What is left is the name, set properly, and one line saying what it
        is for; the rule above each replaces the box around it.
      */}
      <Link
        href={href}
        /*
          The primary action was a flat mustard rectangle — the loudest thing
          on the screen, and once everything around it had quietened down,
          jarring rather than inviting. The original brief put it plainly:
          gold is a line, a rule or one word, never a filled surface.

          It is still unmistakably first — it keeps the only coloured rule on
          the screen, the only warm wash, and the only white title at full
          strength — without being a slab of paint.
        */
        className={
          gold
            ? 'group flex h-full flex-col border-t-2 border-gold bg-gold/[0.07] p-5 text-white transition hover:bg-gold/[0.12]'
            : 'group flex h-full flex-col border-t border-white/15 p-5 pl-0 text-white transition hover:border-white/40'
        }
      >
      <div className="flex items-start justify-between gap-3">
        <span className={gold ? 'text-gold' : 'text-white/45'}>
          <Icon className="size-5" strokeWidth={1.5} />
        </span>

        <ChevronRight
          className={
            gold
              ? 'size-4 text-gold/60 transition group-hover:translate-x-1'
              : 'size-4 text-white/25 transition group-hover:translate-x-1'
          }
        />
      </div>

      <p className="mt-5 font-serif text-[19px] font-normal leading-tight tracking-wide text-white">
        {title}
      </p>

      {/* The supporting line steps down properly instead of matching the name. */}
      <p
        className={
          gold
            ? 'mt-2 text-sm font-medium leading-5 text-white/75'
            : 'mt-2 text-sm font-medium leading-5 text-white/65'
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
        className="group flex min-h-24 flex-col justify-between border-t border-white/15 py-4 pr-4 text-white transition hover:border-white/40"
      >
      <div className="flex items-center justify-between">
        <span className="text-white/40">
          <Icon className="size-5" strokeWidth={1.5} />
        </span>

        <ChevronRight className="size-4 text-white/20 transition group-hover:translate-x-1" />
      </div>

      <p className="mt-4 line-clamp-2 font-serif text-[17px] font-normal leading-tight tracking-wide">{title}</p>
    </Link>
    </GuestPressable>
  );
}

/*
 * Two of these sat side by side as bordered, filled, backdrop-blurred boxes,
 * each with a gold icon tile — four containers and two gold marks to tell a
 * guest two short facts. They are facts, so they are set as facts: a label
 * and a value, on the photograph, with nothing drawn around them.
 */
function StayFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/75">
        {label}
      </p>
      <p className="mt-1.5 line-clamp-2 font-serif text-[17px] font-normal leading-tight tracking-wide text-white">
        {value}
      </p>
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

/*
 * A boxed gold monogram floated in the middle of the hotel's own photograph,
 * with the hotel's name under it and the words "Guest Portal" under that —
 * three pieces of branding stacked over the building they are branding, and
 * one of them naming the software rather than the hotel. A guest reading this
 * is standing inside the place; they do not need to be told whose portal it
 * is, and the photograph is the identity.
 *
 * What is left is the name, small, in the tracked caps a hotel would set it
 * in, at the top of the frame where a masthead belongs.
 */
function DynamicHotelLogo({ hotelName }: { hotelName: string }) {
  return (
    <p className="max-w-[300px] text-sm font-serif uppercase leading-5 tracking-[0.28em] text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
      {hotelName}
    </p>
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
      tagType: true,

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
          type: true,
          description: true,
          heroImageUrl: true,
        },
      },
    },
  });

  if (!tag || tag.status !== 'ACTIVE') {
    notFound();
  }

  const rewardNow = new Date();
  const [activity, availableRewardCount] = await Promise.all([
    getGuestPortalActivity(normalizedTagCode),
    db.reward.count({
      where: {
        hotelId: tag.hotel.id,
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: rewardNow } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: rewardNow } }] },
        ],
      },
    }),
  ]);
  const { phone: guestPhone, email: guestEmail } = getGuestContact(tag.hotel.settings);

  const greeting = getGuestGreeting();

  const locationName = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  const isPublicLocation = !tag.room;
  const isPoolLocation =
    tag.location?.type === 'POOL' || tag.tagType === 'POOL';
  const heroTitle = isPublicLocation
    ? isPoolLocation
      ? 'Welcome to the Pool Deck'
      : `Welcome to ${locationName}`
    : activity.guestName
      ? `Welcome, ${activity.guestName}`
      : 'Welcome to your room';
  const heroDescription = isPublicLocation
    ? tag.location?.description?.trim() ||
      (isPoolLocation
        ? 'Relax by the water. Order refreshments or ask our team for anything you need.'
        : 'Explore the hotel and request service from this location.')
    : 'Everything you need for a comfortable stay is one tap away.';

  const activeActivityCount =
    activity.currentActiveOrderCount +
    activity.currentActiveServiceRequestCount;

  const heroImage = isPublicLocation
    ? tag.location?.heroImageUrl?.trim() ||
      (tag.hotel.slug === 'cloud-view-demo' && isPoolLocation
        ? '/cloudview/demo/pool-deck.webp'
        : null)
    : tag.hotel.settings?.guestPortalHeroImageUrl?.trim() || null;

  const wifiName = tag.hotel.settings?.wifiName?.trim();

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto min-h-screen max-w-md bg-[#050505]">
        {/*
          The hotel's own photograph was under three stacked black gradients —
          90% from the top, 80% from the left, and a 256px wash from the
          bottom — plus an animated background and a shimmer. It was not a
          dark photograph; it was a good one buried. On a screen whose whole
          job is to feel like somewhere worth staying, the picture of the
          place is the most expensive thing available and it was the least
          visible.

          One scrim now, weighted to the bottom where the type sits, and the
          hero is tall enough to be a photograph rather than a letterbox. The
          animation and the shimmer are gone: motion over a still photograph
          reads as a screensaver, not as luxury.
        */}
        <section className="relative flex min-h-[350px] flex-col justify-end overflow-hidden px-5 pb-6 pt-7 sm:min-h-[400px]">
          <div
            className="absolute inset-0 bg-[radial-gradient(circle_at_60%_20%,#55452d_0%,#171a1b_45%,#070707_100%)] bg-cover bg-center"
            style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
          />

          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/70 to-black/15" />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" />

          <GuestReveal delay={0.05} className="relative z-10 mb-auto flex items-start justify-between pt-2">
              <DynamicHotelLogo hotelName={tag.hotel.name} />

              <Link
                href={`/t/${normalizedTagCode}/activity`}
                className="grid size-11 shrink-0 place-items-center text-white/80 transition hover:text-white"
                aria-label="Guest activity"
              >
                <Bell className="size-5" />

                {/*
                  A filled gold square with a number in it, top-right, was
                  competing with the hotel's name for the first thing seen. A
                  guest with one thing in progress does not need it counted at
                  them from the masthead — they need to know there is
                  something. A dot says that.
                */}
                {activeActivityCount > 0 ? (
                  <span
                    className="absolute right-2 top-2 size-1.5 rounded-dot bg-gold"
                    aria-label={`${activeActivityCount} in progress`}
                  />
                ) : null}
              </Link>
            </GuestReveal>
          <GuestReveal delay={0.14} className="relative z-10 pt-20">
            {/*
              Gold appeared thirteen times on this screen: the greeting, the
              logo, two icon tiles, two tile labels, the chevrons, a filled
              tile, the badge and the navigation. Thirteen uses is not an
              accent, it is a theme colour, and gold as a theme colour is the
              most reliable signal of imitation luxury there is. It is kept
              for one thing per screen — here, the single action a guest is
              most likely to want — and everything else is the white ramp.
            */}
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/85">
              {greeting}
            </p>

            {/*
              Bigger, because the hero is now tall enough to carry it and
              because a guest's own name is the one thing on this screen that
              is about them. The type scale had eight steps between 9px and
              24px, which is a lot of sizes saying nothing in particular; this
              is the top of a shorter scale with real distance in it.

              The sentence that stood here — "You are at Pool Deck." — said
              exactly what the Location fact two lines below says.
            */}
            <h1 className="mt-3 max-w-[390px] break-words font-serif text-[2.6rem] font-light leading-[1.05] tracking-tight text-white text-balance sm:text-5xl">
              {heroTitle}
            </h1>
            <p className="mt-3 max-w-[350px] text-sm leading-6 text-white/85">
              {heroDescription}
            </p>
          </GuestReveal>

          <GuestReveal delay={0.24} className="relative z-10 mt-6 grid grid-cols-2 gap-6 border-t border-white/35 pt-4">
            <StayFact
              label={isPoolLocation ? 'Pool hours' : 'Location'}
              value={isPoolLocation ? tag.hotel.settings?.poolHours || 'Ask our team' : locationName}
            />
            {wifiName ? <StayFact label="Wi-Fi" value={wifiName} /> : null}
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
              description={tag.room
                ? 'Browse the menu and order to your room.'
                : 'Enjoy a meal here or pick up at the counter.'}
              gold
            />

            <PrimaryActionCard
              href={`/t/${normalizedTagCode}/service`}
              icon={ConciergeBell}
              title="Request Service"
              description={tag.room
                ? 'Ask for towels, cleaning, help, and more.'
                : 'Ask for towels, water, or help here.'}
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
              {tag.room ? 'Helpful during your stay' : 'Helpful while you are here'}
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
              title={availableRewardCount > 0 ? (tag.room ? 'Claim points from your stay' : 'Claim points from your visit') : 'Keep your points together'}
              description={availableRewardCount > 0 ? 'Earn points and explore available rewards.' : 'Save eligible points while the hotel prepares reward offers.'}
            />

            <RecommendedCard
              href={`/t/${normalizedTagCode}/contact`}
              icon={Hotel}
              eyebrow="Support"
              title="Need staff assistance?"
              description={guestPhone || guestEmail ? 'Contact front desk or send a service request.' : 'Send a request to the hotel team.'}
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
                  your visit.
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
