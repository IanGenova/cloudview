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
  GuestPressable,
  GuestReveal,
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
            ? 'mt-2 text-[13px] font-medium leading-5 text-white/65'
            : 'mt-2 text-[13px] font-medium leading-5 text-white/50'
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
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">
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
        <section className="relative flex min-h-[62vh] flex-col justify-end overflow-hidden px-5 pb-8 pt-7">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImage})` }}
          />

          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/55 to-transparent" />
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
          <GuestReveal delay={0.14} className="relative z-10 pt-24">
            {/*
              Gold appeared thirteen times on this screen: the greeting, the
              logo, two icon tiles, two tile labels, the chevrons, a filled
              tile, the badge and the navigation. Thirteen uses is not an
              accent, it is a theme colour, and gold as a theme colour is the
              most reliable signal of imitation luxury there is. It is kept
              for one thing per screen — here, the single action a guest is
              most likely to want — and everything else is the white ramp.
            */}
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/50">
              {greeting}
            </p>

            {/* Added break-words, text-balance, and scaled font dynamically. Lowercased to force proper capitalize. */}
            {/*
              Bigger, because the hero is now tall enough to carry it and
              because a guest's own name is the one thing on this screen that
              is about them. The type scale had eight steps between 9px and
              24px, which is a lot of sizes saying nothing in particular; this
              is the top of a shorter scale with real distance in it.

              The sentence that stood here — "You are at Pool Deck." — said
              exactly what the Location fact two lines below says.
            */}
            <h1 className="mt-4 max-w-[300px] break-words font-serif text-[2.75rem] font-light capitalize leading-[1.02] tracking-tight text-white text-balance sm:text-6xl">
              {guestDisplayName.toLowerCase()}
            </h1>
          </GuestReveal>

          <GuestReveal delay={0.24} className="relative z-10 mt-10 grid grid-cols-2 gap-6">
            <StayFact label="Location" value={locationName} />
            <StayFact label="Wi-Fi" value={wifiName} />
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