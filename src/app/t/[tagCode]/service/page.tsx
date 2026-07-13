import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { db } from '@/lib/db';
import { GuestServiceOrderForm } from './GuestServiceOrderForm';
import { getCurrentNfcGuestIdentity } from '@/lib/nfc-guest-session';

export const dynamic = 'force-dynamic';

export default async function ServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ tagCode: string }>;
  searchParams: Promise<{
    error?: string;
    success?: string;
    count?: string;
    xendit?: string;
    xenditResult?: string;
  }>;
}) {
  const { tagCode } = await params;
  const query = await searchParams;
  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag) notFound();

  const roomLabel = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  if (tag.status !== 'ACTIVE') {
    return (
      <>
        <GuestShell
          hotel={tag.hotel}
          title="Services & Room Add-ons"
          subtitle={roomLabel}
          backHref={`/t/${tagCode}`}
          variant="dark"
        >
          <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(214,167,56,0.16),transparent_38%),linear-gradient(145deg,#161512,#0b0b0a)] p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.3)]">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-gold/20 bg-gold/10 text-gold">
              <Lock className="size-7" />
            </div>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/55">
              <ShieldCheck className="size-3.5" />
              Guest access notice
            </div>
            <h2 className="mt-5 font-serif text-3xl font-normal tracking-wide text-white">
              Service requests are unavailable
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-6 text-white/50">
              This NFC panel is currently inactive. Contact the front desk for
              assistance.
            </p>
            <div className="mt-6 grid gap-3">
              <Link
                href={`/t/${tagCode}/guide`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gold px-5 text-sm font-black text-black"
              >
                <Sparkles className="size-4" />
                View Hotel Guide
              </Link>
              <Link
                href={`/t/${tagCode}/contact`}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] px-5 text-sm font-black text-white"
              >
                Contact Front Desk
              </Link>
            </div>
          </section>
        </GuestShell>
        <GuestBottomNav tagCode={tagCode} active="services" dark />
      </>
    );
  }

  const services = await db.serviceCatalogItem.findMany({
    where: { hotelId: tag.hotelId, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      description: true,
      iconKey: true,
      billingMode: true,
      unitPrice: true,
      unitLabel: true,
      sortOrder: true,
      inventoryTracked: true,
      availabilityStock: {
        select: {
          availableQty: true,
          usedQty: true,
          isSoldOut: true,
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { category: 'asc' }, { name: 'asc' }],
  });

  const guestIdentity = await getCurrentNfcGuestIdentity(tagCode);
  const defaultGuestName = guestIdentity.guestName || '';

  const guestServices = services.map((service) => ({
    id: service.id,
    code: service.code,
    name: service.name,
    category: service.category,
    description: service.description ?? '',
    iconKey: service.iconKey,
    billingMode: service.billingMode,
    unitPrice: Number(service.unitPrice),
    unitLabel: service.unitLabel ?? '',
    sortOrder: service.sortOrder,
    inventoryTracked: service.inventoryTracked,
    availableQty: service.inventoryTracked
      ? service.availabilityStock?.availableQty ?? 0
      : null,
    isSoldOut: service.inventoryTracked
      ? !service.availabilityStock ||
        service.availabilityStock.isSoldOut ||
        service.availabilityStock.availableQty <= 0
      : false,
  }));

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title="Services & Room Add-ons"
        subtitle={roomLabel}
        backHref={`/t/${tagCode}`}
        variant="dark"
      >
        <GuestServiceOrderForm
          tagCode={tagCode}
          roomLabel={roomLabel}
          services={guestServices}
          defaultGuestName={defaultGuestName}
          error={query.error}
          success={query.success}
          count={query.count}
        />
      </GuestShell>
      <GuestBottomNav tagCode={tagCode} active="services" dark />
    </>
  );
}
