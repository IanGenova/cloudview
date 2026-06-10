'use server';

import { Prisma, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';

function redirectToHotels(params: { success?: string; error?: string }) {
  const searchParams = new URLSearchParams();

  if (params.success) {
    searchParams.set('success', params.success);
  }

  if (params.error) {
    searchParams.set('error', params.error);
  }

  const query = searchParams.toString();

  redirect(query ? `/dashboard/hotels?${query}` : '/dashboard/hotels');
}

function normalizeSlug(value: FormDataEntryValue | null) {
  return (
    cleanText(value, 80)
      ?.toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') ?? ''
  );
}

function normalizeHexColor(
  value: FormDataEntryValue | null,
  fallback: string
) {
  const color = cleanText(value, 20)?.trim();

  if (!color) {
    return fallback;
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return fallback;
  }

  return color.toUpperCase();
}

function getReadablePrismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return 'slug-exists';
    }

    if (error.code === 'P2003') {
      return 'hotel-has-records';
    }
  }

  return 'action-failed';
}

export async function createHotelAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN]);

  const name = cleanText(formData.get('name'), 120);
  const slug = normalizeSlug(formData.get('slug'));
  const brandColor = normalizeHexColor(formData.get('brandColor'), '#111111');
  const accentColor = normalizeHexColor(formData.get('accentColor'), '#B88938');

  if (!name || !slug) {
    redirectToHotels({ error: 'hotel-required' });
  }

if (!name) {
  throw new Error('Hotel name is required.');
}

  try {
    await db.hotel.create({
      data: {
        name,
        slug,
        brandColor,
        accentColor,
        settings: {
          create: {
            currency: 'PHP',
          },
        },
      },
    });
  } catch (error) {
    redirectToHotels({ error: getReadablePrismaError(error) });
  }

  revalidatePath('/dashboard/hotels');

  redirectToHotels({ success: 'hotel-created' });
}

export async function updateHotelAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN]);

  const hotelId = cleanText(formData.get('hotelId'));
  const name = cleanText(formData.get('name'), 120);
  const slug = normalizeSlug(formData.get('slug'));
  const brandColor = normalizeHexColor(formData.get('brandColor'), '#111111');
  const accentColor = normalizeHexColor(formData.get('accentColor'), '#B88938');

  if (!hotelId) {
    redirectToHotels({ error: 'hotel-not-found' });
  }

  if (!name || !slug) {
    redirectToHotels({ error: 'hotel-required' });
  }

  try {
    await db.hotel.update({
      where: {
        id: hotelId,
      },
      data: {
        name,
        slug,
        brandColor,
        accentColor,
      },
    });
  } catch (error) {
    redirectToHotels({ error: getReadablePrismaError(error) });
  }

  revalidatePath('/dashboard/hotels');

  redirectToHotels({ success: 'hotel-updated' });
}

export async function deleteHotelAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN]);

  const hotelId = cleanText(formData.get('hotelId'));

  if (!hotelId) {
    redirectToHotels({ error: 'hotel-not-found' });
  }

  try {
    await db.hotel.delete({
      where: {
        id: hotelId,
      },
    });
  } catch (error) {
    redirectToHotels({ error: getReadablePrismaError(error) });
  }

  revalidatePath('/dashboard/hotels');

  redirectToHotels({ success: 'hotel-deleted' });
}