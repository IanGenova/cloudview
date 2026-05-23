import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { MenuClient } from '@/components/guest/MenuClient';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

export default async function MenuPage({ params }: { params: Promise<{ tagCode: string }> }) {
  const { tagCode } = await params;
  const tag = await requireNfcGuestAccess(tagCode);
  if (!tag || tag.status !== 'ACTIVE') notFound();
  const products = await db.menuProduct.findMany({ where: { hotelId: tag.hotelId, isAvailable: true }, include: { category: true }, orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }] });
  const settings = tag.hotel.settings;

  return (
    <>
      <GuestShell hotel={tag.hotel} title="Order Food" subtitle={tag.room ? `Room ${tag.room.number}` : tag.location?.name ?? tag.label} variant="dark" showTopBar={false}>
        <MenuClient
          tagCode={tagCode}
          currency={settings?.currency ?? 'PHP'}
          taxRate={Number(settings?.taxRate ?? 0)}
          serviceChargeRate={Number(settings?.serviceChargeRate ?? 0)}
          products={products.map((p) => ({ id: p.id, name: p.name, description: p.description, priceCents: p.priceCents, imageUrl: p.imageUrl, categoryName: p.category.name }))}
        />
      </GuestShell>
      <GuestBottomNav tagCode={tagCode} active="order" dark />
    </>
  );
}
