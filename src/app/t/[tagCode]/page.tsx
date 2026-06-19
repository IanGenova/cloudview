import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Bell,
  ConciergeBell,
  Hotel,
  KeyRound,
  Map,
  ReceiptText,
  ShoppingBag,
  Waves,
  Wifi,
} from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestLogo } from '@/components/guest/GuestShell';
import { QuickAction } from '@/components/guest/QuickAction';
import { getGuestPortalActivity } from '@/lib/guest-portal-activity';

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

  const guestGreeting = tag.room ? `Room ${tag.room.number}` : locationName;

  const guestDisplayName = activity.guestName || 'Guest';

  const activeActivityCount =
    activity.currentActiveOrderCount +
    activity.currentActiveServiceRequestCount;

  const heroImage =
    tag.hotel.settings?.guestPortalHeroImageUrl?.trim() || fallbackResortImage;

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto min-h-screen max-w-md bg-black shadow-soft">
        <section className="relative min-h-[58vh] overflow-hidden rounded-b-[2.5rem] px-5 pb-7 pt-10">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImage})` }}
          />

          <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/30 to-black" />

          <Link
            href={`/t/${normalizedTagCode}/activity`}
            className="absolute right-5 top-10 z-20 grid size-10 place-items-center rounded-full bg-black/30 backdrop-blur"
            aria-label="Guest activity"
          >
            <Bell className="size-5" />
          </Link>

          <div className="relative z-10 flex justify-center pt-3">
            <div className="scale-[1.45]">
              <GuestLogo hotel={tag.hotel} />
            </div>
          </div>

          <div className="relative z-10 mt-24">
            <p className="font-serif text-3xl leading-tight text-white">
              {greeting},
            </p>

            <h1 className="font-serif text-4xl leading-tight text-white">
              {guestDisplayName}
            </h1>

            <p className="mt-3 max-w-xs text-sm text-white/80">
              We’re delighted to have you with us.
            </p>
          </div>

          <div className="relative z-10 mt-7 grid grid-cols-2 gap-3 rounded-[1.75rem] bg-black/35 p-3 backdrop-blur-md">
            <div>
              <p className="text-[11px] text-white/50">Location</p>
              <p className="mt-1 font-black">{guestGreeting}</p>
            </div>

            <div>
              <p className="text-[11px] text-white/50">Wi-Fi</p>
              <p className="mt-1 truncate font-black">
                {tag.hotel.settings?.wifiName ?? 'Ask front desk'}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-4 gap-3 px-5 py-6">
          <QuickAction
            compact
            href={`/t/${normalizedTagCode}/menu`}
            icon={ShoppingBag}
            title="Order Food"
            description=""
          />

          <QuickAction
            compact
            href={`/t/${normalizedTagCode}/pool`}
            icon={Waves}
            title="Pool"
            description=""
          />

          <QuickAction
            compact
            href={`/t/${normalizedTagCode}/service`}
            icon={ConciergeBell}
            title="Request Service"
            description=""
          />

          <QuickAction
            compact
            href={`/t/${normalizedTagCode}/guide`}
            icon={Map}
            title="Hotel Guide"
            description=""
          />
        </section>

        <section className="px-5 pb-32">
          <div className="rounded-[2rem] bg-white/6 p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-gold/20 text-gold">
                <KeyRound className="size-5" />
              </span>

              <div>
                <h2 className="font-black">One tap guest portal</h2>
                <p className="text-xs text-white/50">No app install needed</p>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-white/70">
              <Link
                href={`/t/${normalizedTagCode}/activity`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[#c99c38]/25 bg-[#11100b] p-4 text-white"
              >
                <span className="flex items-center gap-3">
                  <ReceiptText className="size-4 text-gold" />
                  <span>
                    <span className="block font-black">My Activity</span>
                    <span className="mt-0.5 block text-xs text-white/50">
                      Orders, requests, and past activity
                    </span>
                  </span>
                </span>

                {activeActivityCount > 0 ? (
                  <span className="grid min-w-7 place-items-center rounded-full bg-gold px-2 py-1 text-xs font-black text-black">
                    {activeActivityCount}
                  </span>
                ) : null}
              </Link>

              <Link
                href={`/t/${normalizedTagCode}/guide`}
                className="flex items-center gap-3 rounded-2xl bg-white/5 p-3"
              >
                <Wifi className="size-4 text-gold" />
                Wi-Fi, policies, check-in and check-out
              </Link>

              <Link
                href={`/t/${normalizedTagCode}/contact`}
                className="flex items-center gap-3 rounded-2xl bg-white/5 p-3"
              >
                <Hotel className="size-4 text-gold" />
                Contact staff and front desk support
              </Link>

              <Link
                href={`/t/${normalizedTagCode}/rewards`}
                className="rounded-3xl border border-[#c99c38]/25 bg-[#11100b] p-5 text-white shadow-xl"
              >
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#c99c38]">
                  CloudView Rewards
                </p>
                <p className="mt-2 text-xl font-black">
                  Claim points from your stay
                </p>
                <p className="mt-1 text-sm font-semibold text-white/60">
                  Earn points from NFC visits, orders, and completed requests.
                </p>
              </Link>
            </div>
          </div>
        </section>
      </div>

      <GuestBottomNav tagCode={normalizedTagCode} active="home" dark />
    </main>
  );
}