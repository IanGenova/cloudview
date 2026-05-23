import { notFound } from 'next/navigation';
import { Baby, BedDouble, Car, Clock, ConciergeBell, Droplets, Hammer, PackagePlus, Shirt, Sparkles, SprayCan, Waves } from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { createServiceRequestAction } from '../actions';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

const requestTypes = [
  { group: 'Housekeeping', items: [
    { type: 'Extra Towels', icon: Waves },
    { type: 'Room Cleaning', icon: Sparkles },
    { type: 'Laundry', icon: Shirt }
  ] },
  { group: 'Room Assistance', items: [
    { type: 'Maintenance', icon: Hammer },
    { type: 'Extra Amenities', icon: PackagePlus },
    { type: 'Baby Cot', icon: Baby }
  ] },
  { group: 'Concierge', items: [
    { type: 'Airport Transfer', icon: Car },
    { type: 'Toiletries', icon: SprayCan },
    { type: 'Late Checkout', icon: Clock }
  ] },
  { group: 'Essentials', items: [
    { type: 'Water refill', icon: Droplets },
    { type: 'Extra pillow', icon: BedDouble },
    { type: 'Other request', icon: ConciergeBell }
  ] }
];

export default async function ServicePage({ params }: { params: Promise<{ tagCode: string }> }) {
  const { tagCode } = await params;
  const tag = await requireNfcGuestAccess(tagCode);
  if (!tag || tag.status !== 'ACTIVE') notFound();

  return (
    <>
      <GuestShell hotel={tag.hotel} title="Request Service" subtitle={tag.room ? `Room ${tag.room.number}` : tag.location?.name ?? tag.label} backHref={`/t/${tagCode}`}>
        <form action={createServiceRequestAction} className="space-y-6">
          <input type="hidden" name="tagCode" value={tagCode} />
          <Input name="guestName" placeholder="Guest name optional" className="bg-white" />

          {requestTypes.map((group) => (
            <section key={group.group}>
              <h2 className="mb-3 text-sm font-black text-neutral-700">{group.group}</h2>
              <div className="grid grid-cols-3 gap-3">
                {group.items.map(({ type, icon: Icon }) => (
                  <label key={type} className="cursor-pointer">
                    <input className="peer sr-only" type="radio" name="type" value={type} required />
                    <span className="grid min-h-[92px] place-items-center rounded-2xl bg-white p-3 text-center text-xs font-black shadow-sm ring-2 ring-transparent transition peer-checked:bg-ink peer-checked:text-white peer-checked:ring-gold">
                      <Icon className="mb-2 size-6" />
                      {type}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ))}

          <Textarea name="notes" placeholder="Add notes, exact need, or urgency" className="bg-white" />
          <Button size="lg" className="w-full bg-sand text-ink hover:bg-gold">My Requests</Button>
        </form>
      </GuestShell>
      <GuestBottomNav tagCode={tagCode} active="services" />
    </>
  );
}
