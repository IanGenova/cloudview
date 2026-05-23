import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { POSClient } from './POSClient';

export default async function POSPage({
  searchParams
}: {
  searchParams?: Promise<{ hotelId?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const hotels = await db.hotel.findMany({
    where: user.role === 'SUPER_ADMIN' ? {} : { id: user.hotelId! },
    include: { settings: true },
    orderBy: { name: 'asc' }
  });

  const selectedHotelId =
    user.role === 'SUPER_ADMIN'
      ? params?.hotelId || hotels[0]?.id
      : user.hotelId!;

  const hotel = hotels.find((item) => item.id === selectedHotelId) || hotels[0];

  const [rooms, products] = await Promise.all([
    db.room.findMany({
      where: { hotelId: selectedHotelId },
      orderBy: { number: 'asc' }
    }),

    db.menuProduct.findMany({
      where: { hotelId: selectedHotelId },
      include: {
        category: true,
        images: {
          take: 1
        }
      },
      orderBy: { name: 'asc' }
    })
  ]);

  const mappedProducts = products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    priceCents: product.priceCents,
    imageUrl: product.images[0]?.url || null,
    categoryName: product.category.name
  }));

  return (
    <div>
      <PageHeader
        title="POS Terminal"
        description="Create walk-in, restaurant, front-desk, or room-charge orders directly from the dashboard."
      />

      <POSClient
        hotels={hotels.map((item) => ({
          id: item.id,
          name: item.name
        }))}
        selectedHotelId={selectedHotelId}
        rooms={rooms.map((room) => ({
          id: room.id,
          number: room.number,
          name: room.name
        }))}
        products={mappedProducts}
        currency={hotel?.settings?.currency || 'PHP'}
      />
    </div>
  );
}