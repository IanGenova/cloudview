import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Bell,
  ConciergeBell,
  Hotel,
  KeyRound,
  Map,
  ShoppingBag,
  Waves,
  Wifi,
} from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestLogo } from '@/components/guest/GuestShell';
import { QuickAction } from '@/components/guest/QuickAction';

const resortImage =
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

  if (!tagCode?.trim()) {
    notFound();
  }

  const tag = await db.nfcTag.findUnique({
    where: {
      code: tagCode.trim(),
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

  const greeting = getGuestGreeting();

  const locationName = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  const guestGreeting = tag.room ? `Room ${tag.room.number}` : locationName;

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto min-h-screen max-w-md bg-black shadow-soft">
        <section className="relative min-h-[58vh] overflow-hidden rounded-b-[2.5rem] px-5 pb-7 pt-10">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${resortImage})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/30 to-black" />

          <button
            className="absolute right-5 top-10 z-20 grid size-10 place-items-center rounded-full bg-black/30 backdrop-blur"
            aria-label="Notifications"
          >
            <Bell className="size-5" />
          </button>

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
              Guest
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
            href={`/t/${tagCode}/menu`}
            icon={ShoppingBag}
            title="Order Food"
            description=""
          />

          <QuickAction
            compact
            href={`/t/${tagCode}/pool`}
            icon={Waves}
            title="Pool & Amenities"
            description=""
          />

          <QuickAction
            compact
            href={`/t/${tagCode}/service`}
            icon={ConciergeBell}
            title="Request Service"
            description=""
          />

          <QuickAction
            compact
            href={`/t/${tagCode}/guide`}
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
                href={`/t/${tagCode}/guide`}
                className="flex items-center gap-3 rounded-2xl bg-white/5 p-3"
              >
                <Wifi className="size-4 text-gold" />
                Wi-Fi, policies, check-in and check-out
              </Link>

              <Link
                href={`/t/${tagCode}/contact`}
                className="flex items-center gap-3 rounded-2xl bg-white/5 p-3"
              >
                <Hotel className="size-4 text-gold" />
                Contact staff and front desk support
              </Link>
            </div>
          </div>
        </section>
      </div>

      <GuestBottomNav tagCode={tagCode} active="home" dark />
    </main>
  );
}