import crypto from 'crypto';
import { GuestStayStatus } from '@prisma/client';
import { db } from '@/lib/db';

function getGuestStaySecret() {
  return (
    process.env.GUEST_STAY_PASSCODE_SECRET ||
    process.env.AUTH_SECRET ||
    'dev-change-this-secret'
  );
}

function getPasscodeEncryptionKey() {
  return crypto.createHash('sha256').update(getGuestStaySecret()).digest();
}

export function generateGuestStayPasscode() {
  return String(crypto.randomInt(100000, 999999));
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

  if (!guestName) {
    throw new Error('Guest name is required.');
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

    const orFilters = [];

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

    await tx.guestStay.updateMany({
      where: {
        hotelId: params.hotelId,
        roomId: params.roomId,
        status: GuestStayStatus.ACTIVE,
      },
      data: {
        status: GuestStayStatus.CHECKED_OUT,
        checkedOutAt: new Date(),
      },
    });

    const guestStay = await tx.guestStay.create({
      data: {
        hotelId: params.hotelId,
        roomId: params.roomId,
        guestMemberId: guestMember.id,
        passcodeHash,
        passcodeEncrypted,
        maxDevices,
        expectedCheckOutAt: params.expectedCheckOutAt ?? null,
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