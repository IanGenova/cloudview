import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
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
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import {
  GuestBottomNav,
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
    return 'Good morning';
  }

  if (manilaHour >= 12 && manilaHour < 18) {
    return 'Good afternoon';
  }

  if (manilaHour >= 18 && manilaHour < 24) {
    return 'Good evening';
  }

  return 'Good night';
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

function ProfileMeta({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
        <Icon className="size-4.5" />
      </span>

      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">
          {label}
        </p>
        <p className="mt-1 line-clamp-2 font-serif text-sm font-medium leading-tight tracking-wide text-white">
          {value}
        </p>
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

  const guestMemberId =
    await resolveGuestMemberIdForCurrentNfcSession(tagCode);

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
        <div className="-mx-5 -mt-4 min-h-screen overflow-hidden bg-[#030303] px-5 pb-36 pt-4 text-white">
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(214,167,56,0.18),transparent_30%),linear-gradient(180deg,#060604,#030303_58%)]" />

          <div className="relative z-10">
            <header className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
              <Link
                href={`/t/${tagCode}`}
                className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Back to guest portal"
              >
                <ArrowLeft className="size-5" />
              </Link>

              <div className="min-w-0 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold">
                  Private guest profile
                </p>
                <h1 className="mt-1 truncate font-serif text-xl font-normal tracking-wide text-white">
                  My Stay
                </h1>
              </div>

              <div className="grid size-11 place-items-center rounded-full border border-gold/20 bg-gold/10 text-gold">
                <UserRound className="size-5" />
              </div>
            </header>

            <section className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-[radial-gradient(circle_at_top_right,rgba(214,167,56,0.28),transparent_38%),linear-gradient(145deg,#17140d,#080807)] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.48)]">
              <div className="absolute -right-16 -top-20 size-56 rounded-full bg-gold/15 blur-3xl" />
              <div className="absolute -bottom-24 -left-16 size-56 rounded-full bg-white/[0.04] blur-3xl" />

              <div className="relative z-10">
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <div className="absolute inset-0 rounded-[1.6rem] bg-gold/30 blur-xl" />
                    <div className="relative grid size-16 place-items-center rounded-[1.6rem] border border-gold/45 bg-white/[0.08] font-serif text-xl font-medium tracking-wide text-gold backdrop-blur">
                      {getHotelInitials(tag.hotel.name)}
                    </div>
                    <span className="absolute -right-1.5 -top-1.5 grid size-7 place-items-center rounded-full bg-gold text-black shadow-lg">
                      <Crown className="size-3.5" />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-black uppercase tracking-[0.22em] text-gold">
                      {tag.hotel.name}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white/45">
                      {greeting}
                    </p>
                    <h2 className="mt-1 line-clamp-2 font-serif text-[1.75rem] font-normal leading-[1.05] tracking-wide text-white">
                      {guestDisplayName}
                    </h2>
                  </div>
                </div>

                <p className="mt-5 text-sm font-medium leading-6 text-white/55">
                  Everything for your stay, rewards, requests, and hotel
                  assistance—organized in one refined space.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <ProfileMeta
                    icon={KeyRound}
                    label="Stay location"
                    value={location}
                  />
                  <ProfileMeta
                    icon={BadgeCheck}
                    label="Guest access"
                    value="Active"
                  />
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
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold">
                    Personal concierge
                  </p>
                  <h2 className="mt-1 font-serif text-2xl font-normal tracking-wide text-white">
                    Your stay, simplified
                  </h2>
                </div>

                <Sparkles className="size-5 text-gold" />
              </div>

              <div className="space-y-3">
                <ProfileActionRow
                  href={`/t/${tagCode}/orders`}
                  icon={ShoppingBag}
                  title="My Orders"
                  description="Track food orders and view your order history."
                />

                <ProfileActionRow
                  href={`/t/${tagCode}/requests`}
                  icon={MessageCircle}
                  title="My Requests"
                  description="Follow service requests and room assistance."
                />

                <ProfileActionRow
                  href={`/t/${tagCode}/rewards`}
                  icon={Gift}
                  title="CloudView Rewards"
                  description={
                    guestMember
                      ? `${pointLabel(availablePoints)} ready to use`
                      : 'Connect your guest profile and start earning'
                  }
                  accent
                />

                <ProfileActionRow
                  href={`/t/${tagCode}/support`}
                  icon={HelpCircle}
                  title="Help & Support"
                  description="Find assistance for your stay."
                />
              </div>
            </section>

            <FrontDeskCard phone={phone} email={email} />

            <Link
              href={`/t/${tagCode}`}
              className="mt-6 flex min-h-14 items-center justify-between rounded-[1.5rem] border border-gold/25 bg-gold/10 px-5 text-sm font-black text-gold transition hover:bg-gold/15 active:scale-[0.99]"
            >
              <span className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-gold text-black">
                  <ShieldCheck className="size-5" />
                </span>
                Return to Guest Home
              </span>
              <ArrowRight className="size-4" />
            </Link>
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
        className="group mt-5 block overflow-hidden rounded-[1.75rem] border border-gold/25 bg-[linear-gradient(145deg,rgba(214,167,56,0.14),rgba(255,255,255,0.035))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.28)]"
      >
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gold text-black shadow-lg">
            <Gift className="size-6" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">
              CloudView Rewards
            </p>
            <h2 className="mt-1 font-serif text-xl font-normal tracking-wide text-white">
              Start earning during your stay
            </h2>
            <p className="mt-1 text-xs font-medium leading-5 text-white/50">
              Link your guest profile to collect points from eligible activity.
            </p>
          </div>

          <ChevronRight className="size-5 shrink-0 text-gold transition group-hover:translate-x-1" />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={rewardsHref}
      className="group mt-5 block overflow-hidden rounded-[1.9rem] border border-gold/30 bg-[radial-gradient(circle_at_top_right,rgba(214,167,56,0.32),transparent_42%),#0c0a06] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.38)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-gold">
            <Sparkles className="size-3.5" />
            CloudView Rewards
          </p>

          <p className="mt-3 text-xs font-semibold text-white/45">
            Available points
          </p>

          <div className="mt-1 flex items-end gap-2">
            <p className="font-serif text-5xl font-light leading-none text-white">
              {availablePoints}
            </p>
            <p className="pb-1 text-xs font-black uppercase tracking-widest text-gold">
              points
            </p>
          </div>
        </div>

        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gold text-black shadow-xl">
          <Gift className="size-6" />
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <RewardMetric label="Pending" value={pendingPoints} />
        <RewardMetric label="Earned" value={lifetimeEarnedPoints} />
        <RewardMetric label="Redeemed" value={lifetimeRedeemedPoints} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs font-black text-gold">
        View rewards
        <ChevronRight className="size-4 transition group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function RewardMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-black/30 p-3">
      <p className="truncate text-[8px] font-black uppercase tracking-[0.14em] text-white/35">
        {label}
      </p>
      <p className="mt-1 truncate font-serif text-base font-medium text-white">
        {value}
      </p>
    </div>
  );
}

function ProfileActionRow({
  href,
  icon: Icon,
  title,
  description,
  accent = false,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <SmartLink
      href={href}
      className={
        accent
          ? 'group grid grid-cols-[48px_1fr_28px] items-center gap-3 rounded-[1.5rem] border border-gold/35 bg-[linear-gradient(135deg,rgba(214,167,56,0.22),rgba(214,167,56,0.08))] p-4 shadow-[0_14px_34px_rgba(214,167,56,0.12)] transition hover:bg-gold/20 active:scale-[0.99]'
          : 'group grid grid-cols-[48px_1fr_28px] items-center gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4 transition hover:border-gold/30 hover:bg-white/[0.07] active:scale-[0.99]'
      }
    >
      <span
        className={
          accent
            ? 'grid size-12 place-items-center rounded-2xl bg-gold text-black'
            : 'grid size-12 place-items-center rounded-2xl bg-gold/12 text-gold'
        }
      >
        <Icon className="size-5" />
      </span>

      <span className="min-w-0">
        <span className="block font-serif text-[17px] font-medium tracking-wide text-white">
          {title}
        </span>
        <span className="mt-1 line-clamp-2 block text-xs font-medium leading-5 text-white/45">
          {description}
        </span>
      </span>

      <ChevronRight className="size-5 text-gold transition group-hover:translate-x-1" />
    </SmartLink>
  );
}

function FrontDeskCard({
  phone,
  email,
}: {
  phone?: string | null;
  email?: string | null;
}) {
  return (
    <section className="mt-7 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-[0_22px_60px_rgba(0,0,0,0.24)]">
      <div className="flex items-start gap-4 border-b border-white/10 p-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold">
          <Phone className="size-5" />
        </span>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">
            Front desk
          </p>
          <h2 className="mt-1 font-serif text-xl font-normal tracking-wide text-white">
            Need personal assistance?
          </h2>
          <p className="mt-1 text-xs font-medium leading-5 text-white/45">
            Contact the hotel team for support during your stay.
          </p>
        </div>
      </div>

      <div className="space-y-2 p-4">
        {phone ? (
          <ContactRow
            href={`tel:${phone}`}
            icon={Phone}
            label="Call Front Desk"
            value={phone}
          />
        ) : null}

        {email ? (
          <ContactRow
            href={`mailto:${email}`}
            icon={Mail}
            label="Email Hotel"
            value={email}
          />
        ) : null}

        {!phone && !email ? (
          <div className="rounded-[1.4rem] border border-dashed border-white/12 bg-black/20 p-5 text-center">
            <Hotel className="mx-auto size-7 text-gold" />
            <p className="mt-3 font-serif text-base font-medium tracking-wide text-white">
              Contact details are not available yet
            </p>
            <p className="mt-1 text-xs font-medium leading-5 text-white/40">
              Please approach the front desk for assistance.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ContactRow({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <SmartLink
      href={href}
      className="group grid grid-cols-[44px_1fr_24px] items-center gap-3 rounded-[1.35rem] border border-white/10 bg-black/25 p-3 transition hover:border-gold/30 hover:bg-gold/[0.07]"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-white/[0.06] text-gold">
        <Icon className="size-4.5" />
      </span>

      <span className="min-w-0">
        <span className="block text-sm font-black text-white">{label}</span>
        <span className="mt-0.5 block truncate text-xs font-medium text-white/40">
          {value}
        </span>
      </span>

      <ChevronRight className="size-4 text-white/30 transition group-hover:translate-x-1 group-hover:text-gold" />
    </SmartLink>
  );
}
