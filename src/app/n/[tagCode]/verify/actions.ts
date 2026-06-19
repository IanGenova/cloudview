'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { verifyTagSecret } from '@/lib/nfc-security';
import { getActiveGuestStayForRoom } from '@/lib/guest-stay-device-auth';
import {
  authorizeGuestStayDeviceWithPasscode,
  GuestStayDeviceAuthError,
} from '@/lib/guest-stay-device-auth';

function cleanText(value: FormDataEntryValue | null, maxLength = 200) {
  if (typeof value !== 'string') return '';

  return value.trim().slice(0, maxLength);
}

function redirectToVerify(
  tagCode: string,
  scanSecret: string,
  error: string
): never {
  redirect(
    `/n/${tagCode}/verify?k=${encodeURIComponent(scanSecret)}&error=${error}`
  );
}

export async function verifyGuestStayPasscodeAction(formData: FormData) {
  const tagCode = cleanText(formData.get('tagCode'), 120);
  const scanSecret = cleanText(formData.get('scanSecret'), 300);
  const passcode = cleanText(formData.get('passcode'), 20);
  const deviceLabel = cleanText(formData.get('deviceLabel'), 80) || null;

  if (!tagCode || !scanSecret) {
    redirect('/nfc-access-denied?reason=bad-secret');
  }

  if (!passcode) {
    redirectToVerify(tagCode, scanSecret, 'missing_passcode');
  }

  const tag = await db.nfcTag.findUnique({
    where: {
      code: tagCode,
    },
    select: {
      id: true,
      hotelId: true,
      roomId: true,
      tagType: true,
      status: true,
      scanSecret: true,
      deletedAt: true,
    },
  });

  if (!tag || tag.deletedAt) {
    redirect('/nfc-access-denied?reason=tag-not-found');
  }

  if (tag.status !== 'ACTIVE') {
    redirect('/nfc-access-denied?reason=inactive-tag');
  }

  if (
    !tag.scanSecret ||
    !scanSecret ||
    !verifyTagSecret(scanSecret, tag.scanSecret)
  ) {
    redirect('/nfc-access-denied?reason=bad-secret');
  }

  if (!tag.roomId) {
    redirect('/nfc-access-denied?reason=room-required');
  }

  const activeStay = await getActiveGuestStayForRoom({
    hotelId: tag.hotelId,
    roomId: tag.roomId,
  });

  if (!activeStay) {
    redirectToVerify(tagCode, scanSecret, 'no_active_stay');
  }

  try {
    await authorizeGuestStayDeviceWithPasscode({
      guestStayId: activeStay.id,
      passcode,
      deviceLabel,
    });
  } catch (error) {
    if (error instanceof GuestStayDeviceAuthError) {
      if (error.code === 'INVALID_PASSCODE') {
        redirectToVerify(tagCode, scanSecret, 'invalid_passcode');
      }

      if (error.code === 'DEVICE_LIMIT_REACHED') {
        redirectToVerify(tagCode, scanSecret, 'device_limit');
      }

      redirectToVerify(tagCode, scanSecret, 'authorization_failed');
    }

    console.error('Guest stay passcode verification failed:', error);

    redirectToVerify(tagCode, scanSecret, 'authorization_failed');
  }

  redirect(`/n/${tagCode}?k=${encodeURIComponent(scanSecret)}`);
}