import { MenuProductType, OrderStatus } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { InventoryClient } from './InventoryClient';
import { RealtimeInventoryRefresh } from '@/components/dashboard/RealtimeInventoryRefresh';

type InventoryTab = 'menu' | 'services';

function getActiveTab(tab?: string): InventoryTab {
  return tab === 'services' ? 'services' : 'menu';
}

function getMessage(error?: string, success?: string) {
  if (success) {
    const messages: Record<string, string> = {
      'stock-updated':
        'Menu stock was updated successfully.',
      'stocks-initialized':
        'Missing menu stock records were initialized successfully.',
      'service-stock-enabled':
        'Service inventory tracking was enabled successfully.',
      'service-stock-disabled':
        'Service inventory tracking was disabled successfully.',
      'service-stock-updated':
        'Service request inventory was updated successfully.',
      'service-stocks-initialized':
        'Missing service inventory records were initialized successfully.',
    };

    return {
      type: 'success' as const,
      text: messages[success] ?? 'Action completed successfully.',
    };
  }

  if (error) {
    const messages: Record<string, string> = {
      'product-required': 'Menu item is required.',
      'service-required': 'Service item is required.',
      'invalid-operation': 'Invalid stock control operation.',
      'product-not-found': 'Menu item was not found.',
      'service-not-found': 'Service item was not found.',
      'invalid-quantity': 'Please enter a valid quantity.',
      'positive-quantity-required': 'Quantity must be greater than zero.',
      'bundle-stock-derived':
        'Bundle stock is derived from its component items. Update the component stock instead.',
    };

    return {
      type: 'error' as const,
      text: messages[error] ?? 'Something went wrong.',
    };
  }

  return null;
}

function getLatestDate(values: Array<Date | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date => Boolean(value))
    .map((value) => value.getTime());

  if (!timestamps.length) {
    return null;
  }

  return new Date(Math.max(...timestamps));
}

function safeRequiredQuantity(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    return 1;
  }

  return value;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    tab?: string;
  }>;
}) {
  const { error, success, tab } = await searchParams;
  const activeTab = getActiveTab(tab);

  const user = await requireUser();

  const where = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const [
    products,
    menuStocks,
    menuMovements,
    services,
    serviceMovements,
  ] = await Promise.all([
    db.menuProduct.findMany({
      where,
      include: {
        hotel: {
          select: {
            name: true,
          },
        },
        bundleComponents: {
          include: {
            componentProduct: {
              select: {
                id: true,
                name: true,
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
      orderBy: [
        {
          hotel: {
            name: 'asc',
          },
        },
        {
          name: 'asc',
        },
      ],
    }),

    db.menuAvailabilityStock.findMany({
      where,
      include: {
        product: {
          select: {
            name: true,
            isAvailable: true,
            productType: true,
          },
        },
        hotel: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        {
          hotel: {
            name: 'asc',
          },
        },
        {
          product: {
            name: 'asc',
          },
        },
      ],
    }),

    db.menuAvailabilityMovement.findMany({
      where,
      include: {
        product: {
          select: {
            name: true,
          },
        },
        hotel: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 80,
    }),

    db.serviceCatalogItem.findMany({
      where,
      include: {
        hotel: {
          select: {
            name: true,
          },
        },
        availabilityStock: true,
      },
      orderBy: [
        {
          hotel: {
            name: 'asc',
          },
        },
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

    db.serviceAvailabilityMovement.findMany({
      where,
      include: {
        service: {
          select: {
            name: true,
            category: true,
          },
        },
        hotel: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 80,
    }),
  ]);

  const productIds = products.map((product) => product.id);

  const soldGroups = productIds.length
    ? await db.orderItem.groupBy({
        by: ['productId'],
        where: {
          productId: {
            in: productIds,
          },
          order: {
            status: {
              not: OrderStatus.CANCELLED,
            },
          },
        },
        _sum: {
          quantity: true,
        },
      })
    : [];

  const soldQtyByProductId = new Map<string, number>();

  for (const group of soldGroups) {
    if (group.productId) {
      soldQtyByProductId.set(group.productId, group._sum.quantity ?? 0);
    }
  }

  const stockByProductId = new Map(
    menuStocks.map((stock) => [stock.productId, stock])
  );

  const menuItems = products.map((product) => {
    const stock = stockByProductId.get(product.id);
    const isBundle = product.productType === MenuProductType.BUNDLE;

    if (!isBundle) {
      return {
        id: product.id,
        hotelId: product.hotelId,
        hotelName: product.hotel.name,
        name: product.name,
        productType: product.productType,
        isBundle: false,
        isDerivedStock: false,
        isMenuActive: product.isAvailable,
        stockId: stock?.id ?? null,
        availableQty: stock?.availableQty ?? 0,
        soldQty: stock?.soldQty ?? soldQtyByProductId.get(product.id) ?? 0,
        isSoldOut: stock?.isSoldOut ?? true,
        notes: stock?.notes ?? '',
        updatedAt: stock?.updatedAt?.toISOString() ?? null,
        bundleComponents: [],
        limitingComponentName: null,
      };
    }

    const bundleComponents = product.bundleComponents.map((component) => {
      const componentStock = stockByProductId.get(component.componentProductId);
      const requiredQty = safeRequiredQuantity(component.quantity);

      const componentAvailableQty = componentStock?.availableQty ?? 0;
      const componentSoldQty = componentStock?.soldQty ?? 0;

      const canSellQty =
        component.componentProduct.isAvailable &&
        componentStock &&
        !componentStock.isSoldOut &&
        componentAvailableQty > 0
          ? Math.floor(componentAvailableQty / requiredQty)
          : 0;

      return {
        id: component.id,
        productId: component.componentProductId,
        name: component.componentProduct.name,
        quantity: requiredQty,
        isMenuActive: component.componentProduct.isAvailable,
        availableQty: componentAvailableQty,
        soldQty: componentSoldQty,
        isSoldOut:
          !component.componentProduct.isAvailable ||
          !componentStock ||
          componentStock.isSoldOut ||
          componentAvailableQty < requiredQty,
        canSellQty,
        updatedAt: componentStock?.updatedAt ?? null,
      };
    });

    const limitingComponent =
      bundleComponents.length > 0
        ? bundleComponents.reduce((lowest, component) =>
            component.canSellQty < lowest.canSellQty ? component : lowest
          )
        : null;

    const derivedAvailableQty =
      bundleComponents.length > 0
        ? Math.min(...bundleComponents.map((component) => component.canSellQty))
        : 0;

    const latestComponentStockUpdatedAt = getLatestDate(
      bundleComponents.map((component) => component.updatedAt)
    );

    const derivedSoldQty = soldQtyByProductId.get(product.id) ?? 0;

    const derivedNotes =
      bundleComponents.length > 0
        ? `Derived from ${bundleComponents.length} component${
            bundleComponents.length === 1 ? '' : 's'
          }.${
            limitingComponent
              ? ` Limiting item: ${limitingComponent.name}.`
              : ''
          }`
        : 'Bundle has no components yet. Add components in Menu Management.';

    return {
      id: product.id,
      hotelId: product.hotelId,
      hotelName: product.hotel.name,
      name: product.name,
      productType: product.productType,
      isBundle: true,
      isDerivedStock: true,
      isMenuActive: product.isAvailable,
      stockId: `bundle-derived-${product.id}`,
      availableQty: derivedAvailableQty,
      soldQty: derivedSoldQty,
      isSoldOut: derivedAvailableQty <= 0,
      notes: derivedNotes,
      updatedAt: latestComponentStockUpdatedAt?.toISOString() ?? null,
      bundleComponents,
      limitingComponentName: limitingComponent?.name ?? null,
    };
  });

  const directStockItems = menuItems.filter(
    (item) => item.productType !== MenuProductType.BUNDLE
  );

  const totalMenuItems = menuItems.length;

  const activeMenuItems = menuItems.filter((item) => item.isMenuActive).length;

  const availableItems = menuItems.filter(
    (item) => item.isMenuActive && item.availableQty > 0 && !item.isSoldOut
  ).length;

  const soldOutItems = menuItems.filter(
    (item) => item.isSoldOut || item.availableQty <= 0
  ).length;

  const totalAvailableQty = directStockItems.reduce(
    (sum, item) => sum + item.availableQty,
    0
  );

  const totalSoldQty = directStockItems.reduce(
    (sum, item) => sum + item.soldQty,
    0
  );

  const serviceItems = services.map((service) => {
    const stock = service.availabilityStock;

    return {
      id: service.id,
      hotelId: service.hotelId,
      hotelName: service.hotel.name,
      code: service.code,
      name: service.name,
      category: service.category,
      description: service.description ?? '',
      iconKey: service.iconKey,
      billingMode: service.billingMode,
      unitPrice: Number(service.unitPrice),
      unitLabel: service.unitLabel ?? '',
      isActive: service.isActive,
      inventoryTracked: service.inventoryTracked,
      stockId: stock?.id ?? null,
      availableQty: stock?.availableQty ?? 0,
      usedQty: stock?.usedQty ?? 0,
      isSoldOut: stock?.isSoldOut ?? true,
      notes: stock?.notes ?? '',
      updatedAt: stock?.updatedAt?.toISOString() ?? null,
    };
  });

  const totalServices = serviceItems.length;
  const activeServices = serviceItems.filter((item) => item.isActive).length;
  const trackedServices = serviceItems.filter(
    (item) => item.inventoryTracked
  ).length;

  const serviceAvailableItems = serviceItems.filter(
    (item) =>
      item.inventoryTracked &&
      item.isActive &&
      item.availableQty > 0 &&
      !item.isSoldOut
  ).length;

  const serviceSoldOutItems = serviceItems.filter(
    (item) =>
      item.inventoryTracked && (item.isSoldOut || item.availableQty <= 0)
  ).length;

  const serviceTotalAvailableQty = serviceItems
    .filter((item) => item.inventoryTracked)
    .reduce((sum, item) => sum + item.availableQty, 0);

  const serviceTotalUsedQty = serviceItems
    .filter((item) => item.inventoryTracked)
    .reduce((sum, item) => sum + item.usedQty, 0);

  return (
    <div>
      <RealtimeInventoryRefresh />

      <PageHeader
        title="Inventory Management"
        description="Manage food menu stock and service request inventory shown to guests."
      />

      <InventoryClient
        initialTab={activeTab}
        menuItems={menuItems}
        menuMovements={menuMovements.map((movement) => ({
          id: movement.id,
          hotelName: movement.hotel.name,
          productName: movement.product.name,
          type: movement.type,
          quantity: movement.quantity,
          balanceAfter: movement.balanceAfter,
          reason: movement.reason ?? '',
          createdAt: movement.createdAt.toISOString(),
        }))}
        serviceItems={serviceItems}
        serviceMovements={serviceMovements.map((movement) => ({
          id: movement.id,
          hotelName: movement.hotel.name,
          serviceName: movement.service.name,
          serviceCategory: movement.service.category,
          type: movement.type,
          quantity: movement.quantity,
          balanceAfter: movement.balanceAfter,
          reason: movement.reason ?? '',
          createdAt: movement.createdAt.toISOString(),
        }))}
        message={getMessage(error, success)}
        menuSummary={{
          totalMenuItems,
          activeMenuItems,
          availableItems,
          soldOutItems,
          totalAvailableQty,
          totalSoldQty,
        }}
        serviceSummary={{
          totalServices,
          activeServices,
          trackedServices,
          serviceAvailableItems,
          serviceSoldOutItems,
          serviceTotalAvailableQty,
          serviceTotalUsedQty,
        }}
      />
    </div>
  );
}