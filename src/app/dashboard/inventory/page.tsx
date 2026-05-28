import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { InventoryClient } from './InventoryClient';

function getMessage(error?: string, success?: string) {
  if (success) {
    const messages: Record<string, string> = {
      'stock-updated': 'Menu stock availability was updated.',
      'stocks-initialized': 'Menu stock records were initialized.',
    };

    return {
      type: 'success' as const,
      text: messages[success] ?? 'Action completed successfully.',
    };
  }

  if (error) {
    const messages: Record<string, string> = {
      'product-required': 'Menu item is required.',
      'invalid-operation': 'Invalid stock control operation.',
      'product-not-found': 'Menu item was not found.',
      'invalid-quantity': 'Please enter a valid quantity.',
      'positive-quantity-required': 'Quantity must be greater than zero.',
    };

    return {
      type: 'error' as const,
      text: messages[error] ?? 'Something went wrong.',
    };
  }

  return null;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  const { error, success } = await searchParams;

  const user = await requireUser();

  const where = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const [products, stocks, movements] = await Promise.all([
    db.menuProduct.findMany({
      where,
      include: {
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
  ]);

  const stockByProductId = new Map(
    stocks.map((stock) => [stock.productId, stock])
  );

  const menuItems = products.map((product) => {
    const stock = stockByProductId.get(product.id);

    return {
      id: product.id,
      hotelId: product.hotelId,
      hotelName: product.hotel.name,
      name: product.name,
      isMenuActive: product.isAvailable,
      stockId: stock?.id ?? null,
      availableQty: stock?.availableQty ?? 0,
      soldQty: stock?.soldQty ?? 0,
      isSoldOut: stock?.isSoldOut ?? true,
      notes: stock?.notes ?? '',
      updatedAt: stock?.updatedAt?.toISOString() ?? null,
    };
  });

  const totalMenuItems = menuItems.length;
  const activeMenuItems = menuItems.filter((item) => item.isMenuActive).length;
  const availableItems = menuItems.filter(
    (item) => item.isMenuActive && item.availableQty > 0 && !item.isSoldOut
  ).length;
  const soldOutItems = menuItems.filter(
    (item) => item.isSoldOut || item.availableQty <= 0
  ).length;
  const totalAvailableQty = menuItems.reduce(
    (sum, item) => sum + item.availableQty,
    0
  );
  const totalSoldQty = menuItems.reduce((sum, item) => sum + item.soldQty, 0);

  return (
    <div>
      <PageHeader
        title="Menu Inventory Management"
        description="Manage menu item availability and live stock counts shown to guests."
      />

      <InventoryClient
        menuItems={menuItems}
        movements={movements.map((movement) => ({
          id: movement.id,
          hotelName: movement.hotel.name,
          productName: movement.product.name,
          type: movement.type,
          quantity: movement.quantity,
          balanceAfter: movement.balanceAfter,
          reason: movement.reason ?? '',
          createdAt: movement.createdAt.toISOString(),
        }))}
        message={getMessage(error, success)}
        summary={{
          totalMenuItems,
          activeMenuItems,
          availableItems,
          soldOutItems,
          totalAvailableQty,
          totalSoldQty,
        }}
      />
    </div>
  );
}