'use server';

import { randomUUID } from 'crypto';
import path from 'path';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { revalidatePath } from 'next/cache';
import { requireUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { scopedHotelId } from '@/lib/access';
import { cleanText } from '@/lib/sanitize';

const SETTINGS_UPLOAD_DIR = path.join(
  process.cwd(),
  'public',
  'uploads',
  'hotel-settings'
);

const SETTINGS_UPLOAD_PUBLIC_PATH = '/uploads/hotel-settings';

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== 'undefined' && value instanceof File && value.size > 0;
}

function getImageExtension(file: File) {
  if (file.type === 'image/jpeg') return '.jpg';
  if (file.type === 'image/png') return '.png';
  if (file.type === 'image/webp') return '.webp';

  return '';
}

async function saveHotelSettingsImageFile(file: File) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxFileSize = 4 * 1024 * 1024;

  if (!allowedTypes.includes(file.type)) {
    throw new Error('Only JPG, PNG, or WEBP images are allowed.');
  }

  if (file.size > maxFileSize) {
    throw new Error('Image must be 4MB or smaller.');
  }

  const extension = getImageExtension(file);

  if (!extension) {
    throw new Error('Invalid image file type.');
  }

  await mkdir(SETTINGS_UPLOAD_DIR, { recursive: true });

  const filename = `${randomUUID()}${extension}`;
  const filePath = path.join(SETTINGS_UPLOAD_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(filePath, buffer);

  return `${SETTINGS_UPLOAD_PUBLIC_PATH}/${filename}`;
}

async function deleteLocalSettingsImageFile(imageUrl?: string | null) {
  if (!imageUrl?.startsWith(`${SETTINGS_UPLOAD_PUBLIC_PATH}/`)) {
    return;
  }

  const filename = path.basename(imageUrl);
  const filePath = path.join(SETTINGS_UPLOAD_DIR, filename);

  await unlink(filePath).catch(() => undefined);
}

async function resolveGuestPortalHeroImageUrl(
  formData: FormData,
  previousImageUrl?: string | null
) {
  const typedImageUrl =
    cleanText(formData.get('guestPortalHeroImageUrl'), 700) || null;

  const uploadedFile = formData.get('guestPortalHeroImage');

  if (!isUploadedFile(uploadedFile)) {
    return {
      imageUrl: typedImageUrl,
      uploadedImageUrl: null,
      shouldDeletePrevious:
        Boolean(previousImageUrl) && previousImageUrl !== typedImageUrl,
    };
  }

  const uploadedImageUrl = await saveHotelSettingsImageFile(uploadedFile);

  return {
    imageUrl: uploadedImageUrl,
    uploadedImageUrl,
    shouldDeletePrevious:
      Boolean(previousImageUrl) && previousImageUrl !== uploadedImageUrl,
  };
}

export async function saveHotelSettingsAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN']);

  const hotelId = scopedHotelId(user, cleanText(formData.get('hotelId')));

  if (!hotelId) {
    throw new Error('Hotel required');
  }

  const existingSettings = await db.hotelSettings.findUnique({
    where: { hotelId },
    select: {
      guestPortalHeroImageUrl: true,
    },
  });

  let uploadedHeroImageUrl: string | null = null;

  try {
    const heroImage = await resolveGuestPortalHeroImageUrl(
      formData,
      existingSettings?.guestPortalHeroImageUrl
    );

    uploadedHeroImageUrl = heroImage.uploadedImageUrl;

    await db.hotel.update({
      where: { id: hotelId },
      data: {
        name: cleanText(formData.get('hotelName'), 120),
        logoUrl: cleanText(formData.get('logoUrl'), 500),
        brandColor: cleanText(formData.get('brandColor'), 20) || '#111111',
        accentColor: cleanText(formData.get('accentColor'), 20) || '#B88938',
      },
    });

    await db.hotelSettings.upsert({
      where: { hotelId },
      update: {
        currency: cleanText(formData.get('currency'), 3) || 'PHP',
        taxRate: Number(formData.get('taxRate') || 0),
        serviceChargeRate: Number(formData.get('serviceChargeRate') || 0),
        wifiName: cleanText(formData.get('wifiName'), 120),
        wifiPassword: cleanText(formData.get('wifiPassword'), 120),
        checkInTime:
          cleanText(formData.get('checkInTime'), 40) || '2:00 PM',
        checkOutTime:
          cleanText(formData.get('checkOutTime'), 40) || '12:00 PM',
        poolHours:
          cleanText(formData.get('poolHours'), 120) || '7:00 AM - 9:00 PM',
        poolRules: cleanText(formData.get('poolRules'), 2000),
        policies: cleanText(formData.get('policies'), 4000),
        guideText: cleanText(formData.get('guideText'), 4000),
        contactPhone: cleanText(formData.get('contactPhone'), 80),
        contactEmail: cleanText(formData.get('contactEmail'), 160),
        guestPortalHeroImageUrl: heroImage.imageUrl,
      },
      create: {
        hotelId,
        currency: cleanText(formData.get('currency'), 3) || 'PHP',
        taxRate: Number(formData.get('taxRate') || 0),
        serviceChargeRate: Number(formData.get('serviceChargeRate') || 0),
        wifiName: cleanText(formData.get('wifiName'), 120),
        wifiPassword: cleanText(formData.get('wifiPassword'), 120),
        checkInTime:
          cleanText(formData.get('checkInTime'), 40) || '2:00 PM',
        checkOutTime:
          cleanText(formData.get('checkOutTime'), 40) || '12:00 PM',
        poolHours:
          cleanText(formData.get('poolHours'), 120) || '7:00 AM - 9:00 PM',
        poolRules: cleanText(formData.get('poolRules'), 2000),
        policies: cleanText(formData.get('policies'), 4000),
        guideText: cleanText(formData.get('guideText'), 4000),
        contactPhone: cleanText(formData.get('contactPhone'), 80),
        contactEmail: cleanText(formData.get('contactEmail'), 160),
        guestPortalHeroImageUrl: heroImage.imageUrl,
      },
    });

    if (heroImage.shouldDeletePrevious) {
      await deleteLocalSettingsImageFile(
        existingSettings?.guestPortalHeroImageUrl
      );
    }
  } catch (error) {
    if (uploadedHeroImageUrl) {
      await deleteLocalSettingsImageFile(uploadedHeroImageUrl);
    }

    throw error;
  }

  revalidatePath('/dashboard/settings');
  revalidatePath('/t/[tagCode]', 'page');
}