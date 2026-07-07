import {
  DashboardModule,
  MenuProductType,
  OrderStatus,
  ServiceBillingMode,
} from '@prisma/client';
import { db } from '@/lib/db';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import { POSClient } from './POSClient';

function safeRequiredQuantity(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    return 1;
  }

  return value;
}

export default async function POSPage({
  searchParams,
}: {
  searchParams?: Promise<{
    hotelId?: string;
  }>;
}) {
  const user = await requireDashboardPermission(
    DashboardModule.POS_TERMINAL,
    'canView'
  );
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
      <div className="rounded-[1.5rem] border border-dashed border-neutral-300 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-black text-[#11100b]">No hotel available.</p>
        <p className="mt-1 text-sm font-semibold text-neutral-500">
          Please create or assign a hotel before using the POS Terminal.
        </p>
      </div>
    );
  }

  const [rooms, products, services] = await Promise.all([
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
        bundleComponents: {
          include: {
            componentProduct: {
              select: {
                id: true,
                name: true,
                priceCents: true,
                isAvailable: true,
                productType: true,
              },
            },
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    }),

    db.serviceCatalogItem.findMany({
      where: {
        hotelId: selectedHotelId,
        isActive: true,
      },
      include: {
        availabilityStock: true,
      },
      orderBy: [
        {
          category: 'asc',
        },
        {
          sortOrder: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    }),
  ]);

  const stockProductIds = Array.from(
    new Set([
      ...products.map((product) => product.id),
      ...products.flatMap((product) =>
        product.bundleComponents.map(
          (component) => component.componentProductId
        )
      ),
    ])
  );

  const [stocks, soldGroups] = await Promise.all([
    stockProductIds.length
      ? db.menuAvailabilityStock.findMany({
          where: {
            hotelId: selectedHotelId,
            productId: {
              in: stockProductIds,
            },
          },
        })
      : [],

    products.length
      ? db.orderItem.groupBy({
          by: ['productId'],
          where: {
            productId: {
              in: products.map((product) => product.id),
            },
            order: {
              hotelId: selectedHotelId,
              status: {
                not: OrderStatus.CANCELLED,
              },
            },
          },
          _sum: {
            quantity: true,
          },
        })
      : [],
  ]);

  const stockByProductId = new Map(
    stocks.map((stock) => [stock.productId, stock])
  );

  const soldQtyByProductId = new Map<string, number>();

  for (const group of soldGroups) {
    if (group.productId) {
      soldQtyByProductId.set(group.productId, group._sum.quantity ?? 0);
    }
  }

  const mappedProducts = products.map((product) => {
    const isBundle = product.productType === MenuProductType.BUNDLE;
    const stock = stockByProductId.get(product.id);

    if (!isBundle) {
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        priceCents: product.priceCents,
        imageUrl: product.images[0]?.url || null,
        categoryName: product.category?.name ?? 'Uncategorized',

        productType: product.productType,
        isBundle: false,
        isDerivedStock: false,

        stockId: stock?.id ?? null,
        availableQty: stock?.availableQty ?? 0,
        soldQty: stock?.soldQty ?? 0,
        isSoldOut: stock?.isSoldOut ?? true,
        isMenuActive: product.isAvailable,

        limitingComponentName: null,
        normalBundlePriceCents: 0,
        bundleSavingsCents: 0,
        bundleComponents: [],
      };
    }

    const bundleComponents = product.bundleComponents.map((component) => {
      const componentStock = stockByProductId.get(component.componentProductId);
      const requiredQty = safeRequiredQuantity(component.quantity);
      const availableQty = componentStock?.availableQty ?? 0;
      const soldQty = componentStock?.soldQty ?? 0;

      const canSellQty =
        component.componentProduct.isAvailable &&
        component.componentProduct.productType === MenuProductType.SINGLE &&
        componentStock &&
        !componentStock.isSoldOut &&
        availableQty >= requiredQty
          ? Math.floor(availableQty / requiredQty)
          : 0;

      return {
        id: component.id,
        productId: component.componentProductId,
        name: component.componentProduct.name,
        quantity: requiredQty,
        availableQty,
        soldQty,
        canSellQty,
        isSoldOut:
          !component.componentProduct.isAvailable ||
          component.componentProduct.productType !== MenuProductType.SINGLE ||
          !componentStock ||
          componentStock.isSoldOut ||
          availableQty < requiredQty,
      };
    });

    const derivedAvailableQty =
      bundleComponents.length > 0
        ? Math.min(...bundleComponents.map((component) => component.canSellQty))
        : 0;

    const limitingComponent =
      bundleComponents.length > 0
        ? bundleComponents.reduce((lowest, component) =>
            component.canSellQty < lowest.canSellQty ? component : lowest
          )
        : null;

    const normalBundlePriceCents = product.bundleComponents.reduce(
      (sum, component) =>
        sum +
        safeRequiredQuantity(component.quantity) *
          component.componentProduct.priceCents,
      0
    );

    const bundleSavingsCents =
      normalBundlePriceCents > product.priceCents
        ? normalBundlePriceCents - product.priceCents
        : 0;

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
      imageUrl: product.images[0]?.url || null,
      categoryName: product.category?.name ?? 'Uncategorized',

      productType: product.productType,
      isBundle: true,
      isDerivedStock: true,

      stockId:
        bundleComponents.length > 0 ? `bundle-derived-${product.id}` : null,
      availableQty: derivedAvailableQty,
      soldQty: soldQtyByProductId.get(product.id) ?? 0,
      isSoldOut: derivedAvailableQty <= 0,
      isMenuActive: product.isAvailable,

      limitingComponentName: limitingComponent?.name ?? null,
      normalBundlePriceCents,
      bundleSavingsCents,
      bundleComponents,
    };
  });

  const mappedServices = services.map((service) => {
    const stock = service.availabilityStock;
    const inventoryTracked = service.inventoryTracked;

    return {
      id: service.id,
      code: service.code,
      name: service.name,
      category: service.category,
      description: service.description ?? '',
      iconKey: service.iconKey,
      billingMode: service.billingMode ?? ServiceBillingMode.FREE,
      unitPrice: Number(service.unitPrice),
      unitLabel: service.unitLabel ?? '',
      isActive: service.isActive,
      inventoryTracked,
      stockId: stock?.id ?? null,
      availableQty: inventoryTracked ? stock?.availableQty ?? 0 : 999,
      usedQty: inventoryTracked ? stock?.usedQty ?? 0 : 0,
      isSoldOut: inventoryTracked ? stock?.isSoldOut ?? true : false,
      notes: inventoryTracked ? stock?.notes ?? '' : '',
    };
  });

  return (
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
      services={mappedServices}
      currency={hotel.settings?.currency || 'PHP'}
    />
  );
}
