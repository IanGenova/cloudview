'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { TagType } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

const LOCATION_TYPES = [
  'ROOM',
  'POOL',
  'LOBBY',
  'RESTAURANT',
  'PARKING',
  'AMENITY',
  'GYM',
  'BAR',
  'OTHER',
] as const satisfies readonly TagType[];

const roomSchema = z.object({
  hotelId: z.string().min(1),
  number: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  floor: z.string().optional(),
  isActive: z.boolean().default(true),
});

const updateRoomSchema = roomSchema.extend({
  roomId: z.string().min(1),
});

const locationSchema = z.object({
  hotelId: z.string().min(1),
  name: z.string().min(1).max(160),
  type: z.enum(LOCATION_TYPES),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

const updateLocationSchema = locationSchema.extend({
  locationId: z.string().min(1),
});

type DirectoryTab = 'rooms' | 'locations';

function cleanText(value: FormDataEntryValue | null, max = 500) {
  return String(value || '').trim().slice(0, max);
}

async function assertHotelAccess(hotelId: string) {
  const user = await requireUser();

  if (user.role !== 'SUPER_ADMIN' && user.hotelId !== hotelId) {
    throw new Error('You are not allowed to manage this hotel.');
  }

  return user;
}

function redirectLocations({
  success,
  error,
  tab,
}: {
  success?: string;
  error?: string;
  tab: DirectoryTab;
}): never {
  revalidatePath('/dashboard/locations');
  revalidatePath('/dashboard/tags');

  const params = new URLSearchParams();

  params.set('tab', tab);

  if (success) {
    params.set('success', success);
  }

  if (error) {
    params.set('error', error);
  }

  redirect(`/dashboard/locations?${params.toString()}`);
}

export async function createRoomAction(formData: FormData) {
  const user = await requireUser();

  const parsed = roomSchema.parse({
    hotelId: formData.get('hotelId') || user.hotelId,
    number: cleanText(formData.get('number'), 80),
    name: cleanText(formData.get('name'), 160),
    floor: cleanText(formData.get('floor'), 120),
    isActive: true,
  });

  await assertHotelAccess(parsed.hotelId);

  const existingRoom = await db.room.findUnique({
    where: {
      hotelId_number: {
        hotelId: parsed.hotelId,
        number: parsed.number,
      },
    },
    select: {
      id: true,
      deletedAt: true,
    },
  });

  if (existingRoom && !existingRoom.deletedAt) {
    redirectLocations({
      error: 'room-number-exists',
      tab: 'rooms',
    });
  }

  if (existingRoom?.deletedAt) {
    await db.room.update({
      where: {
        id: existingRoom.id,
      },
      data: {
        name: parsed.name,
        floor: parsed.floor || null,
        isActive: true,
        deletedAt: null,
      },
    });

    redirectLocations({
      success: 'room-created',
      tab: 'rooms',
    });
  }

  await db.room.create({
    data: {
      hotelId: parsed.hotelId,
      number: parsed.number,
      name: parsed.name,
      floor: parsed.floor || null,
      isActive: true,
      deletedAt: null,
    },
  });

  redirectLocations({
    success: 'room-created',
    tab: 'rooms',
  });
}

export async function updateRoomAction(formData: FormData) {
  const roomId = cleanText(formData.get('roomId'));

  const existing = await db.room.findUnique({
    where: {
      id: roomId,
    },
  });

  if (!existing) {
    redirectLocations({
      error: 'room-not-found',
      tab: 'rooms',
    });
  }

  const parsed = updateRoomSchema.parse({
    roomId,
    hotelId: formData.get('hotelId') || existing.hotelId,
    number: cleanText(formData.get('number'), 80),
    name: cleanText(formData.get('name'), 160),
    floor: cleanText(formData.get('floor'), 120),
    isActive: formData.get('isActive') === 'on',
  });

  await assertHotelAccess(existing.hotelId);
  await assertHotelAccess(parsed.hotelId);

  const duplicateRoom = await db.room.findUnique({
    where: {
      hotelId_number: {
        hotelId: parsed.hotelId,
        number: parsed.number,
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicateRoom && duplicateRoom.id !== parsed.roomId) {
    redirectLocations({
      error: 'room-number-exists',
      tab: 'rooms',
    });
  }

  await db.room.update({
    where: {
      id: parsed.roomId,
    },
    data: {
      hotelId: parsed.hotelId,
      number: parsed.number,
      name: parsed.name,
      floor: parsed.floor || null,
      isActive: parsed.isActive,
    },
  });

  redirectLocations({
    success: 'room-updated',
    tab: 'rooms',
  });
}

export async function deleteRoomAction(formData: FormData) {
  const roomId = cleanText(formData.get('roomId'));

  const room = await db.room.findUnique({
    where: {
      id: roomId,
    },
  });

  if (!room) {
    redirectLocations({
      error: 'room-not-found',
      tab: 'rooms',
    });
  }

  await assertHotelAccess(room.hotelId);

  await db.$transaction([
    db.nfcTag.updateMany({
      where: {
        roomId: room.id,
      },
      data: {
        roomId: null,
      },
    }),

    db.room.update({
      where: {
        id: room.id,
      },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    }),
  ]);

  redirectLocations({
    success: 'room-deleted',
    tab: 'rooms',
  });
}

export async function createLocationAction(formData: FormData) {
  const user = await requireUser();

  const parsed = locationSchema.parse({
    hotelId: formData.get('hotelId') || user.hotelId,
    name: cleanText(formData.get('name'), 160),
    type: formData.get('type'),
    description: cleanText(formData.get('description'), 500),
    isActive: true,
  });

  await assertHotelAccess(parsed.hotelId);

  await db.location.create({
    data: {
      hotelId: parsed.hotelId,
      name: parsed.name,
      type: parsed.type,
      description: parsed.description || null,
      isActive: true,
      deletedAt: null,
    },
  });

  redirectLocations({
    success: 'location-created',
    tab: 'locations',
  });
}

export async function updateLocationAction(formData: FormData) {
  const locationId = cleanText(formData.get('locationId'));

  const existing = await db.location.findUnique({
    where: {
      id: locationId,
    },
  });

  if (!existing) {
    redirectLocations({
      error: 'location-not-found',
      tab: 'locations',
    });
  }

  const parsed = updateLocationSchema.parse({
    locationId,
    hotelId: formData.get('hotelId') || existing.hotelId,
    name: cleanText(formData.get('name'), 160),
    type: formData.get('type'),
    description: cleanText(formData.get('description'), 500),
    isActive: formData.get('isActive') === 'on',
  });

  await assertHotelAccess(existing.hotelId);
  await assertHotelAccess(parsed.hotelId);

  await db.location.update({
    where: {
      id: parsed.locationId,
    },
    data: {
      hotelId: parsed.hotelId,
      name: parsed.name,
      type: parsed.type,
      description: parsed.description || null,
      isActive: parsed.isActive,
    },
  });

  redirectLocations({
    success: 'location-updated',
    tab: 'locations',
  });
}

export async function deleteLocationAction(formData: FormData) {
  const locationId = cleanText(formData.get('locationId'));

  const location = await db.location.findUnique({
    where: {
      id: locationId,
    },
  });

  if (!location) {
    redirectLocations({
      error: 'location-not-found',
      tab: 'locations',
    });
  }

  await assertHotelAccess(location.hotelId);

  await db.$transaction([
    db.nfcTag.updateMany({
      where: {
        locationId: location.id,
      },
      data: {
        locationId: null,
      },
    }),

    db.location.update({
      where: {
        id: location.id,
      },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    }),
  ]);

  redirectLocations({
    success: 'location-deleted',
    tab: 'locations',
  });
}