import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  ChevronRight,
  Crown,
  Gift,
  HelpCircle,
  Hotel,
  KeyRound,
  Mail,
  MessageCircle,
  Phone,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
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

  if (manilaHour >= 18 && manilaHour < 24) {
    return 'Good Evening';
  }

  return 'Good Night';
}

function pointLabel(points: number) {
  return `${points} point${points === 1 ? '' : 's'}`;
}

function getHotelInitials(hotelName: string) {
  const words = hotelName.trim().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return 'H';
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
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
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }

  if (isExternalHref(href)) {
    return (
      <a href={href} className={className}>
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

function LuxuryHotelMark({ hotelName }: { hotelName: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-[2rem] bg-gold/30 blur-2xl" />

        <div className="relative grid size-20 place-items-center rounded-[2rem] border border-gold/50 bg-[linear-gradient(145deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04))] text-2xl font-serif font-medium tracking-wide text-gold shadow-[0_22px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          {getHotelInitials(hotelName)}
        </div>

        <span className="absolute -right-2 -top-2 grid size-8 place-items-center rounded-full bg-gold text-black shadow-xl">
          <Crown className="size-4" />
        </span>
      </div>

      <p className="mt-5 max-w-[320px] text-center text-sm font-serif uppercase leading-5 tracking-[0.25em] text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.9)]">
        {hotelName}
      </p>

      <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-gold/80">
        Private Guest Profile
      </p>
    </div>
  );
}

function LuxuryInfoPill({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.07] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold/20 text-gold">
          <Icon className="size-5" />
        </span>

        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
            {label}
          </p>

          {/* Replaced truncate with line-clamp-2 to prevent aggressive clipping */}
          <p className="mt-1 line-clamp-2 text-sm font-serif font-medium leading-tight tracking-wide text-white">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
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
  const lifetimeRedeemedPoints =
    guestMember?.pointAccount?.lifetimeRedeemedPoints ?? 0;

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title="Profile"
        subtitle={location}
        variant="dark"
        showTopBar={false}
      >
        <div className="-mx-5 -mt-4 min-h-screen overflow-hidden bg-[#030303] px-5 pb-32 pt-8 text-white">
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(214,167,56,0.24),_transparent_32%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_22%),linear-gradient(180deg,#050505,#080806_42%,#030303)]" />

          <div className="relative z-10">
            <section className="relative overflow-hidden rounded-[2.6rem] border border-gold/25 bg-[#0b0905] shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(214,167,56,0.28),transparent_42%)]" />
              <div className="absolute -right-20 -top-20 size-64 rounded-full bg-gold/20 blur-3xl" />
              <div className="absolute -bottom-28 left-6 size-72 rounded-full bg-white/5 blur-3xl" />

              <div className="relative z-10 p-6">
                <LuxuryHotelMark hotelName={tag.hotel.name} />

                <div className="mt-10 rounded-[2.25rem] border border-white/10 bg-black/35 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
                  <p className="inline-flex items-center gap-2 rounded-full bg-gold px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-black">
                    <Sparkles className="size-3.5" />
                    {greeting}
                  </p>

                  {/* Added break-words, text-balance, and scaled font dynamically. Lowercased to force proper capitalize. */}
                  <h1 className="mt-4 break-words font-serif text-3xl font-light capitalize leading-[1.1] tracking-wide text-white text-balance drop-shadow-[0_8px_30px_rgba(0,0,0,0.9)] sm:text-4xl">
                    {guestDisplayName.toLowerCase()}
                  </h1>

                  <p className="mt-4 text-sm font-medium leading-7 text-white/70">
                    Welcome to your private guest profile. Manage your stay,
                    rewards, orders, requests, and front desk support in one
                    elegant space.
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <LuxuryInfoPill
                      icon={KeyRound}
                      label="Location"
                      value={location}
                    />

                    <LuxuryInfoPill
                      icon={BadgeCheck}
                      label="Access"
                      value="Active Guest"
                    />
                  </div>
                </div>
              </div>
            </section>

            <RewardsProfileCard
              isLinked={Boolean(guestMember)}
              availablePoints={availablePoints}
              pendingPoints={pendingPoints}
              lifetimeEarnedPoints={lifetimeEarnedPoints}
              lifetimeRedeemedPoints={lifetimeRedeemedPoints}
              rewardsHref={`/t/${tagCode}/rewards`}
            />

            <section className="mt-7">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                  Personal Concierge
                </p>

                <h2 className="mt-2 font-serif text-3xl font-normal text-white">
                  Your stay, at a glance
                </h2>

                <p className="mt-1 text-sm font-medium leading-6 text-white/60">
                  Fast access to your orders, requests, rewards, and guest
                  assistance.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ProfileActionCard
                  href={`/t/${tagCode}/orders`}
                  icon={ShoppingBag}
                  title="My Orders"
                  description="Food order history"
                />

                <ProfileActionCard
                  href={`/t/${tagCode}/requests`}
                  icon={MessageCircle}
                  title="My Requests"
                  description="Service request history"
                />

                <ProfileActionCard
                  href={`/t/${tagCode}/rewards`}
                  icon={Gift}
                  title="Rewards"
                  description={
                    guestMember
                      ? `${pointLabel(availablePoints)} available`
                      : 'Claim guest rewards'
                  }
                  gold
                />

                <ProfileActionCard
                  href={`/t/${tagCode}/support`}
                  icon={HelpCircle}
                  title="Help"
                  description="Support and assistance"
                />
              </div>
            </section>

            <section className="mt-7 overflow-hidden rounded-[2.25rem] border border-white/10 bg-white/[0.07] shadow-[0_24px_70px_rgba(0,0,0,0.3)] backdrop-blur-xl">
              <div className="border-b border-white/10 p-5">
                <div className="flex items-start gap-4">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gold/20 text-gold">
                    <Phone className="size-6" />
                  </span>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-gold">
                      Front Desk
                    </p>

                    <h2 className="mt-1 font-serif text-2xl font-normal tracking-wide text-white">
                      Need assistance?
                    </h2>

                    <p className="mt-1 text-sm font-medium leading-6 text-white/60">
                      Connect with the hotel team for guest support, requests,
                      and urgent concerns.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 p-4">
                {phone ? (
                  <ProfileLink
                    href={`tel:${phone}`}
                    icon={Phone}
                    label={`Call ${phone}`}
                    helper="Speak with the front desk"
                  />
                ) : null}

                {email ? (
                  <ProfileLink
                    href={`mailto:${email}`}
                    icon={Mail}
                    label={`Email ${email}`}
                    helper="Send a message to hotel staff"
                  />
                ) : null}

                {!phone && !email ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 p-6 text-center">
                    <Hotel className="mx-auto size-9 text-gold" />
                    <p className="mt-3 font-serif text-base font-medium tracking-wide text-white">
                      Contact details are not available yet.
                    </p>
                    <p className="mt-1 text-xs font-medium text-white/50">
                      Please approach the front desk for assistance.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="mt-7 rounded-[2.25rem] border border-gold/40 bg-[linear-gradient(145deg,#f6d77b,#d6a738,#9c6c18)] p-5 text-black shadow-[0_24px_70px_rgba(214,167,56,0.25)]">
              <div className="flex items-start gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-black/10">
                  <ShieldCheck className="size-7" />
                </span>

                <div>
                  <p className="font-serif text-2xl font-normal">One tap luxury access</p>

                  <p className="mt-2 text-sm font-medium leading-6 text-black/75">
                    Your orders, requests, rewards, and support options stay
                    available anytime during your visit.
                  </p>

                  <Link
                    href={`/t/${tagCode}`}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold tracking-wide text-white"
                  >
                    Back to Home
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>
            </section>
          </div>
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
  lifetimeRedeemedPoints,
  rewardsHref,
}: {
  isLinked: boolean;
  availablePoints: number;
  pendingPoints: number;
  lifetimeEarnedPoints: number;
  lifetimeRedeemedPoints: number;
  rewardsHref: string;
}) {
  if (!isLinked) {
    return (
      <Link
        href={rewardsHref}
        className="mt-7 block overflow-hidden rounded-[2.25rem] border border-gold/25 bg-[#11100b] text-white shadow-[0_24px_70px_rgba(0,0,0,0.32)]"
      >
        <div className="relative p-5">
          <div className="absolute -right-12 -top-12 size-44 rounded-full bg-gold/20 blur-3xl" />

          <div className="relative z-10 flex items-start gap-4">
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gold text-black shadow-xl">
              <Gift className="size-7" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-gold">
                CloudView Rewards
              </p>

              <p className="mt-1 font-serif text-2xl font-normal tracking-wide text-white">
                Claim your guest rewards
              </p>

              <p className="mt-2 text-sm font-medium leading-6 text-white/60">
                Add your name and contact details to start earning points from
                NFC taps, completed requests, and eligible orders.
              </p>
            </div>

            <ChevronRight className="mt-4 size-5 shrink-0 text-gold" />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={rewardsHref}
      className="mt-7 block overflow-hidden rounded-[2.35rem] border border-gold/30 bg-[#0b0905] text-white shadow-[0_28px_80px_rgba(0,0,0,0.48)]"
    >
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(214,167,56,0.35),transparent_40%)]" />

        <div className="relative z-10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gold">
                <Sparkles className="size-4" />
                CloudView Rewards
              </p>

              <p className="mt-3 text-sm font-medium tracking-wide text-white/60">
                Available Points
              </p>

              {/* Added sm:text-6xl for dynamic sizing on huge point counts */}
              <p className="mt-1 font-serif text-5xl font-light leading-none text-white sm:text-6xl">
                {availablePoints}
              </p>
            </div>

            <div className="grid size-18 place-items-center rounded-[1.5rem] bg-gold text-black shadow-xl">
              <Gift className="size-7" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-black/35 p-3">
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
                Pending
              </p>
              <p className="mt-1 font-serif text-base font-medium text-white">
                {pointLabel(pendingPoints)}
              </p>
            </div>

            <div className="rounded-2xl bg-black/35 p-3">
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
                Earned
              </p>
              <p className="mt-1 font-serif text-base font-medium text-white">
                {pointLabel(lifetimeEarnedPoints)}
              </p>
            </div>

            <div className="rounded-2xl bg-black/35 p-3">
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
                Redeemed
              </p>
              <p className="mt-1 font-serif text-base font-medium text-white">
                {pointLabel(lifetimeRedeemedPoints)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ProfileActionCard({
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
          ? 'group rounded-[1.75rem] bg-[linear-gradient(145deg,#f6d77b,#d6a738,#9c6c18)] p-4 text-black shadow-[0_18px_44px_rgba(214,167,56,0.24)] active:scale-[0.99]'
          : 'group rounded-[1.75rem] border border-white/10 bg-white/[0.07] p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition hover:border-gold/50 hover:bg-gold/10 active:scale-[0.99]'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={
            gold
              ? 'grid size-12 place-items-center rounded-2xl bg-black/10 text-black'
              : 'grid size-12 place-items-center rounded-2xl bg-gold/20 text-gold'
          }
        >
          <Icon className="size-6" />
        </span>

        <ArrowRight
          className={
            gold
              ? 'size-4 text-black/45 transition group-hover:translate-x-1'
              : 'size-4 text-gold transition group-hover:translate-x-1'
          }
        />
      </div>

      <p
        className={
          gold
            ? 'mt-4 font-serif text-[15px] font-medium tracking-wide text-black'
            : 'mt-4 font-serif text-[15px] font-medium tracking-wide text-white'
        }
      >
        {title}
      </p>

      <p
        className={
          gold
            ? 'mt-1 line-clamp-2 text-xs font-medium leading-5 text-black/70'
            : 'mt-1 line-clamp-2 text-xs font-medium leading-5 text-white/55'
        }
      >
        {description}
      </p>
    </SmartLink>
  );
}

function ProfileLink({
  href,
  icon: Icon,
  label,
  helper,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  helper?: string;
}) {
  return (
    <SmartLink
      href={href}
      className="grid grid-cols-[44px_1fr_24px] items-center gap-3 rounded-[1.5rem] border border-white/10 bg-black/25 px-3 py-3 text-sm text-white/85 transition hover:border-gold/50 hover:bg-gold/10"
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-white/[0.07] text-gold">
        <Icon className="size-5" />
      </span>

      <span className="min-w-0">
        <span className="block truncate font-serif text-[15px] font-medium tracking-wide">{label}</span>
        {helper ? (
          <span className="mt-0.5 block truncate text-xs font-medium text-white/50">
            {helper}
          </span>
        ) : null}
      </span>

      <ChevronRight className="size-5 text-white/35" />
    </SmartLink>
  );
}