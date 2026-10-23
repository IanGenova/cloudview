import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ConciergeBell, Mail, Phone, ShoppingBag } from 'lucide-react';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { getGuestContact } from '@/lib/guest-contact';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

export const dynamic = 'force-dynamic';

export default async function ContactPage({
  params,
}: {
  params: Promise<{ tagCode: string }>;
}) {
  const { tagCode } = await params;
  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag || tag.status !== 'ACTIVE') notFound();

  const location = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;
  const { phone, email } = getGuestContact(tag.hotel.settings);

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title="Contact the hotel"
        subtitle={location}
        backHref={`/t/${tagCode}`}
        variant="dark"
      >
        <section className="border border-[#d6a738]/25 bg-[radial-gradient(circle_at_top_right,rgba(214,167,56,0.18),transparent_42%),#11100d] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d6a738]">
            Front desk & assistance
          </p>
          <h2 className="mt-4 font-serif text-3xl leading-tight text-white">
            How can we help?
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/65">
            Reach the team at {tag.hotel.name} for help at {location}.
          </p>

          {phone || email ? (
            <div className="mt-6 grid gap-3">
              {phone ? (
                <a
                  href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                  className="flex min-h-14 items-center justify-between gap-3 bg-[#d6a738] px-4 text-sm font-semibold text-black"
                >
                  <span className="flex items-center gap-3"><Phone className="size-5" /> Call front desk</span>
                  <span className="text-xs">{phone}</span>
                </a>
              ) : null}
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="flex min-h-14 items-center justify-between gap-3 border border-white/20 px-4 text-sm font-semibold text-white"
                >
                  <span className="flex items-center gap-3"><Mail className="size-5 text-[#d6a738]" /> Email front desk</span>
                  <ArrowRight className="size-4" />
                </a>
              ) : null}
            </div>
          ) : (
            <div role="status" className="mt-6 border border-white/15 bg-white/[0.05] p-4 text-sm leading-6 text-white/75">
              <p>Send a request from {location} and the hotel team can assist you.</p>
              <Link
                href={`/t/${tagCode}/service`}
                className="mt-4 flex min-h-12 items-center justify-between gap-3 bg-[#d6a738] px-4 font-semibold text-black"
              >
                Request staff assistance
                <ArrowRight className="size-4" />
              </Link>
              <p className="mt-3 text-xs leading-5 text-white/50">Phone and email are not listed for this property. Staff nearby can also help.</p>
            </div>
          )}
        </section>

        <section className="mt-6">
          <h2 className="font-serif text-2xl text-white">Other ways to get help</h2>
          <div className="mt-4 grid gap-3">
            {phone || email ? (
              <Link href={`/t/${tagCode}/service`} className="flex min-h-16 items-center justify-between gap-4 border border-white/10 bg-white/[0.04] px-4 text-white">
                <span className="flex items-center gap-3"><ConciergeBell className="size-5 text-[#d6a738]" /> Request assistance</span>
                <ArrowRight className="size-4 text-white/50" />
              </Link>
            ) : null}
            <Link href={`/t/${tagCode}/activity`} className="flex min-h-16 items-center justify-between gap-4 border border-white/10 bg-white/[0.04] px-4 text-white">
              <span className="flex items-center gap-3"><ShoppingBag className="size-5 text-[#d6a738]" /> Track an order or request</span>
              <ArrowRight className="size-4 text-white/50" />
            </Link>
          </div>
        </section>
      </GuestShell>
      <GuestBottomNav tagCode={tagCode} active="stay" dark />
    </>
  );
}
