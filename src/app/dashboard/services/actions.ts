'use server';

import { Role, ServiceBillingMode } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireRole, requireUser } from '@/lib/auth';
import { assertHotelScope, scopedHotelId } from '@/lib/access';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';

const DEFAULT_SERVICES = [
  {
    name: 'Extra Towels',
    code: 'EXTRA_TOWELS',
    category: 'Housekeeping',
    iconKey: 'Waves',
    billingMode: ServiceBillingMode.FIXED_PRICE,
    unitPrice: 50,
    unitLabel: 'per set',
    description: 'Extra towel set delivered to the room.',
    sortOrder: 1,
  },
  {
    name: 'Room Cleaning',
    code: 'ROOM_CLEANING',
    category: 'Housekeeping',
    iconKey: 'Sparkles',
    billingMode: ServiceBillingMode.FREE,
    unitPrice: 0,
    unitLabel: '',
    description: 'Standard room cleaning request.',
    sortOrder: 2,
  },
  {
    name: 'Laundry',
    code: 'LAUNDRY',
    category: 'Housekeeping',
    iconKey: 'Shirt',
    billingMode: ServiceBillingMode.PRICE_ON_CONFIRMATION,
    unitPrice: 0,
    unitLabel: '',
    description: 'Laundry service. Final price depends on item count.',
    sortOrder: 3,
  },
  {
    name: 'Maintenance',
    code: 'MAINTENANCE',
    category: 'Room Assistance',
    iconKey: 'Hammer',
    billingMode: ServiceBillingMode.FREE,
    unitPrice: 0,
    unitLabel: '',
    description: 'Report an issue inside the room.',
    sortOrder: 4,
  },
  {
    name: 'Extra Amenities',
    code: 'EXTRA_AMENITIES',
    category: 'Room Assistance',
    iconKey: 'PackagePlus',
    billingMode: ServiceBillingMode.FIXED_PRICE,
    unitPrice: 80,
    unitLabel: 'per set',
    description: 'Extra room amenities delivered to the room.',
    sortOrder: 5,
  },
  {
    name: 'Baby Cot',
    code: 'BABY_COT',
    category: 'Room Assistance',
    iconKey: 'Baby',
    billingMode: ServiceBillingMode.FIXED_PRICE,
    unitPrice: 300,
    unitLabel: 'per night',
    description: 'Baby cot setup in the room.',
    sortOrder: 6,
  },
  {
    name: 'Airport Transfer',
    code: 'AIRPORT_TRANSFER',
    category: 'Concierge',
    iconKey: 'Car',
    billingMode: ServiceBillingMode.PRICE_ON_CONFIRMATION,
    unitPrice: 0,
    unitLabel: '',
    description: 'Airport transfer request. Staff will confirm the final price.',
    sortOrder: 7,
  },
  {
    name: 'Toiletries',
    code: 'TOILETRIES',
    category: 'Concierge',
    iconKey: 'SprayCan',
    billingMode: ServiceBillingMode.FIXED_PRICE,
    unitPrice: 50,
    unitLabel: 'per set',
    description: 'Additional toiletries delivered to the room.',
    sortOrder: 8,
  },
  {
    name: 'Late Checkout',
    code: 'LATE_CHECKOUT',
    category: 'Concierge',
    iconKey: 'Clock',
    billingMode: ServiceBillingMode.PRICE_ON_CONFIRMATION,
    unitPrice: 0,
    unitLabel: '',
    description: 'Late checkout request subject to availability.',
    sortOrder: 9,
  },
  {
    name: 'Water Refill',
    code: 'WATER_REFILL',
    category: 'Essentials',
    iconKey: 'Droplets',
    billingMode: ServiceBillingMode.FREE,
    unitPrice: 0,
    unitLabel: '',
    description: 'Water refill request.',
    sortOrder: 10,
  },
  {
    name: 'Extra Pillow',
    code: 'EXTRA_PILLOW',
    category: 'Essentials',
    iconKey: 'BedDouble',
    billingMode: ServiceBillingMode.FIXED_PRICE,
    unitPrice: 75,
    unitLabel: 'per pillow',
    description: 'Extra pillow delivered to the room.',
    sortOrder: 11,
  },
  {
    name: 'Other Request',
    code: 'OTHER_REQUEST',
    category: 'Essentials',
    iconKey: 'ConciergeBell',
    billingMode: ServiceBillingMode.PRICE_ON_CONFIRMATION,
    unitPrice: 0,
    unitLabel: '',
    description: 'Custom request. Staff will review and confirm details.',
    sortOrder: 12,
  },
];

function finishServicesAction(success: string) {
  revalidatePath('/dashboard/services');
  revalidatePath('/dashboard/service-requests');
  revalidatePath('/t/[tagCode]', 'page');

  return {
    ok: true,
    success,
  };
}

function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function parseMoney(value: FormDataEntryValue | null) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

function parseSortOrder(value: FormDataEntryValue | null) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return 0;
  }

  return parsed;
}

function validateBillingMode(value: FormDataEntryValue | null) {
  const billingMode = value as ServiceBillingMode;

  if (!Object.values(ServiceBillingMode).includes(billingMode)) {
    return null;
  }

  return billingMode;
}

export async function createServiceCatalogItemAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const hotelId = scopedHotelId(user, cleanText(formData.get('hotelId')));
  const name = cleanText(formData.get('name'), 120);
  const rawCode = cleanText(formData.get('code'), 80);
  const category = cleanText(formData.get('category'), 80);
  const description = cleanText(formData.get('description'), 500);
  const iconKey = cleanText(formData.get('iconKey'), 80) || 'ConciergeBell';
  const billingMode = validateBillingMode(formData.get('billingMode'));
  const unitPrice = parseMoney(formData.get('unitPrice'));
  const unitLabel = cleanText(formData.get('unitLabel'), 80);
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  const isActive = formData.get('isActive') === 'true';

  if (!hotelId) {
    throw new Error('Hotel is required.');
  }

  if (!name) {
    throw new Error('Service name is required.');
  }

  if (!category) {
    throw new Error('Category is required.');
  }

  if (!billingMode) {
    throw new Error('Billing mode is required.');
  }

  if (unitPrice === null) {
    throw new Error('Unit price must be valid.');
  }

  if (billingMode === ServiceBillingMode.FIXED_PRICE && unitPrice <= 0) {
    throw new Error('Fixed-price services must have a price greater than zero.');
  }

  const code = normalizeCode(rawCode || name);

  if (!code) {
    throw new Error('Service code is required.');
  }

  await db.serviceCatalogItem.create({
    data: {
      hotelId,
      name,
      code,
      category,
      description: description || null,
      iconKey,
      billingMode,
      unitPrice: unitPrice.toFixed(2),
      unitLabel: unitLabel || null,
      sortOrder,
      isActive,
    },
  });

  return finishServicesAction('created');
}

export async function updateServiceCatalogItemAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const itemId = cleanText(formData.get('itemId'));
  const name = cleanText(formData.get('name'), 120);
  const rawCode = cleanText(formData.get('code'), 80);
  const category = cleanText(formData.get('category'), 80);
  const description = cleanText(formData.get('description'), 500);
  const iconKey = cleanText(formData.get('iconKey'), 80) || 'ConciergeBell';
  const billingMode = validateBillingMode(formData.get('billingMode'));
  const unitPrice = parseMoney(formData.get('unitPrice'));
  const unitLabel = cleanText(formData.get('unitLabel'), 80);
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  const isActive = formData.get('isActive') === 'true';

  if (!itemId) {
    throw new Error('Service item is required.');
  }

  if (!name) {
    throw new Error('Service name is required.');
  }

  if (!category) {
    throw new Error('Category is required.');
  }

  if (!billingMode) {
    throw new Error('Billing mode is required.');
  }

  if (unitPrice === null) {
    throw new Error('Unit price must be valid.');
  }

  if (billingMode === ServiceBillingMode.FIXED_PRICE && unitPrice <= 0) {
    throw new Error('Fixed-price services must have a price greater than zero.');
  }

  const item = await db.serviceCatalogItem.findUnique({
    where: {
      id: itemId,
    },
  });

  if (!item) {
    throw new Error('Service item not found.');
  }

  assertHotelScope(user, item.hotelId);

  const code = normalizeCode(rawCode || name);

  if (!code) {
    throw new Error('Service code is required.');
  }

  await db.serviceCatalogItem.update({
    where: {
      id: item.id,
    },
    data: {
      name,
      code,
      category,
      description: description || null,
      iconKey,
      billingMode,
      unitPrice: unitPrice.toFixed(2),
      unitLabel: unitLabel || null,
      sortOrder,
      isActive,
    },
  });

  return finishServicesAction('updated');
}

export async function deleteServiceCatalogItemAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const itemId = cleanText(formData.get('itemId'));

  if (!itemId) {
    throw new Error('Service item is required.');
  }

  const item = await db.serviceCatalogItem.findUnique({
    where: {
      id: itemId,
    },
  });

  if (!item) {
    throw new Error('Service item not found.');
  }

  assertHotelScope(user, item.hotelId);

  await db.serviceCatalogItem.delete({
    where: {
      id: item.id,
    },
  });

  return finishServicesAction('deleted');
}

export async function seedDefaultServicesAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const hotelId = scopedHotelId(user, cleanText(formData.get('hotelId')));

  if (!hotelId) {
    throw new Error('Hotel is required.');
  }

  await Promise.all(
    DEFAULT_SERVICES.map((service) =>
      db.serviceCatalogItem.upsert({
        where: {
          hotelId_code: {
            hotelId,
            code: service.code,
          },
        },
        update: {},
        create: {
          hotelId,
          code: service.code,
          name: service.name,
          category: service.category,
          iconKey: service.iconKey,
          billingMode: service.billingMode,
          unitPrice: service.unitPrice.toFixed(2),
          unitLabel: service.unitLabel || null,
          description: service.description,
          sortOrder: service.sortOrder,
          isActive: true,
        },
      })
    )
  );

  return finishServicesAction('seeded');
}