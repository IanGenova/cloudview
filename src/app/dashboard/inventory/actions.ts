'use server';

import {
  MenuAvailabilityMovementType,
  MenuProductType,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole, requireUser } from '@/lib/auth';
import { assertHotelScope } from '@/lib/access';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';

const MANUAL_OPERATIONS: readonly MenuAvailabilityMovementType[] = [
  MenuAvailabilityMovementType.SET_STOCK,
  MenuAvailabilityMovementType.ADD_STOCK,
  MenuAvailabilityMovementType.REMOVE_STOCK,
  MenuAvailabilityMovementType.SOLD_OUT,
  MenuAvailabilityMovementType.REOPEN,
];

function redirectToInventory(params: {
  error?: string;
  success?: string;
}) {
  const query = new URLSearchParams();

  if (params.error) {
    query.set('error', params.error);
  }

  if (params.success) {
    query.set('success', params.success);
  }

  redirect(`/dashboard/inventory?${query.toString()}`);
}

function parseWholeNumber(value: FormDataEntryValue | null) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function revalidateInventoryPages() {
  revalidatePath('/dashboard/inventory');
  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard/pos');
  revalidatePath('/dashboard/kitchen');
  revalidatePath('/t/[tagCode]/menu', 'page');
}

function getDefaultMovementReason(operation: MenuAvailabilityMovementType) {
  if (operation === MenuAvailabilityMovementType.SET_STOCK) {
    return 'Set exact available menu stock';
  }

  if (operation === MenuAvailabilityMovementType.ADD_STOCK) {
    return 'Added menu stock';
  }

  if (operation === MenuAvailabilityMovementType.REMOVE_STOCK) {
    return 'Removed menu stock';
  }

  if (operation === MenuAvailabilityMovementType.SOLD_OUT) {
    return 'Marked menu item as sold out';
  }

  if (operation === MenuAvailabilityMovementType.REOPEN) {
    return 'Reopened menu item stock';
  }

  return 'Updated menu stock';
}

export async function controlMenuStockAction(formData: FormData) {
  const user = await requireUser();

  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const productId = cleanText(formData.get('productId'));
  const operation = formData.get(
    'operation'
  ) as MenuAvailabilityMovementType;
  const quantity = parseWholeNumber(formData.get('quantity'));
  const reason = cleanText(formData.get('reason'), 300);
  const notes = cleanText(formData.get('notes'), 300);

  if (!productId) {
    redirectToInventory({
      error: 'product-required',
    });
  }

  if (
    !Object.values(MenuAvailabilityMovementType).includes(operation) ||
    !MANUAL_OPERATIONS.includes(operation)
  ) {
    redirectToInventory({
      error: 'invalid-operation',
    });
  }

  const product = await db.menuProduct.findUnique({
    where: {
      id: productId,
    },
    select: {
      id: true,
      hotelId: true,
      name: true,
      productType: true,
    },
  });

  if (!product) {
    redirectToInventory({
      error: 'product-not-found',
    });
  }

  assertHotelScope(user, product.hotelId);

  if (product.productType === MenuProductType.BUNDLE) {
    redirectToInventory({
      error: 'bundle-stock-derived',
    });
  }

  const requiresPositiveQuantity =
    operation === MenuAvailabilityMovementType.ADD_STOCK ||
    operation === MenuAvailabilityMovementType.REMOVE_STOCK ||
    operation === MenuAvailabilityMovementType.REOPEN;

  const requiresQuantity =
    operation === MenuAvailabilityMovementType.SET_STOCK ||
    requiresPositiveQuantity;

  if (requiresQuantity && quantity === null) {
    redirectToInventory({
      error: 'invalid-quantity',
    });
  }

  if (requiresPositiveQuantity && (!quantity || quantity <= 0)) {
    redirectToInventory({
      error: 'positive-quantity-required',
    });
  }

  await db.$transaction(async (tx) => {
    const existingStock = await tx.menuAvailabilityStock.findUnique({
      where: {
        hotelId_productId: {
          hotelId: product.hotelId,
          productId: product.id,
        },
      },
    });

    const currentQty = existingStock?.availableQty ?? 0;
    let nextQty = currentQty;
    let movementQty = quantity ?? 0;

    if (operation === MenuAvailabilityMovementType.SET_STOCK) {
      nextQty = quantity ?? 0;
      movementQty = nextQty;
    }

    if (operation === MenuAvailabilityMovementType.ADD_STOCK) {
      nextQty = currentQty + quantity!;
      movementQty = quantity!;
    }

    if (operation === MenuAvailabilityMovementType.REMOVE_STOCK) {
      movementQty = Math.min(quantity!, currentQty);
      nextQty = Math.max(currentQty - quantity!, 0);
    }

    if (operation === MenuAvailabilityMovementType.SOLD_OUT) {
      movementQty = currentQty;
      nextQty = 0;
    }

    if (operation === MenuAvailabilityMovementType.REOPEN) {
      nextQty = currentQty + quantity!;
      movementQty = quantity!;
    }

    const stock = await tx.menuAvailabilityStock.upsert({
      where: {
        hotelId_productId: {
          hotelId: product.hotelId,
          productId: product.id,
        },
      },
      update: {
        availableQty: nextQty,
        isSoldOut: nextQty <= 0,
        notes: notes || null,
      },
      create: {
        hotelId: product.hotelId,
        productId: product.id,
        availableQty: nextQty,
        soldQty: 0,
        isSoldOut: nextQty <= 0,
        notes: notes || null,
      },
    });

    await tx.menuAvailabilityMovement.create({
      data: {
        hotelId: product.hotelId,
        productId: product.id,
        stockId: stock.id,
        type: operation,
        quantity: movementQty,
        balanceAfter: nextQty,
        reason: reason || getDefaultMovementReason(operation),
        userId: user.id,
      },
    });
  });

  revalidateInventoryPages();

  redirectToInventory({
    success: 'stock-updated',
  });
}

export async function initializeMenuStocksAction() {
  const user = await requireUser();

  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const where =
    user.role === 'SUPER_ADMIN'
      ? {
          productType: MenuProductType.SINGLE,
        }
      : {
          hotelId: user.hotelId!,
          productType: MenuProductType.SINGLE,
        };

  const products = await db.menuProduct.findMany({
    where,
    select: {
      id: true,
      hotelId: true,
      productType: true,
    },
  });

  await Promise.all(
    products.map((product) =>
      db.menuAvailabilityStock.upsert({
        where: {
          hotelId_productId: {
            hotelId: product.hotelId,
            productId: product.id,
          },
        },
        update: {},
        create: {
          hotelId: product.hotelId,
          productId: product.id,
          availableQty: 0,
          soldQty: 0,
          isSoldOut: true,
          notes: 'Initialized menu stock',
        },
      })
    )
  );

  revalidateInventoryPages();

  redirectToInventory({
    success: 'stocks-initialized',
  });
}