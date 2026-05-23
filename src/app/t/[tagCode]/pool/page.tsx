import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Info, ShieldCheck, Sparkles, Utensils, Waves, type LucideIcon } from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

const poolImage = 'https://images.unsplash.com/photo-1572331165267-854da2b10ccc?auto=format&fit=crop&w=1200&q=80';

export default async function PoolPage({ params }: { params: Promise<{ tagCode: string }> }) {
  const { tagCode } = await params;
  const tag = await requireNfcGuestAccess(tagCode);
  if (!tag || tag.status !== 'ACTIVE') notFound();
  const settings = tag.hotel.settings;

  return (
    <>
      <GuestShell hotel={tag.hotel} title="Pool & Amenities" subtitle="Relax, dine, and enjoy your stay" backHref={`/t/${tagCode}`}>
        <div className="overflow-hidden rounded-[2rem] bg-white shadow-soft">
          <div className="relative h-64 bg-cover bg-center" style={{ backgroundImage: `url(${poolImage})` }}>
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-0 p-5 text-white">
              <h2 className="font-serif text-3xl">Infinity Pool</h2>
              <p className="mt-1 text-sm font-bold">{settings?.poolHours ?? '7:00 AM - 9:00 PM'}</p>
              <p className="mt-3 text-sm text-white/80">Take a dip and relax with our breathtaking resort view.</p>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <GuideLink href={`/t/${tagCode}/menu`} icon={Utensils} title="Poolside Menu" description="Order food and drinks" />
          <GuideLink href={`/t/${tagCode}/service`} icon={Waves} title="Request Towels" description="Ask staff for extra towels" />
          <GuideLink href="#pool-rules" icon={ShieldCheck} title="Pool Rules" description="Guidelines for your safety" />
          <GuideLink href={`/t/${tagCode}/guide`} icon={Sparkles} title="Spa & Wellness" description="Relax and rejuvenate" />
        </div>

        <div id="pool-rules" className="mt-5 rounded-[2rem] bg-white p-5 shadow-soft">
          <div className="mb-3 flex items-center gap-2 font-black"><Info className="size-5" /> Pool Rules</div>
          <p className="whitespace-pre-line text-sm leading-6 text-neutral-600">{settings?.poolRules ?? 'Shower before entering. No running. Children must be supervised. Follow lifeguard and staff instructions.'}</p>
        </div>
      </GuestShell>
      <GuestBottomNav tagCode={tagCode} active="services" />
    </>
  );
}

function GuideLink({ href, icon: Icon, title, description }: { href: string; icon: LucideIcon; title: string; description: string }) {
  return (
    <Link href={href} className="grid grid-cols-[44px_1fr_24px] items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <span className="grid size-11 place-items-center rounded-xl bg-[#f3ede3]"><Icon className="size-5" /></span>
      <span>
        <span className="block font-black">{title}</span>
        <span className="text-xs text-neutral-500">{description}</span>
      </span>
      <ChevronRight className="size-5 text-neutral-400" />
    </Link>
  );
}
