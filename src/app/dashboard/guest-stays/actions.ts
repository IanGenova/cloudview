'use server';

import { GuestStayStatus, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import {
  createGuestStayWithPasscode,
  decryptGuestStayPasscode,
  encryptGuestStayPasscode,
  generateGuestStayPasscode,
  hashGuestStayPasscode,
} from '@/lib/guest-stays';
import { awardGuestStayCheckInPoints } from '@/lib/guest-point-sync';

function cleanText(value: FormDataEntryValue | null, maxLength = 200) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

function parseIntValue(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(cleanText(value, 20));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.floor(parsed);
}

function parseDateTime(value: FormDataEntryValue | null) {
  const raw = cleanText(value, 80);

  if (!raw) {
    return null;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function parseGuestStayStatus(value: FormDataEntryValue | null) {
  const raw = cleanText(value, 40);

  if (
    raw === GuestStayStatus.ACTIVE ||
    raw === GuestStayStatus.CHECKED_OUT ||
    raw === GuestStayStatus.CANCELLED ||
    raw === GuestStayStatus.EXPIRED
  ) {
    return raw;
  }

  return GuestStayStatus.ACTIVE;
}

async function getActionHotelId(formData: FormData) {
  const user = await requireUser();

  if (user.role === Role.SUPER_ADMIN) {
    const hotelId = cleanText(formData.get('hotelId'), 120);

    if (!hotelId) {
      throw new Error('Hotel is required.');
    }

    return {
      user,
      hotelId,
    };
  }

  if (!user.hotelId) {
    throw new Error('Your account is not assigned to a hotel.');
  }

  return {
    user,
    hotelId: user.hotelId,
  };
}

async function getScopedGuestStay({
  guestStayId,
}: {
  guestStayId: string;
}) {
  const user = await requireUser();

  const guestStay = await db.guestStay.findFirst({
    where:
      user.role === Role.SUPER_ADMIN
        ? {
            id: guestStayId,
          }
        : {
            id: guestStayId,
            hotelId: user.hotelId || '__NO_ACCESS__',
          },
    select: {
        id: true,
        hotelId: true,
        roomId: true,
        guestMemberId: true,
        status: true,
        checkedOutAt: true,
        passcodeEncrypted: true,
        passcodeHash: true,
        maxDevices: true,
      },
  });

  return {
    user,
    guestStay,
  };
}

export async function createGuestStayAction(formData: FormData) {
  try {
    const { hotelId } = await getActionHotelId(formData);

    const roomId = cleanText(formData.get('roomId'), 120);
    const guestName = cleanText(formData.get('guestName'), 160);
    const phone = cleanText(formData.get('phone'), 80) || null;
    const email = cleanText(formData.get('email'), 160).toLowerCase() || null;
    const maxDevices = parseIntValue(formData.get('maxDevices'), 2);
    const expectedCheckOutAt = parseDateTime(formData.get('expectedCheckOutAt'));

    if (!roomId) {
      return {
        ok: false as const,
        error: 'Room is required.',
      };
    }

    if (!guestName) {
      return {
        ok: false as const,
        error: 'Guest name is required.',
      };
    }

    const result = await createGuestStayWithPasscode({
      hotelId,
      roomId,
      guestName,
      phone,
      email,
      maxDevices,
      expectedCheckOutAt,
    });
    const pointResult = await awardGuestStayCheckInPoints(result.guestStay.id);

    revalidatePath('/dashboard/guest-stays');
    revalidatePath('/dashboard/tags');

    return {
      ok: true as const,
      passcode: result.passcode,
      guestName: result.guestStay.guestMember.name,
      roomNumber: result.guestStay.room.number,
      hotelName: result.guestStay.hotel.name,
      maxDevices: result.guestStay.maxDevices,
      pointsAwarded: pointResult.pointsAwarded,
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to create guest stay.',
    };
  }
}

export async function updateGuestStayAction(formData: FormData) {
  try {
    const guestStayId = cleanText(formData.get('guestStayId'), 120);
    const roomId = cleanText(formData.get('roomId'), 120);
    const guestName = cleanText(formData.get('guestName'), 160);
    const phone = cleanText(formData.get('phone'), 80) || null;
    const email = cleanText(formData.get('email'), 160).toLowerCase() || null;
    const maxDevices = Math.max(
      1,
      Math.min(parseIntValue(formData.get('maxDevices'), 2), 10)
    );
    const expectedCheckOutAt = parseDateTime(formData.get('expectedCheckOutAt'));
    const status = parseGuestStayStatus(formData.get('status'));

    if (!guestStayId) {
      return {
        ok: false as const,
        error: 'Guest stay is required.',
      };
    }

    if (!roomId) {
      return {
        ok: false as const,
        error: 'Room is required.',
      };
    }

    if (!guestName) {
      return {
        ok: false as const,
        error: 'Guest name is required.',
      };
    }

    const { guestStay } = await getScopedGuestStay({
      guestStayId,
    });

    if (!guestStay) {
      return {
        ok: false as const,
        error: 'Guest stay not found.',
      };
    }

    const room = await db.room.findFirst({
      where: {
        id: roomId,
        hotelId: guestStay.hotelId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!room) {
      return {
        ok: false as const,
        error: 'Selected room was not found or is inactive.',
      };
    }

    const activeDeviceCount = await db.guestStayDevice.count({
      where: {
        guestStayId: guestStay.id,
        revokedAt: null,
      },
    });

    if (maxDevices < activeDeviceCount) {
      return {
        ok: false as const,
        error: `Max devices cannot be lower than the active device count (${activeDeviceCount}).`,
      };
    }

    if (status === GuestStayStatus.ACTIVE) {
      const activeRoomConflict = await db.guestStay.findFirst({
        where: {
          id: {
            not: guestStay.id,
          },
          hotelId: guestStay.hotelId,
          roomId,
          status: GuestStayStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      });

      if (activeRoomConflict) {
        return {
          ok: false as const,
          error: 'Another active guest stay already exists in this room.',
        };
      }
    }

    await db.$transaction(async (tx) => {
      await tx.guestMember.update({
        where: {
          id: guestStay.guestMemberId,
        },
        data: {
          name: guestName,
          phone,
          email,
          isActive: true,
        },
      });

      await tx.guestStay.update({
        where: {
          id: guestStay.id,
        },
        data: {
          roomId,
          maxDevices,
          expectedCheckOutAt,
          status,
          checkedOutAt:
            status === GuestStayStatus.ACTIVE
              ? null
              : status === GuestStayStatus.CHECKED_OUT
                ? guestStay.checkedOutAt ?? new Date()
                : guestStay.checkedOutAt,
        },
      });
    });

    revalidatePath('/dashboard/guest-stays');
    revalidatePath('/dashboard/tags');

    return {
      ok: true as const,
      message: 'Guest stay updated successfully.',
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to update guest stay.',
    };
  }
}

export async function checkoutGuestStayAction(formData: FormData) {
  try {
    const guestStayId = cleanText(formData.get('guestStayId'), 120);

    if (!guestStayId) {
      return {
        ok: false as const,
        error: 'Guest stay is required.',
      };
    }

    const { guestStay } = await getScopedGuestStay({
      guestStayId,
    });

    if (!guestStay) {
      return {
        ok: false as const,
        error: 'Guest stay not found.',
      };
    }

    await db.guestStay.update({
      where: {
        id: guestStay.id,
      },
      data: {
        status: GuestStayStatus.CHECKED_OUT,
        checkedOutAt: new Date(),
      },
    });

    revalidatePath('/dashboard/guest-stays');
    revalidatePath('/dashboard/tags');

    return {
      ok: true as const,
      message: 'Guest checked out successfully.',
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to check out guest stay.',
    };
  }
}

export async function getGuestStayPasscodeAction(formData: FormData) {
  try {
    const guestStayId = cleanText(formData.get('guestStayId'), 120);

    if (!guestStayId) {
      return {
        ok: false as const,
        error: 'Guest stay is required.',
      };
    }

    const { guestStay } = await getScopedGuestStay({
      guestStayId,
    });

    if (!guestStay) {
      return {
        ok: false as const,
        error: 'Guest stay not found.',
      };
    }

    const passcode = decryptGuestStayPasscode(guestStay.passcodeEncrypted);

    if (!passcode) {
      return {
        ok: false as const,
        error:
          'This stay was created before passcode viewing was enabled. Please reset the passcode to generate a viewable passcode.',
      };
    }

    return {
      ok: true as const,
      passcode,
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to view guest stay passcode.',
    };
  }
}

export async function resetGuestStayPasscodeAction(formData: FormData) {
  try {
    const guestStayId = cleanText(formData.get('guestStayId'), 120);

    if (!guestStayId) {
      return {
        ok: false as const,
        error: 'Guest stay is required.',
      };
    }

    const { guestStay } = await getScopedGuestStay({
      guestStayId,
    });

    if (!guestStay) {
      return {
        ok: false as const,
        error: 'Guest stay not found.',
      };
    }

    if (guestStay.status !== GuestStayStatus.ACTIVE) {
      return {
        ok: false as const,
        error: 'Only active guest stays can reset passcode.',
      };
    }

    const passcode = generateGuestStayPasscode();

    await db.guestStay.update({
      where: {
        id: guestStay.id,
      },
      data: {
        passcodeHash: hashGuestStayPasscode(passcode),
        passcodeEncrypted: encryptGuestStayPasscode(passcode),
      },
    });

    revalidatePath('/dashboard/guest-stays');

    return {
      ok: true as const,
      passcode,
      message: 'Passcode reset successfully.',
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to reset guest stay passcode.',
    };
  }
}