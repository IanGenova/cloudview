import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { POSClient } from './POSClient';

export default async function POSPage({
  searchParams,
}: {
  searchParams?: Promise<{
    hotelId?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const hotels = await db.hotel.findMany({
    where: user.role === 'SUPER_ADMIN' ? {} : { id: user.hotelId! },
    include: {
      settings: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  const selectedHotelId =
    user.role === 'SUPER_ADMIN'
      ? params?.hotelId || hotels[0]?.id
      : user.hotelId!;

  const hotel =
    hotels.find((item) => item.id === selectedHotelId) || hotels[0];

  if (!selectedHotelId || !hotel) {
    return (
      <div>
        <PageHeader
          title="POS Terminal"
          description="Create walk-in, restaurant, front-desk, or room-charge orders directly from the dashboard."
        />

        <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="font-black">No hotel available.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Please create or assign a hotel before using the POS Terminal.
          </p>
        </div>
      </div>
    );
  }

  const [rooms, products] = await Promise.all([
    db.room.findMany({
      where: {
        hotelId: selectedHotelId,
      },
      orderBy: {
        number: 'asc',
      },
    }),

    db.menuProduct.findMany({
      where: {
        hotelId: selectedHotelId,
      },
      include: {
        category: true,
        images: {
          take: 1,
        },
      },
      orderBy: {
        name: 'asc',
      },
    }),
  ]);

  const productIds = products.map((product) => product.id);

  const stocks = productIds.length
    ? await db.menuAvailabilityStock.findMany({
        where: {
          hotelId: selectedHotelId,
          productId: {
            in: productIds,
          },
        },
      })
    : [];

  const stockByProductId = new Map(
    stocks.map((stock) => [stock.productId, stock])
  );

  const mappedProducts = products.map((product) => {
    const stock = stockByProductId.get(product.id);

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
      imageUrl: product.images[0]?.url || null,
      categoryName: product.category?.name ?? 'Uncategorized',

      stockId: stock?.id ?? null,
      availableQty: stock?.availableQty ?? 0,
      soldQty: stock?.soldQty ?? 0,
      isSoldOut: stock?.isSoldOut ?? true,
      isMenuActive: product.isAvailable,
    };
  });

  return (
    <div>
      <PageHeader
        title="POS Terminal"
        description="Create walk-in, restaurant, front-desk, or room-charge orders directly from the dashboard."
      />

      <POSClient
        hotels={hotels.map((item) => ({
          id: item.id,
          name: item.name,
        }))}
        selectedHotelId={selectedHotelId}
        rooms={rooms.map((room) => ({
          id: room.id,
          number: room.number,
          name: room.name,
        }))}
        products={mappedProducts}
        currency={hotel.settings?.currency || 'PHP'}
      />
    </div>
  );
}