'use server';

import {
  MenuAvailabilityMovementType,
  MenuProductType,
  ServiceAvailabilityMovementType,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireRole, requireUser } from '@/lib/auth';
import { assertHotelScope } from '@/lib/access';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';
import { publishLowStockAlert } from '@/lib/realtime/dashboard-alerts';

const MENU_MANUAL_OPERATIONS: readonly MenuAvailabilityMovementType[] = [
  MenuAvailabilityMovementType.SET_STOCK,
  MenuAvailabilityMovementType.ADD_STOCK,
  MenuAvailabilityMovementType.REMOVE_STOCK,
  MenuAvailabilityMovementType.SOLD_OUT,
  MenuAvailabilityMovementType.REOPEN,
];

const SERVICE_MANUAL_OPERATIONS: readonly ServiceAvailabilityMovementType[] = [
  ServiceAvailabilityMovementType.SET_STOCK,
  ServiceAvailabilityMovementType.ADD_STOCK,
  ServiceAvailabilityMovementType.REMOVE_STOCK,
  ServiceAvailabilityMovementType.SOLD_OUT,
  ServiceAvailabilityMovementType.REOPEN,
];

const MENU_LOW_STOCK_THRESHOLD = 5;
const SERVICE_LOW_STOCK_THRESHOLD = 3;

type InventoryTab = 'menu' | 'services';

async function publishMenuLowStockIfNeeded(payload: {
  hotelId: string;
  productId: string;
  productName: string;
  availableQty: number;
  source: string;
}) {
  if (payload.availableQty > MENU_LOW_STOCK_THRESHOLD) {
    return;
  }

  try {
    await publishLowStockAlert({
      hotelId: payload.hotelId,
      inventoryItemId: payload.productId,
      itemName: payload.productName,
      availableQty: payload.availableQty,
      reorderLevel: MENU_LOW_STOCK_THRESHOLD,
      unit: 'items',
      source: payload.source,
    });
  } catch (error) {
    console.warn('Failed to publish menu low stock alert:', error);
  }
}

async function publishServiceLowStockIfNeeded(payload: {
  hotelId: string;
  serviceId: string;
  serviceName: string;
  availableQty: number;
  source: string;
}) {
  if (payload.availableQty > SERVICE_LOW_STOCK_THRESHOLD) {
    return;
  }

  try {
    await publishLowStockAlert({
      hotelId: payload.hotelId,
      inventoryItemId: payload.serviceId,
      itemName: payload.serviceName,
      availableQty: payload.availableQty,
      reorderLevel: SERVICE_LOW_STOCK_THRESHOLD,
      unit: 'slots',
      source: payload.source,
    });
  } catch (error) {
    console.warn('Failed to publish service low stock alert:', error);
  }
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
  revalidatePath('/dashboard/service-requests');
  revalidatePath('/dashboard/services');
  revalidatePath('/t/[tagCode]/menu', 'page');
  revalidatePath('/t/[tagCode]/service', 'page');
}

function finishInventoryAction({
  success,
  tab,
}: {
  success: string;
  tab: InventoryTab;
}) {
  revalidateInventoryPages();

  return {
    ok: true,
    success,
    tab,
  };
}

function getDefaultMenuMovementReason(operation: MenuAvailabilityMovementType) {
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

function getDefaultServiceMovementReason(
  operation: ServiceAvailabilityMovementType
) {
  if (operation === ServiceAvailabilityMovementType.SET_STOCK) {
    return 'Set exact available service stock';
  }

  if (operation === ServiceAvailabilityMovementType.ADD_STOCK) {
    return 'Added service stock';
  }

  if (operation === ServiceAvailabilityMovementType.REMOVE_STOCK) {
    return 'Removed service stock';
  }

  if (operation === ServiceAvailabilityMovementType.SOLD_OUT) {
    return 'Marked service item as sold out';
  }

  if (operation === ServiceAvailabilityMovementType.REOPEN) {
    return 'Reopened service item stock';
  }

  return 'Updated service stock';
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
    throw new Error('Product is required.');
  }

  if (
    !Object.values(MenuAvailabilityMovementType).includes(operation) ||
    !MENU_MANUAL_OPERATIONS.includes(operation)
  ) {
    throw new Error('Invalid inventory operation.');
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
    throw new Error('Menu product not found.');
  }

  assertHotelScope(user, product.hotelId);

  if (product.productType === MenuProductType.BUNDLE) {
    throw new Error('Bundle stock is derived from its component items.');
  }

  const requiresPositiveQuantity =
    operation === MenuAvailabilityMovementType.ADD_STOCK ||
    operation === MenuAvailabilityMovementType.REMOVE_STOCK ||
    operation === MenuAvailabilityMovementType.REOPEN;

  const requiresQuantity =
    operation === MenuAvailabilityMovementType.SET_STOCK ||
    requiresPositiveQuantity;

  if (requiresQuantity && quantity === null) {
    throw new Error('Please enter a valid quantity.');
  }

  if (requiresPositiveQuantity && (!quantity || quantity <= 0)) {
    throw new Error('Quantity must be greater than zero.');
  }

  const lowStockContext = await db.$transaction(async (tx) => {
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
        reason: reason || getDefaultMenuMovementReason(operation),
        userId: user.id,
      },
    });

    return {
      hotelId: product.hotelId,
      productId: product.id,
      productName: product.name,
      availableQty: nextQty,
      source: `MENU_${operation}`,
    };
  });

  await publishMenuLowStockIfNeeded(lowStockContext);

  return finishInventoryAction({
    success: 'stock-updated',
    tab: 'menu',
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

  return finishInventoryAction({
    success: 'stocks-initialized',
    tab: 'menu',
  });
}

export async function enableServiceInventoryAction(formData: FormData) {
  const user = await requireUser();

  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const serviceId = cleanText(formData.get('serviceId'));

  if (!serviceId) {
    throw new Error('Service is required.');
  }

  const service = await db.serviceCatalogItem.findUnique({
    where: {
      id: serviceId,
    },
    select: {
      id: true,
      hotelId: true,
      name: true,
      inventoryTracked: true,
    },
  });

  if (!service) {
    throw new Error('Service item not found.');
  }

  assertHotelScope(user, service.hotelId);

  await db.$transaction(async (tx) => {
    await tx.serviceCatalogItem.update({
      where: {
        id: service.id,
      },
      data: {
        inventoryTracked: true,
      },
    });

    await tx.serviceAvailabilityStock.upsert({
      where: {
        hotelId_serviceId: {
          hotelId: service.hotelId,
          serviceId: service.id,
        },
      },
      update: {},
      create: {
        hotelId: service.hotelId,
        serviceId: service.id,
        availableQty: 0,
        usedQty: 0,
        isSoldOut: true,
        notes: 'Initialized service inventory',
      },
    });
  });

  return finishInventoryAction({
    success: 'service-stock-enabled',
    tab: 'services',
  });
}

export async function disableServiceInventoryAction(formData: FormData) {
  const user = await requireUser();

  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const serviceId = cleanText(formData.get('serviceId'));

  if (!serviceId) {
    throw new Error('Service is required.');
  }

  const service = await db.serviceCatalogItem.findUnique({
    where: {
      id: serviceId,
    },
    select: {
      id: true,
      hotelId: true,
    },
  });

  if (!service) {
    throw new Error('Service item not found.');
  }

  assertHotelScope(user, service.hotelId);

  await db.serviceCatalogItem.update({
    where: {
      id: service.id,
    },
    data: {
      inventoryTracked: false,
    },
  });

  return finishInventoryAction({
    success: 'service-stock-disabled',
    tab: 'services',
  });
}

export async function initializeServiceStocksAction() {
  const user = await requireUser();

  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const where =
    user.role === 'SUPER_ADMIN'
      ? {
          inventoryTracked: true,
        }
      : {
          hotelId: user.hotelId!,
          inventoryTracked: true,
        };

  const services = await db.serviceCatalogItem.findMany({
    where,
    select: {
      id: true,
      hotelId: true,
    },
  });

  await Promise.all(
    services.map((service) =>
      db.serviceAvailabilityStock.upsert({
        where: {
          hotelId_serviceId: {
            hotelId: service.hotelId,
            serviceId: service.id,
          },
        },
        update: {},
        create: {
          hotelId: service.hotelId,
          serviceId: service.id,
          availableQty: 0,
          usedQty: 0,
          isSoldOut: true,
          notes: 'Initialized service inventory',
        },
      })
    )
  );

  return finishInventoryAction({
    success: 'service-stocks-initialized',
    tab: 'services',
  });
}

export async function controlServiceStockAction(formData: FormData) {
  const user = await requireUser();

  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const serviceId = cleanText(formData.get('serviceId'));
  const operation = formData.get(
    'operation'
  ) as ServiceAvailabilityMovementType;
  const quantity = parseWholeNumber(formData.get('quantity'));
  const reason = cleanText(formData.get('reason'), 300);
  const notes = cleanText(formData.get('notes'), 300);

  if (!serviceId) {
    throw new Error('Service is required.');
  }

  if (
    !Object.values(ServiceAvailabilityMovementType).includes(operation) ||
    !SERVICE_MANUAL_OPERATIONS.includes(operation)
  ) {
    throw new Error('Invalid service inventory operation.');
  }

  const service = await db.serviceCatalogItem.findUnique({
    where: {
      id: serviceId,
    },
    select: {
      id: true,
      hotelId: true,
      name: true,
      inventoryTracked: true,
    },
  });

  if (!service) {
    throw new Error('Service item not found.');
  }

  assertHotelScope(user, service.hotelId);

  const requiresPositiveQuantity =
    operation === ServiceAvailabilityMovementType.ADD_STOCK ||
    operation === ServiceAvailabilityMovementType.REMOVE_STOCK ||
    operation === ServiceAvailabilityMovementType.REOPEN;

  const requiresQuantity =
    operation === ServiceAvailabilityMovementType.SET_STOCK ||
    requiresPositiveQuantity;

  if (requiresQuantity && quantity === null) {
    throw new Error('Please enter a valid quantity.');
  }

  if (requiresPositiveQuantity && (!quantity || quantity <= 0)) {
    throw new Error('Quantity must be greater than zero.');
  }

  const lowStockContext = await db.$transaction(async (tx) => {
    await tx.serviceCatalogItem.update({
      where: {
        id: service.id,
      },
      data: {
        inventoryTracked: true,
      },
    });

    const existingStock = await tx.serviceAvailabilityStock.findUnique({
      where: {
        hotelId_serviceId: {
          hotelId: service.hotelId,
          serviceId: service.id,
        },
      },
    });

    const currentQty = existingStock?.availableQty ?? 0;
    let nextQty = currentQty;
    let movementQty = quantity ?? 0;

    if (operation === ServiceAvailabilityMovementType.SET_STOCK) {
      nextQty = quantity ?? 0;
      movementQty = nextQty;
    }

    if (operation === ServiceAvailabilityMovementType.ADD_STOCK) {
      nextQty = currentQty + quantity!;
      movementQty = quantity!;
    }

    if (operation === ServiceAvailabilityMovementType.REMOVE_STOCK) {
      movementQty = Math.min(quantity!, currentQty);
      nextQty = Math.max(currentQty - quantity!, 0);
    }

    if (operation === ServiceAvailabilityMovementType.SOLD_OUT) {
      movementQty = currentQty;
      nextQty = 0;
    }

    if (operation === ServiceAvailabilityMovementType.REOPEN) {
      nextQty = currentQty + quantity!;
      movementQty = quantity!;
    }

    const stock = await tx.serviceAvailabilityStock.upsert({
      where: {
        hotelId_serviceId: {
          hotelId: service.hotelId,
          serviceId: service.id,
        },
      },
      update: {
        availableQty: nextQty,
        isSoldOut: nextQty <= 0,
        notes: notes || null,
      },
      create: {
        hotelId: service.hotelId,
        serviceId: service.id,
        availableQty: nextQty,
        usedQty: 0,
        isSoldOut: nextQty <= 0,
        notes: notes || null,
      },
    });

    await tx.serviceAvailabilityMovement.create({
      data: {
        hotelId: service.hotelId,
        serviceId: service.id,
        stockId: stock.id,
        type: operation,
        quantity: movementQty,
        balanceAfter: nextQty,
        reason: reason || getDefaultServiceMovementReason(operation),
        userId: user.id,
      },
    });

    return {
      hotelId: service.hotelId,
      serviceId: service.id,
      serviceName: service.name,
      availableQty: nextQty,
      source: `SERVICE_${operation}`,
    };
  });

  await publishServiceLowStockIfNeeded(lowStockContext);

  return finishInventoryAction({
    success: 'service-stock-updated',
    tab: 'services',
  });
}
