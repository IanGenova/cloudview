import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, HelpCircle, Mail, MessageCircle, Phone, Settings, ShoppingBag, Star, type LucideIcon } from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestLogo, GuestShell } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

export default async function ContactPage({ params }: { params: Promise<{ tagCode: string }> }) {
  const { tagCode } = await params;
  const tag = await requireNfcGuestAccess(tagCode);
  if (!tag || tag.status !== 'ACTIVE') notFound();
  const phone = tag.hotel.settings?.contactPhone;
  const email = tag.hotel.settings?.contactEmail;
  const location = tag.room ? `Room ${tag.room.number}` : tag.location?.name ?? tag.label;

  return (
    <>
      <GuestShell hotel={tag.hotel} title="Profile" subtitle={location} variant="dark" showTopBar={false}>
        <div className="pt-8">
          <GuestLogo hotel={tag.hotel} className="text-gold" />
          <div className="mt-12">
            <p className="font-serif text-3xl leading-tight text-sand">Good Evening,</p>
            <h1 className="font-serif text-4xl leading-tight text-sand">Guest</h1>
            <p className="mt-3 max-w-xs text-sm text-white/70">Thank you for choosing {tag.hotel.name}.</p>
          </div>

          <div className="mt-7 grid grid-cols-[1fr_72px] items-center gap-4 rounded-[1.75rem] bg-white/6 p-5">
            <div>
              <p className="text-sm font-bold text-white/70">Gold Member</p>
              <p className="mt-1 text-xl font-black text-sand">12,450 pts</p>
            </div>
            <div className="grid size-14 place-items-center rounded-2xl bg-gold/15 text-gold"><Star className="size-6" /></div>
          </div>

          <div className="mt-7 space-y-2">
            <ProfileLink href={`/t/${tagCode}/menu`} icon={ShoppingBag} label="My Orders" />
            <ProfileLink href={`/t/${tagCode}/service`} icon={MessageCircle} label="My Requests" />
            {phone ? <ProfileLink href={`tel:${phone}`} icon={Phone} label={`Call ${phone}`} /> : null}
            {email ? <ProfileLink href={`mailto:${email}`} icon={Mail} label={`Email ${email}`} /> : null}
            <ProfileLink href={`/t/${tagCode}/guide`} icon={Settings} label="Account Settings" />
            <ProfileLink href={`/t/${tagCode}/service`} icon={HelpCircle} label="Help & Support" />
          </div>

          <Link href={`/t/${tagCode}`} className="mt-7 block rounded-2xl bg-white/8 p-4 text-center font-black text-sand">Back to Home</Link>
        </div>
      </GuestShell>
      <GuestBottomNav tagCode={tagCode} active="profile" dark />
    </>
  );
}

function ProfileLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="grid grid-cols-[28px_1fr_24px] items-center gap-2 rounded-2xl px-2 py-3 text-sm text-white/85 hover:bg-white/5">
      <Icon className="size-5 text-white/70" />
      <span className="font-bold">{label}</span>
      <ChevronRight className="size-5 text-white/40" />
    </Link>
  );
}
