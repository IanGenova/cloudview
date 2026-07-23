'use server';


import { getRuntimeMediaDirectory } from '@/lib/runtime-media-storage';
import { randomUUID } from 'crypto';
import path from 'path';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { DashboardModule, Role } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import { db } from '@/lib/db';
import { scopedHotelId } from '@/lib/access';
import { cleanText } from '@/lib/sanitize';
import {
  getXenditPlatformMerchantId,
  normalizeXenditOrganizationId,
} from '@/lib/xendit-split';

const SETTINGS_UPLOAD_DIR = getRuntimeMediaDirectory('hotel-settings');

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

function parseCheckbox(formData: FormData, fieldName: string) {
  const rawValue = formData.get(fieldName);

  const value =
    typeof rawValue === 'string'
      ? rawValue.trim().toLowerCase()
      : '';

  return (
    value === 'on' ||
    value === 'true' ||
    value === '1' ||
    value === 'yes'
  );
}

function parseXenditSplitSettings(formData: FormData) {
  const xenditSplitEnabled = parseCheckbox(
    formData,
    'xenditSplitEnabled'
  );
  const rawXenditLinkedAccountId =
    cleanText(formData.get('xenditLinkedAccountId'), 191) || null;
  const xenditCommissionType =
    cleanText(formData.get('xenditCommissionType'), 32) === 'FIXED'
      ? 'FIXED'
      : 'PERCENTAGE_NET';
  const xenditFeeBearer =
    cleanText(formData.get('xenditFeeBearer'), 32) === 'CLOUDVIEW'
      ? 'CLOUDVIEW'
      : 'HOTEL';
  const displayValue = Number(formData.get('xenditCommissionDisplayValue'));

  if (!Number.isFinite(displayValue) || displayValue < 0) {
    throw new Error('Xendit commission must be zero or greater.');
  }

  // The settings UI uses percentage points or pesos. Store the API-ready
  // representation: basis points for percentage and centavos for fixed.
  const xenditCommissionValue = Math.round(displayValue * 100);

  if (xenditCommissionType === 'PERCENTAGE_NET' && displayValue >= 100) {
    throw new Error('Xendit percentage commission must be below 100%.');
  }

  const xenditLinkedAccountId = rawXenditLinkedAccountId
    ? normalizeXenditOrganizationId(
        rawXenditLinkedAccountId,
        'Hotel Xendit Business ID'
      )
    : null;

  if (xenditSplitEnabled) {
    const platformMerchantId = getXenditPlatformMerchantId();
    const hotelMerchantId = normalizeXenditOrganizationId(
      xenditLinkedAccountId,
      'Hotel Xendit Business ID'
    );

    if (platformMerchantId === hotelMerchantId) {
      throw new Error(
        'The CloudView master account and hotel Xendit Business IDs must be different.'
      );
    }

    if (xenditCommissionValue <= 0) {
      throw new Error('Xendit commission must be greater than zero when splitting is enabled.');
    }
  }

  return {
    xenditSplitEnabled,
    xenditLinkedAccountId,
    xenditCommissionType,
    xenditCommissionValue,
    xenditFeeBearer,
  };
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
  const user = await requireDashboardPermission(
    DashboardModule.HOTEL_SETTINGS,
    'canEdit'
  );
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const hotelId = scopedHotelId(user, cleanText(formData.get('hotelId')));

  if (!hotelId) {
    throw new Error('Hotel required');
  }

  const nfcRoomPasscodeEnabled = parseCheckbox(
    formData,
    'nfcRoomPasscodeEnabled'
  );
  const xenditSplitSettings =
    user.role === Role.SUPER_ADMIN
      ? parseXenditSplitSettings(formData)
      : null;

  const existingSettings = await db.hotelSettings.findUnique({
    where: { hotelId },
    select: {
      guestPortalHeroImageUrl: true,
      xenditSplitEnabled: true,
      xenditLinkedAccountId: true,
      xenditCommissionType: true,
      xenditCommissionValue: true,
      xenditFeeBearer: true,
    },
  });

  const xenditSettingsChanged = Boolean(
    xenditSplitSettings &&
      (!existingSettings ||
        existingSettings.xenditSplitEnabled !==
          xenditSplitSettings.xenditSplitEnabled ||
        existingSettings.xenditLinkedAccountId !==
          xenditSplitSettings.xenditLinkedAccountId ||
        existingSettings.xenditCommissionType !==
          xenditSplitSettings.xenditCommissionType ||
        existingSettings.xenditCommissionValue !==
          xenditSplitSettings.xenditCommissionValue ||
        existingSettings.xenditFeeBearer !==
          xenditSplitSettings.xenditFeeBearer)
  );

  const xenditSplitSettingsForWrite = xenditSplitSettings
    ? {
        ...xenditSplitSettings,
        ...(xenditSettingsChanged
          ? {
              xenditSplitRuleId: null,
              xenditSplitRuleSignature: null,
            }
          : {}),
      }
    : null;

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
        nfcRoomPasscodeEnabled,
        ...(xenditSplitSettingsForWrite || {}),
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
        nfcRoomPasscodeEnabled,
        ...(xenditSplitSettingsForWrite || {}),
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
  revalidatePath('/dashboard/guest-stays');
  revalidatePath('/dashboard/tags');
  revalidatePath('/t/[tagCode]', 'page');

  const redirectParams = new URLSearchParams({
    saved: '1',
    hotelId,
  });

  redirect(`/dashboard/settings?${redirectParams.toString()}`);
}
