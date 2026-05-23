import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BedDouble, ChevronRight, Hotel, MapPin, Search, Utensils, Wifi, type LucideIcon } from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

const guideImage = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';
const facilityImage = 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80';
const attractionImage = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80';
const infoImage = 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=800&q=80';

export default async function GuidePage({ params }: { params: Promise<{ tagCode: string }> }) {
  const { tagCode } = await params;
  const tag = await requireNfcGuestAccess(tagCode);
  if (!tag || tag.status !== 'ACTIVE') notFound();
  const s = tag.hotel.settings;

  const cards = [
    { title: 'Dining', description: 'Explore our restaurants and bars', href: `/t/${tagCode}/menu`, image: guideImage, icon: Utensils },
    { title: 'Facilities', description: 'Explore our facilities and amenities', href: `/t/${tagCode}/pool`, image: facilityImage, icon: Hotel },
    { title: 'Nearby Attractions', description: 'Discover things to do around the area', href: `#tourist-info`, image: attractionImage, icon: MapPin },
    { title: 'Hotel Information', description: 'Policies, Wi‑Fi, check-out time and more', href: `#hotel-info`, image: infoImage, icon: BedDouble }
  ];

  return (
    <>
      <GuestShell hotel={tag.hotel} title="Hotel Guide" subtitle="Everything you need during your stay" backHref={`/t/${tagCode}`}>
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
          <Search className="size-5 text-neutral-400" />
          <span className="text-sm text-neutral-400">Search information</span>
        </div>

        <div className="space-y-3">
          {cards.map(({ title, description, href, image, icon: Icon }) => (
            <Link key={title} href={href} className="grid grid-cols-[76px_1fr_24px] items-center gap-4 rounded-2xl bg-white p-3 shadow-sm">
              <div className="relative size-[76px] overflow-hidden rounded-2xl bg-neutral-100 bg-cover bg-center" style={{ backgroundImage: `url(${image})` }}>
                <div className="absolute inset-0 bg-black/10" />
                <Icon className="absolute bottom-2 right-2 size-4 text-white" />
              </div>
              <span>
                <span className="block font-black">{title}</span>
                <span className="mt-1 block text-xs leading-5 text-neutral-500">{description}</span>
              </span>
              <ChevronRight className="size-5 text-neutral-400" />
            </Link>
          ))}
        </div>

        <div id="hotel-info" className="mt-5 space-y-3">
          <Info icon={Wifi} title="Wi‑Fi" body={`Network: ${s?.wifiName ?? 'Ask front desk'}\nPassword: ${s?.wifiPassword ?? 'Ask front desk'}`} />
          <Info icon={BedDouble} title="Check-in / Check-out" body={`Check-in: ${s?.checkInTime ?? '2:00 PM'}\nCheck-out: ${s?.checkOutTime ?? '12:00 PM'}`} />
          <Info icon={Hotel} title="Policies" body={s?.policies ?? 'Please keep noise low, respect hotel property, and contact staff for assistance.'} />
          <Info icon={MapPin} title="Amenities, tourist info, transportation" body={s?.guideText ?? 'Amenities, map, tourist recommendations, transportation details, and contact numbers can be configured in the admin settings.'} />
        </div>
      </GuestShell>
      <GuestBottomNav tagCode={tagCode} active="profile" />
    </>
  );
}

function Info({ title, body, icon: Icon }: { title: string; body: string; icon: LucideIcon }) {
  return (
    <div className="rounded-[2rem] bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-2 font-black"><Icon className="size-5 text-gold" /> {title}</h3>
      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-600">{body}</p>
    </div>
  );
}
