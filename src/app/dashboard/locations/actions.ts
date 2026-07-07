'use server';

import { DashboardModule, Role, type TagType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';

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

type ScopedUser = {
  id: string;
  role: Role;
  hotelId: string | null;
};

function cleanText(value: FormDataEntryValue | null, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function assertHotelAccess(user: ScopedUser, hotelId: string) {
  if (user.role !== Role.SUPER_ADMIN && user.hotelId !== hotelId) {
    throw new Error('You are not allowed to manage this hotel.');
  }
}

function finishDirectoryAction({
  success,
  tab,
}: {
  success: string;
  tab: DirectoryTab;
}) {
  revalidatePath('/dashboard/locations');
  revalidatePath('/dashboard/tags');

  return {
    ok: true,
    success,
    tab,
  };
}

export async function createRoomAction(formData: FormData) {
  const user = await requireDashboardPermission(
    DashboardModule.ROOMS_LOCATIONS,
    'canCreate'
  );

  const parsed = roomSchema.parse({
    hotelId: formData.get('hotelId') || user.hotelId,
    number: cleanText(formData.get('number'), 80),
    name: cleanText(formData.get('name'), 160),
    floor: cleanText(formData.get('floor'), 120),
    isActive: true,
  });

  assertHotelAccess(user, parsed.hotelId);

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
    throw new Error(
      `Room number "${parsed.number}" already exists for this hotel.`
    );
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

    return finishDirectoryAction({
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

  return finishDirectoryAction({
    success: 'room-created',
    tab: 'rooms',
  });
}

export async function updateRoomAction(formData: FormData) {
  const user = await requireDashboardPermission(
    DashboardModule.ROOMS_LOCATIONS,
    'canEdit'
  );

  const roomId = cleanText(formData.get('roomId'));

  const existing = await db.room.findUnique({
    where: {
      id: roomId,
    },
  });

  if (!existing) {
    throw new Error('Room not found.');
  }

  const parsed = updateRoomSchema.parse({
    roomId,
    hotelId: formData.get('hotelId') || existing.hotelId,
    number: cleanText(formData.get('number'), 80),
    name: cleanText(formData.get('name'), 160),
    floor: cleanText(formData.get('floor'), 120),
    isActive: formData.get('isActive') === 'on',
  });

  assertHotelAccess(user, existing.hotelId);
  assertHotelAccess(user, parsed.hotelId);

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
    throw new Error(
      `Room number "${parsed.number}" already exists for this hotel.`
    );
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

  return finishDirectoryAction({
    success: 'room-updated',
    tab: 'rooms',
  });
}

export async function deleteRoomAction(formData: FormData) {
  const user = await requireDashboardPermission(
    DashboardModule.ROOMS_LOCATIONS,
    'canDelete'
  );

  const roomId = cleanText(formData.get('roomId'));

  const room = await db.room.findUnique({
    where: {
      id: roomId,
    },
  });

  if (!room) {
    throw new Error('Room not found.');
  }

  assertHotelAccess(user, room.hotelId);

  const attachedTagsCount = await db.nfcTag.count({
    where: {
      roomId: room.id,
      deletedAt: null,
    },
  });

  if (attachedTagsCount > 0) {
    throw new Error(
      `Cannot delete this room. There ${
        attachedTagsCount === 1 ? 'is 1 NFC tag' : `are ${attachedTagsCount} NFC tags`
      } still assigned to it. Please reassign or delete the tags first.`
    );
  }

  await db.room.update({
    where: {
      id: room.id,
    },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });

  return finishDirectoryAction({
    success: 'room-deleted',
    tab: 'rooms',
  });
}

export async function createLocationAction(formData: FormData) {
  const user = await requireDashboardPermission(
    DashboardModule.ROOMS_LOCATIONS,
    'canCreate'
  );

  const parsed = locationSchema.parse({
    hotelId: formData.get('hotelId') || user.hotelId,
    name: cleanText(formData.get('name'), 160),
    type: formData.get('type'),
    description: cleanText(formData.get('description'), 500),
    isActive: true,
  });

  assertHotelAccess(user, parsed.hotelId);

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

  return finishDirectoryAction({
    success: 'location-created',
    tab: 'locations',
  });
}

export async function updateLocationAction(formData: FormData) {
  const user = await requireDashboardPermission(
    DashboardModule.ROOMS_LOCATIONS,
    'canEdit'
  );

  const locationId = cleanText(formData.get('locationId'));

  const existing = await db.location.findUnique({
    where: {
      id: locationId,
    },
  });

  if (!existing) {
    throw new Error('Location not found.');
  }

  const parsed = updateLocationSchema.parse({
    locationId,
    hotelId: formData.get('hotelId') || existing.hotelId,
    name: cleanText(formData.get('name'), 160),
    type: formData.get('type'),
    description: cleanText(formData.get('description'), 500),
    isActive: formData.get('isActive') === 'on',
  });

  assertHotelAccess(user, existing.hotelId);
  assertHotelAccess(user, parsed.hotelId);

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

  return finishDirectoryAction({
    success: 'location-updated',
    tab: 'locations',
  });
}

export async function deleteLocationAction(formData: FormData) {
  const user = await requireDashboardPermission(
    DashboardModule.ROOMS_LOCATIONS,
    'canDelete'
  );

  const locationId = cleanText(formData.get('locationId'));

  const location = await db.location.findUnique({
    where: {
      id: locationId,
    },
  });

  if (!location) {
    throw new Error('Location not found.');
  }

  assertHotelAccess(user, location.hotelId);

  const attachedTagsCount = await db.nfcTag.count({
    where: {
      locationId: location.id,
      deletedAt: null,
    },
  });

  if (attachedTagsCount > 0) {
    throw new Error(
      `Cannot delete this location. There ${
        attachedTagsCount === 1 ? 'is 1 NFC tag' : `are ${attachedTagsCount} NFC tags`
      } still assigned to it. Please reassign or delete the tags first.`
    );
  }

  await db.location.update({
    where: {
      id: location.id,
    },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });

  return finishDirectoryAction({
    success: 'location-deleted',
    tab: 'locations',
  });
}
