import { notFound } from 'next/navigation';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { db } from '@/lib/db';
import { GuestServiceOrderForm } from './GuestServiceOrderForm';

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

  if (!tag || tag.status !== 'ACTIVE') {
    notFound();
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

  const roomLabel = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title="Services & Room Add-ons"
        subtitle={roomLabel}
        backHref={`/t/${tagCode}`}
      >
        <GuestServiceOrderForm
          tagCode={tagCode}
          roomLabel={roomLabel}
          services={guestServices}
          error={error}
          success={success}
          count={count}
        />
      </GuestShell>

      <GuestBottomNav tagCode={tagCode} active="services" />
    </>
  );
}