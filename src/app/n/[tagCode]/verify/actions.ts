'use server';

import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import {
  createNfcAccessSession,
  shouldUseSecureNfcCookies,
  verifyTagSecret,
} from '@/lib/nfc-security';
import { getActiveGuestStayForRoom } from '@/lib/guest-stay-device-auth';
import {
  authorizeGuestStayDeviceWithPasscode,
  GuestStayDeviceAuthError,
} from '@/lib/guest-stay-device-auth';
import {
  ACTIVE_ORDER_STATUSES,
  ACTIVE_SERVICE_REQUEST_STATUSES,
  getNfcGuestSessionCookieName,
  getReusableNfcGuestSessionForTag,
} from '@/lib/nfc-guest-session';

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
      code: true,
      hotelId: true,
      roomId: true,
      locationId: true,
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

  /**
   * First-scan fix:
   *
   * Do not redirect back through /n/[tagCode] after passcode verification.
   * That extra hop can race the Set-Cookie handoff on phones and make the first
   * portal load arrive without a valid NFC access/session cookie.
   *
   * Instead, create the NFC guest session and NFC access proof right here,
   * then redirect directly to /t/[tagCode]?nfcSession=1.
   */
  const reusableGuestSession = await getReusableNfcGuestSessionForTag({
    tagId: tag.id,
    hotelId: tag.hotelId,
    tagType: tag.tagType,
    roomId: tag.roomId,
    locationId: tag.locationId,
    guestStayId: activeStay.id,
  });

  const guestSessionKey = reusableGuestSession?.sessionKey ?? randomUUID();
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.nfcTag.update({
      where: {
        id: tag.id,
      },
      data: {
        lastScannedAt: now,
      },
    });

    /**
     * Private room tags are strict. Revoke old NFC access sessions before
     * creating the fresh access proof below.
     */
    await tx.nfcAccessSession.updateMany({
      where: {
        tagId: tag.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    await tx.nfcAccessSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    /**
     * Close old room sessions without pending work. Keep the reusable pending
     * session, if one exists, so existing in-progress guest work is preserved.
     */
    await tx.nfcGuestSession.updateMany({
      where: {
        tagId: tag.id,
        hotelId: tag.hotelId,
        endedAt: null,
        ...(reusableGuestSession
          ? {
              id: {
                not: reusableGuestSession.id,
              },
            }
          : {}),
        orders: {
          none: {
            status: {
              in: [...ACTIVE_ORDER_STATUSES],
            },
          },
        },
        serviceRequests: {
          none: {
            status: {
              in: [...ACTIVE_SERVICE_REQUEST_STATUSES],
            },
          },
        },
      },
      data: {
        endedAt: now,
      },
    });

    if (reusableGuestSession) {
      await tx.nfcGuestSession.update({
        where: {
          id: reusableGuestSession.id,
        },
        data: {
          endedAt: null,
          lastSeenAt: now,
          roomId: tag.roomId,
          locationId: tag.locationId,
          guestMemberId: activeStay.guestMemberId,
          guestStayId: activeStay.id,
        },
      });

      return;
    }

    await tx.nfcGuestSession.create({
      data: {
        sessionKey: guestSessionKey,
        hotelId: tag.hotelId,
        tagId: tag.id,
        roomId: tag.roomId,
        locationId: tag.locationId,
        guestMemberId: activeStay.guestMemberId,
        guestStayId: activeStay.id,
      },
    });
  });

  /**
   * Create the NFC access proof cookie now, after old access sessions were
   * revoked. This is the cookie checked by requireNfcGuestAccess().
   */
  await createNfcAccessSession({
    id: tag.id,
    hotelId: tag.hotelId,
    code: tag.code,
  });

  const cookieStore = await cookies();

  /**
   * Create the guest session cookie checked by nfc-guest-session.ts.
   */
  cookieStore.set(getNfcGuestSessionCookieName(tag.code), guestSessionKey, {
    httpOnly: true,
    sameSite: 'lax',
    secure: await shouldUseSecureNfcCookies(),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  /**
   * nfcSession=1 tells NfcBrowserSessionGuard that this navigation came from
   * a trusted NFC/passcode flow and should activate the in-tab browser session.
   */
  redirect(`/t/${tag.code}?nfcSession=1`);
}
