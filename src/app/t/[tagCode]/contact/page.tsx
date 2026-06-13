import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight,
  Gift,
  HelpCircle,
  Mail,
  MessageCircle,
  Phone,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import {
  GuestBottomNav,
  GuestLogo,
  GuestShell,
} from '@/components/guest/GuestShell';
import { db } from '@/lib/db';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { resolveGuestMemberIdForCurrentNfcSession } from '@/lib/nfc-rewards';

export const dynamic = 'force-dynamic';

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

function pointLabel(points: number) {
  return `${points} point${points === 1 ? '' : 's'}`;
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{
    tagCode: string;
  }>;
}) {
  const { tagCode } = await params;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag || tag.status !== 'ACTIVE') {
    notFound();
  }

  const guestMemberId = await resolveGuestMemberIdForCurrentNfcSession(tagCode);

  const guestMember = guestMemberId
    ? await db.guestMember.findFirst({
        where: {
          id: guestMemberId,
          hotelId: tag.hotelId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          pointAccount: {
            select: {
              availablePoints: true,
              pendingPoints: true,
              lifetimeEarnedPoints: true,
              lifetimeRedeemedPoints: true,
            },
          },
        },
      })
    : null;

  const greeting = getGuestGreeting();

  const phone = tag.hotel.settings?.contactPhone;
  const email = tag.hotel.settings?.contactEmail;

  const location = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  const guestDisplayName = guestMember?.name?.trim() || 'Guest';
  const availablePoints = guestMember?.pointAccount?.availablePoints ?? 0;
  const pendingPoints = guestMember?.pointAccount?.pendingPoints ?? 0;
  const lifetimeEarnedPoints =
    guestMember?.pointAccount?.lifetimeEarnedPoints ?? 0;

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title="Profile"
        subtitle={location}
        variant="dark"
        showTopBar={false}
      >
        <div className="pt-8">
          <div className="flex justify-center">
            <GuestLogo hotel={tag.hotel} className="text-gold" />
          </div>

          <div className="mt-12">
            <p className="font-serif text-3xl leading-tight text-sand">
              {greeting},
            </p>

            <h1 className="font-serif text-4xl leading-tight text-sand">
              {guestDisplayName}
            </h1>

            <p className="mt-3 max-w-xs text-sm text-white/70">
              Thank you for choosing {tag.hotel.name}.
            </p>
          </div>

          <RewardsProfileCard
            isLinked={Boolean(guestMember)}
            availablePoints={availablePoints}
            pendingPoints={pendingPoints}
            lifetimeEarnedPoints={lifetimeEarnedPoints}
            rewardsHref={`/t/${tagCode}/rewards`}
          />

          <div className="mt-8 space-y-2">
            <ProfileLink
              href={`/t/${tagCode}/orders`}
              icon={ShoppingBag}
              label="My Orders"
            />

            <ProfileLink
              href={`/t/${tagCode}/requests`}
              icon={MessageCircle}
              label="My Requests"
            />

            <ProfileLink
              href={`/t/${tagCode}/rewards`}
              icon={Gift}
              label={
                guestMember
                  ? `My Rewards · ${pointLabel(availablePoints)}`
                  : 'Claim Rewards'
              }
            />

            {phone ? (
              <ProfileLink
                href={`tel:${phone}`}
                icon={Phone}
                label={`Call ${phone}`}
              />
            ) : null}

            {email ? (
              <ProfileLink
                href={`mailto:${email}`}
                icon={Mail}
                label={`Email ${email}`}
              />
            ) : null}

            <ProfileLink
              href={`/t/${tagCode}/support`}
              icon={HelpCircle}
              label="Help & Support"
            />
          </div>

          <Link
            href={`/t/${tagCode}`}
            className="mt-10 block rounded-2xl bg-white/8 p-4 text-center font-black text-sand"
          >
            Back to Home
          </Link>
        </div>
      </GuestShell>

      <GuestBottomNav tagCode={tagCode} active="profile" dark />
    </>
  );
}

function RewardsProfileCard({
  isLinked,
  availablePoints,
  pendingPoints,
  lifetimeEarnedPoints,
  rewardsHref,
}: {
  isLinked: boolean;
  availablePoints: number;
  pendingPoints: number;
  lifetimeEarnedPoints: number;
  rewardsHref: string;
}) {
  if (!isLinked) {
    return (
      <Link
        href={rewardsHref}
        className="mt-8 block rounded-[1.75rem] border border-gold/20 bg-gold/10 p-4 text-white shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold text-black">
            <Gift className="size-5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-gold">
              CloudView Rewards
            </p>

            <p className="mt-1 text-lg font-black text-white">
              Claim your guest rewards
            </p>

            <p className="mt-1 text-xs font-semibold leading-5 text-white/55">
              Add your name and contact details to start earning points from NFC
              taps, completed requests, and eligible orders.
            </p>
          </div>

          <ChevronRight className="mt-3 size-5 shrink-0 text-gold" />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={rewardsHref}
      className="mt-8 block rounded-[1.75rem] border border-gold/25 bg-white/[0.06] p-4 text-white shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-gold">
            <Sparkles className="size-4" />
            CloudView Rewards
          </p>

          <p className="mt-2 text-sm font-bold text-white/55">
            Available Points
          </p>

          <p className="mt-1 text-4xl font-black text-sand">
            {availablePoints}
          </p>
        </div>

        <div className="grid size-14 place-items-center rounded-2xl bg-gold text-black">
          <Gift className="size-6" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-black/25 p-3">
          <p className="text-[10px] font-black uppercase text-white/35">
            Pending
          </p>
          <p className="mt-1 text-sm font-black text-white">
            {pointLabel(pendingPoints)}
          </p>
        </div>

        <div className="rounded-2xl bg-black/25 p-3">
          <p className="text-[10px] font-black uppercase text-white/35">
            Lifetime Earned
          </p>
          <p className="mt-1 text-sm font-black text-white">
            {pointLabel(lifetimeEarnedPoints)}
          </p>
        </div>
      </div>
    </Link>
  );
}

function ProfileLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="grid grid-cols-[28px_1fr_24px] items-center gap-2 rounded-2xl px-2 py-3 text-sm text-white/85 hover:bg-white/5"
    >
      <Icon className="size-5 text-white/70" />
      <span className="font-bold">{label}</span>
      <ChevronRight className="size-5 text-white/40" />
    </Link>
  );
}