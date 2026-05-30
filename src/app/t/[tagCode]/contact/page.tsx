import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight,
  HelpCircle,
  Mail,
  MessageCircle,
  Phone,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import {
  GuestBottomNav,
  GuestLogo,
  GuestShell,
} from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

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

  const greeting = getGuestGreeting();

  const phone = tag.hotel.settings?.contactPhone;
  const email = tag.hotel.settings?.contactEmail;

  const location = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

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
              Guest
            </h1>

            <p className="mt-3 max-w-xs text-sm text-white/70">
              Thank you for choosing {tag.hotel.name}.
            </p>
          </div>

          <div className="mt-10 space-y-2">
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