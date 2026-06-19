import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
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
  params: Promise<{
    tagCode: string;
  }>;
  searchParams: Promise<{
    error?: string;
    success?: string;
    count?: string;
  }>;
}) {
  const { tagCode } = await params;
  const { error, success, count } = await searchParams;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag) {
    notFound();
  }

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
          <div className="rounded-[2rem] border border-gold/20 bg-white/5 p-6 text-center shadow-2xl">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gold/15 text-gold">
              <Lock className="size-8" />
            </div>

            <h2 className="mt-5 text-2xl font-black text-white">
              Service requests are disabled
            </h2>

            <p className="mt-3 text-sm leading-6 text-white/55">
              This NFC panel is currently inactive. You can still view the guest
              portal, but service requests and room add-ons cannot be submitted
              from this NFC tag.
            </p>

            <div className="mt-5 grid gap-3">
              <Link
                href={`/t/${tagCode}/guide`}
                className="rounded-2xl bg-gold px-5 py-3 text-sm font-black text-black"
              >
                View Hotel Guide
              </Link>

              <Link
                href={`/t/${tagCode}/contact`}
                className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-black text-white"
              >
                Contact Front Desk
              </Link>
            </div>
          </div>
        </GuestShell>

        <GuestBottomNav tagCode={tagCode} active="services" dark />
      </>
    );
  }

  const services = await db.serviceCatalogItem.findMany({
    where: {
      hotelId: tag.hotelId,
      isActive: true,
    },
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
    },
    orderBy: [
      {
        sortOrder: 'asc',
      },
      {
        category: 'asc',
      },
      {
        name: 'asc',
      },
    ],
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
          services={services.map((service) => ({
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
              }))}
          defaultGuestName={defaultGuestName}
          error={error}
          success={success}
          count={count}
        />
      </GuestShell>

      <GuestBottomNav tagCode={tagCode} active="services" dark />
    </>
  );
}