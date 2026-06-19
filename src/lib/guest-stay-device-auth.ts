import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { GuestStayStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { hashValue, shouldUseSecureNfcCookies } from '@/lib/nfc-security';
import { verifyGuestStayPasscode } from '@/lib/guest-stays';

export const GUEST_STAY_DEVICE_COOKIE_PREFIX = 'cv_guest_stay_device';

export class GuestStayDeviceAuthError extends Error {
  constructor(
    public code:
      | 'STAY_NOT_FOUND'
      | 'INVALID_PASSCODE'
      | 'DEVICE_LIMIT_REACHED',
    message: string
  ) {
    super(message);
    this.name = 'GuestStayDeviceAuthError';
  }
}

export function getGuestStayDeviceCookieName(guestStayId: string) {
  return `${GUEST_STAY_DEVICE_COOKIE_PREFIX}_${guestStayId}`;
}

function getRequestCookie(request: Request, cookieName: string) {
  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) return null;

  const cookiePairs = cookieHeader.split(';').map((item) => item.trim());

  for (const cookiePair of cookiePairs) {
    const separatorIndex = cookiePair.indexOf('=');

    if (separatorIndex === -1) continue;

    const name = cookiePair.slice(0, separatorIndex);
    const value = cookiePair.slice(separatorIndex + 1);

    if (name === cookieName) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

function getUserAgentHashFromRequest(request: Request) {
  const userAgent = request.headers.get('user-agent') || 'unknown';

  return hashValue(userAgent);
}

async function getUserAgentHashFromServerHeaders() {
  const h = await headers();
  const userAgent = h.get('user-agent') || 'unknown';

  return hashValue(userAgent);
}

function generateGuestStayDeviceToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashGuestStayDeviceToken(token: string) {
  return hashValue(token);
}

export async function getActiveGuestStayForRoom({
  hotelId,
  roomId,
}: {
  hotelId: string;
  roomId: string;
}) {
  const now = new Date();

  return db.guestStay.findFirst({
    where: {
      hotelId,
      roomId,
      status: GuestStayStatus.ACTIVE,
      OR: [
        {
          expectedCheckOutAt: null,
        },
        {
          expectedCheckOutAt: {
            gte: now,
          },
        },
      ],
    },
    select: {
      id: true,
      hotelId: true,
      roomId: true,
      guestMemberId: true,
      passcodeHash: true,
      maxDevices: true,
      guestMember: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      checkInAt: 'desc',
    },
  });
}

export async function getAuthorizedGuestStayDeviceFromRequest({
  request,
  guestStayId,
}: {
  request: Request;
  guestStayId: string;
}) {
  const cookieName = getGuestStayDeviceCookieName(guestStayId);
  const deviceToken = getRequestCookie(request, cookieName);

  if (!deviceToken) return null;

  const deviceTokenHash = hashGuestStayDeviceToken(deviceToken);
  const userAgentHash = getUserAgentHashFromRequest(request);

  const device = await db.guestStayDevice.findUnique({
    where: {
      guestStayId_deviceTokenHash: {
        guestStayId,
        deviceTokenHash,
      },
    },
    select: {
      id: true,
      guestStayId: true,
      revokedAt: true,
      userAgentHash: true,
    },
  });

  if (!device || device.revokedAt) {
    return null;
  }

  if (device.userAgentHash && device.userAgentHash !== userAgentHash) {
    return null;
  }

  await db.guestStayDevice.update({
    where: {
      id: device.id,
    },
    data: {
      lastSeenAt: new Date(),
    },
  });

  return device;
}

export async function authorizeGuestStayDeviceWithPasscode({
  guestStayId,
  passcode,
  deviceLabel,
}: {
  guestStayId: string;
  passcode: string;
  deviceLabel?: string | null;
}) {
  const stay = await db.guestStay.findFirst({
    where: {
      id: guestStayId,
      status: GuestStayStatus.ACTIVE,
    },
    select: {
      id: true,
      passcodeHash: true,
      maxDevices: true,
    },
  });

  if (!stay) {
    throw new GuestStayDeviceAuthError(
      'STAY_NOT_FOUND',
      'Active guest stay was not found.'
    );
  }

  if (!verifyGuestStayPasscode(passcode, stay.passcodeHash)) {
    throw new GuestStayDeviceAuthError(
      'INVALID_PASSCODE',
      'Invalid room passcode.'
    );
  }

  const activeDeviceCount = await db.guestStayDevice.count({
    where: {
      guestStayId: stay.id,
      revokedAt: null,
    },
  });

  if (activeDeviceCount >= stay.maxDevices) {
    throw new GuestStayDeviceAuthError(
      'DEVICE_LIMIT_REACHED',
      'Device limit reached for this stay.'
    );
  }

  const deviceToken = generateGuestStayDeviceToken();
  const deviceTokenHash = hashGuestStayDeviceToken(deviceToken);
  const userAgentHash = await getUserAgentHashFromServerHeaders();

  await db.guestStayDevice.create({
    data: {
      guestStayId: stay.id,
      deviceTokenHash,
      userAgentHash,
      deviceLabel: deviceLabel || null,
    },
  });

  const cookieStore = await cookies();

  cookieStore.set(getGuestStayDeviceCookieName(stay.id), deviceToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: await shouldUseSecureNfcCookies(),
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return {
    guestStayId: stay.id,
  };
}