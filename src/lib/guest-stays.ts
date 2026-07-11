import crypto from 'crypto';
import { GuestPayMongoStatus, GuestStayStatus } from '@prisma/client';
import { db } from '@/lib/db';

function getGuestStaySecret() {
  const value =
    process.env.GUEST_STAY_PASSCODE_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();

  if (value) {
    return value;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'GUEST_STAY_PASSCODE_SECRET or AUTH_SECRET is required in production.'
    );
  }

  return 'dev-change-this-secret';
}

function getPasscodeEncryptionKey() {
  return crypto.createHash('sha256').update(getGuestStaySecret()).digest();
}

export function generateGuestStayPasscode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashGuestStayPasscode(passcode: string) {
  return crypto
    .createHash('sha256')
    .update(`${passcode.trim()}:${getGuestStaySecret()}`)
    .digest('hex');
}

export function verifyGuestStayPasscode(
  inputPasscode: string,
  storedHash: string
) {
  const inputHash = hashGuestStayPasscode(inputPasscode);

  const left = Buffer.from(inputHash);
  const right = Buffer.from(storedHash);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

export function encryptGuestStayPasscode(passcode: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    getPasscodeEncryptionKey(),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(passcode.trim(), 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptGuestStayPasscode(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    const [version, ivValue, authTagValue, encryptedValue] = value.split(':');

    if (
      version !== 'v1' ||
      !ivValue ||
      !authTagValue ||
      !encryptedValue
    ) {
      return null;
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getPasscodeEncryptionKey(),
      Buffer.from(ivValue, 'base64url')
    );

    decipher.setAuthTag(Buffer.from(authTagValue, 'base64url'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export async function createGuestStayWithPasscode(params: {
  hotelId: string;
  roomId: string;
  guestName: string;
  phone?: string | null;
  email?: string | null;
  maxDevices: number;
  expectedCheckOutAt?: Date | null;
}) {
  const guestName = params.guestName.trim();
  const phone = params.phone?.trim() || null;
  const email = params.email?.trim().toLowerCase() || null;
  const maxDevices = Math.max(1, Math.min(params.maxDevices || 2, 10));
  const expectedCheckOutAt = params.expectedCheckOutAt ?? null;

  if (!guestName) {
    throw new Error('Guest name is required.');
  }

  if (expectedCheckOutAt && expectedCheckOutAt <= new Date()) {
    throw new Error('Expected checkout must be in the future.');
  }

  const passcode = generateGuestStayPasscode();
  const passcodeHash = hashGuestStayPasscode(passcode);
  const passcodeEncrypted = encryptGuestStayPasscode(passcode);

  const result = await db.$transaction(async (tx) => {
    const room = await tx.room.findFirst({
      where: {
        id: params.roomId,
        hotelId: params.hotelId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        number: true,
        name: true,
      },
    });

    if (!room) {
      throw new Error('Room was not found or is inactive.');
    }

    const orFilters: Array<{ phone?: string; email?: string }> = [];

    if (phone) {
      orFilters.push({ phone });
    }

    if (email) {
      orFilters.push({ email });
    }

    const existingGuest = orFilters.length
      ? await tx.guestMember.findFirst({
          where: {
            hotelId: params.hotelId,
            OR: orFilters,
          },
        })
      : null;

    const guestMember =
      existingGuest ??
      (await tx.guestMember.create({
        data: {
          hotelId: params.hotelId,
          name: guestName,
          phone,
          email,
          pointAccount: {
            create: {
              hotelId: params.hotelId,
            },
          },
        },
      }));

    if (existingGuest) {
      await tx.guestMember.update({
        where: {
          id: existingGuest.id,
        },
        data: {
          name: guestName,
          phone,
          email,
          isActive: true,
        },
      });
    }

    const previousStays = await tx.guestStay.findMany({
      where: {
        hotelId: params.hotelId,
        roomId: params.roomId,
        status: GuestStayStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    const previousStayIds = previousStays.map((stay) => stay.id);
    const now = new Date();

    if (previousStayIds.length) {
      await tx.guestStay.updateMany({
        where: {
          id: {
            in: previousStayIds,
          },
          status: GuestStayStatus.ACTIVE,
        },
        data: {
          status: GuestStayStatus.CHECKED_OUT,
          checkedOutAt: now,
        },
      });

      await tx.guestStayDevice.updateMany({
        where: {
          guestStayId: {
            in: previousStayIds,
          },
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      await tx.nfcGuestSession.updateMany({
        where: {
          guestStayId: {
            in: previousStayIds,
          },
          endedAt: null,
        },
        data: {
          endedAt: now,
        },
      });

      await tx.guestPayMongoSession.updateMany({
        where: {
          guestStayId: {
            in: previousStayIds,
          },
          status: GuestPayMongoStatus.PENDING,
        },
        data: {
          status: GuestPayMongoStatus.EXPIRED,
          expiresAt: now,
          errorMessage:
            'The previous room stay ended before payment was completed.',
        },
      });
    }

    const guestStay = await tx.guestStay.create({
      data: {
        hotelId: params.hotelId,
        roomId: params.roomId,
        guestMemberId: guestMember.id,
        passcodeHash,
        passcodeEncrypted,
        maxDevices,
        expectedCheckOutAt,
        status: GuestStayStatus.ACTIVE,
      },
      include: {
        hotel: {
          select: {
            name: true,
          },
        },
        room: {
          select: {
            number: true,
            name: true,
          },
        },
        guestMember: true,
      },
    });

    return guestStay;
  });

  return {
    guestStay: result,
    passcode,
  };
}