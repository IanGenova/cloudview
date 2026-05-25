'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { TagType } from '@prisma/client';

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
  isActive: z.boolean().default(true)
});

const updateRoomSchema = roomSchema.extend({
  roomId: z.string().min(1)
});

const locationSchema = z.object({
  hotelId: z.string().min(1),
  name: z.string().min(1).max(160),
  type: z.enum(LOCATION_TYPES),
  description: z.string().optional(),
  isActive: z.boolean().default(true)
});

const updateLocationSchema = locationSchema.extend({
  locationId: z.string().min(1)
});

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

function redirectLocations(success: string) {
  revalidatePath('/dashboard/locations');
  revalidatePath('/dashboard/tags');

  redirect(`/dashboard/locations?success=${success}`);
}

export async function createRoomAction(formData: FormData) {
  const user = await requireUser();

  const parsed = roomSchema.parse({
    hotelId: formData.get('hotelId') || user.hotelId,
    number: cleanText(formData.get('number'), 80),
    name: cleanText(formData.get('name'), 160),
    floor: cleanText(formData.get('floor'), 120),
    isActive: true
  });

  await assertHotelAccess(parsed.hotelId);

  await db.room.create({
    data: {
      hotelId: parsed.hotelId,
      number: parsed.number,
      name: parsed.name,
      floor: parsed.floor || null,
      isActive: true,
      deletedAt: null
    }
  });

  redirectLocations('room-created');
}

export async function updateRoomAction(formData: FormData) {
  const roomId = String(formData.get('roomId') || '');

  const existing = await db.room.findUnique({
    where: { id: roomId }
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
    isActive: formData.get('isActive') === 'on'
  });

  await assertHotelAccess(existing.hotelId);
  await assertHotelAccess(parsed.hotelId);

  await db.room.update({
    where: { id: parsed.roomId },
    data: {
      hotelId: parsed.hotelId,
      number: parsed.number,
      name: parsed.name,
      floor: parsed.floor || null,
      isActive: parsed.isActive
    }
  });

 redirectLocations('room-updated');
}

export async function deleteRoomAction(formData: FormData) {
  const roomId = String(formData.get('roomId') || '');

  const room = await db.room.findUnique({
    where: { id: roomId }
  });

  if (!room) {
    throw new Error('Room not found.');
  }

  await assertHotelAccess(room.hotelId);

  await db.room.update({
    where: { id: roomId },
    data: {
      isActive: false,
      deletedAt: new Date()
    }
  });

  redirectLocations('room-deleted');
}

export async function createLocationAction(formData: FormData) {
  const user = await requireUser();

  const parsed = locationSchema.parse({
    hotelId: formData.get('hotelId') || user.hotelId,
    name: cleanText(formData.get('name'), 160),
    type: formData.get('type'),
    description: cleanText(formData.get('description'), 1000),
    isActive: true
  });

  await assertHotelAccess(parsed.hotelId);

  await db.location.create({
    data: {
      hotelId: parsed.hotelId,
      name: parsed.name,
      type: parsed.type,
      description: parsed.description || null,
      isActive: true,
      deletedAt: null
    }
  });

  redirectLocations('location-created');
}

export async function updateLocationAction(formData: FormData) {
  const locationId = String(formData.get('locationId') || '');

  const existing = await db.location.findUnique({
    where: { id: locationId }
  });

  if (!existing) {
    throw new Error('Location not found.');
  }

  const parsed = updateLocationSchema.parse({
    locationId,
    hotelId: formData.get('hotelId') || existing.hotelId,
    name: cleanText(formData.get('name'), 160),
    type: formData.get('type'),
    description: cleanText(formData.get('description'), 1000),
    isActive: formData.get('isActive') === 'on'
  });

  await assertHotelAccess(existing.hotelId);
  await assertHotelAccess(parsed.hotelId);

  await db.location.update({
    where: { id: parsed.locationId },
    data: {
      hotelId: parsed.hotelId,
      name: parsed.name,
      type: parsed.type,
      description: parsed.description || null,
      isActive: parsed.isActive
    }
  });

  redirectLocations('location-updated');
}

export async function deleteLocationAction(formData: FormData) {
  const locationId = String(formData.get('locationId') || '');

  const location = await db.location.findUnique({
    where: { id: locationId }
  });

  if (!location) {
    throw new Error('Location not found.');
  }

  await assertHotelAccess(location.hotelId);

  await db.location.update({
    where: { id: locationId },
    data: {
      isActive: false,
      deletedAt: new Date()
    }
  });

  redirectLocations('location-deleted');
}