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
      | 'DEVICE_LIMIT_REACHED'
      | 'DEVICE_NOT_AUTHORIZED',
    message: string
  ) {
    super(message);
    this.name = 'GuestStayDeviceAuthError';
  }
}

export function getGuestStayDeviceCookieName(guestStayId: string) {
  const safeGuestStayId = guestStayId.replace(/[^a-zA-Z0-9_-]/g, '_');

  return `${GUEST_STAY_DEVICE_COOKIE_PREFIX}_${safeGuestStayId}`;
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
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get('user-agent') || 'unknown';

  return hashValue(userAgent);
}

function generateGuestStayDeviceToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashGuestStayDeviceToken(token: string) {
  return hashValue(token);
}

function activeStayWhere(now = new Date()) {
  return {
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
  };
}

export async function getActiveGuestStayForRoom({
  hotelId,
  roomId,
}: {
  hotelId: string;
  roomId: string;
}) {
  return db.guestStay.findFirst({
    where: {
      hotelId,
      roomId,
      ...activeStayWhere(),
    },
    select: {
      id: true,
      hotelId: true,
      roomId: true,
      guestMemberId: true,
      passcodeHash: true,
      maxDevices: true,
      expectedCheckOutAt: true,
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

async function findAuthorizedDevice(input: {
  guestStayId: string;
  deviceToken: string;
  userAgentHash: string;
}) {
  const deviceTokenHash = hashGuestStayDeviceToken(input.deviceToken);

  const device = await db.guestStayDevice.findFirst({
    where: {
      guestStayId: input.guestStayId,
      deviceTokenHash,
      revokedAt: null,
      guestStay: {
        ...activeStayWhere(),
      },
    },
    select: {
      id: true,
      guestStayId: true,
      revokedAt: true,
      userAgentHash: true,
    },
  });

  if (!device) {
    return null;
  }

  if (device.userAgentHash && device.userAgentHash !== input.userAgentHash) {
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

  return findAuthorizedDevice({
    guestStayId,
    deviceToken,
    userAgentHash: getUserAgentHashFromRequest(request),
  });
}

/**
 * Server Action / Server Component equivalent of the Request-based helper.
 * Guest Xendit actions use this to prove that the current browser is one of
 * the authorized devices for the active room stay.
 */
export async function getAuthorizedGuestStayDevice(guestStayId: string) {
  const cookieStore = await cookies();
  const deviceToken = cookieStore.get(
    getGuestStayDeviceCookieName(guestStayId)
  )?.value;

  if (!deviceToken) {
    return null;
  }

  return findAuthorizedDevice({
    guestStayId,
    deviceToken,
    userAgentHash: await getUserAgentHashFromServerHeaders(),
  });
}

export async function requireAuthorizedGuestStayDevice(guestStayId: string) {
  const device = await getAuthorizedGuestStayDevice(guestStayId);

  if (!device) {
    throw new GuestStayDeviceAuthError(
      'DEVICE_NOT_AUTHORIZED',
      'This device is not authorized for the active room stay.'
    );
  }

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
      ...activeStayWhere(),
    },
    select: {
      id: true,
      passcodeHash: true,
      maxDevices: true,
      expectedCheckOutAt: true,
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

  const cookieStore = await cookies();
  const cookieName = getGuestStayDeviceCookieName(stay.id);
  const existingToken = cookieStore.get(cookieName)?.value;
  const userAgentHash = await getUserAgentHashFromServerHeaders();

  if (existingToken) {
    const existingDevice = await findAuthorizedDevice({
      guestStayId: stay.id,
      deviceToken: existingToken,
      userAgentHash,
    });

    if (existingDevice) {
      return {
        guestStayId: stay.id,
        deviceId: existingDevice.id,
        alreadyAuthorized: true,
      };
    }
  }

  const deviceToken = generateGuestStayDeviceToken();
  const deviceTokenHash = hashGuestStayDeviceToken(deviceToken);
  const safeDeviceLabel = deviceLabel?.trim().slice(0, 120) || null;

  const device = await db.$transaction(async (tx) => {
    const activeDeviceCount = await tx.guestStayDevice.count({
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

    return tx.guestStayDevice.create({
      data: {
        guestStayId: stay.id,
        deviceTokenHash,
        userAgentHash,
        deviceLabel: safeDeviceLabel,
      },
      select: {
        id: true,
      },
    });
  });

  const thirtyDaysSeconds = 60 * 60 * 24 * 30;
  const untilCheckoutSeconds = stay.expectedCheckOutAt
    ? Math.max(
        60,
        Math.floor((stay.expectedCheckOutAt.getTime() - Date.now()) / 1000)
      )
    : thirtyDaysSeconds;

  cookieStore.set(cookieName, deviceToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: await shouldUseSecureNfcCookies(),
    path: '/',
    maxAge: Math.min(thirtyDaysSeconds, untilCheckoutSeconds),
  });

  return {
    guestStayId: stay.id,
    deviceId: device.id,
    alreadyAuthorized: false,
  };
}

export async function revokeGuestStayDevices(guestStayId: string) {
  return db.guestStayDevice.updateMany({
    where: {
      guestStayId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}