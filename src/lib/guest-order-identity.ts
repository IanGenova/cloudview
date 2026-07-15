import 'server-only';

import { GuestStayStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';
import { verifyGuestStayPasscode } from '@/lib/guest-stays';
import { requireGuestXenditSecurityContext } from '@/lib/guest-xendit-security';

export class GuestOrderIdentityError extends Error {
  constructor(
    public code:
      | 'GUEST_NAME_REQUIRED'
      | 'GUEST_PHONE_REQUIRED'
      | 'INVALID_GUEST_PHONE'
      | 'ROOM_NUMBER_REQUIRED'
      | 'ROOM_PASSCODE_REQUIRED'
      | 'ACTIVE_STAY_NOT_FOUND'
      | 'INVALID_ROOM_PASSCODE'
      | 'ROOM_VERIFICATION_LOCKED'
      | 'ACTIVE_STAY_REQUIRED',
    message: string
  ) {
    super(message);
    this.name = 'GuestOrderIdentityError';
  }
}

function activeStayWhere(now = new Date()) {
  return {
    status: GuestStayStatus.ACTIVE,
    OR: [
      { expectedCheckOutAt: null },
      { expectedCheckOutAt: { gte: now } },
    ],
  };
}

const ROOM_VERIFICATION_MAX_FAILURES = 5;
const ROOM_VERIFICATION_LOCK_MINUTES = 15;

async function requireRoomVerificationAttemptAllowed(sessionId: string) {
  const now = new Date();
  const session = await db.nfcGuestSession.findUnique({
    where: { id: sessionId },
    select: {
      roomVerificationFailures: true,
      roomVerificationLockedUntil: true,
    },
  });

  if (!session) {
    throw new GuestOrderIdentityError(
      'ACTIVE_STAY_REQUIRED',
      'The NFC browser session is no longer available. Please scan the tag again.'
    );
  }

  if (
    session.roomVerificationLockedUntil &&
    session.roomVerificationLockedUntil.getTime() > now.getTime()
  ) {
    const remainingMinutes = Math.max(
      1,
      Math.ceil(
        (session.roomVerificationLockedUntil.getTime() - now.getTime()) / 60_000
      )
    );

    throw new GuestOrderIdentityError(
      'ROOM_VERIFICATION_LOCKED',
      `Too many incorrect room verification attempts. Try again in ${remainingMinutes} minute${
        remainingMinutes === 1 ? '' : 's'
      } or contact the front desk.`
    );
  }

  if (session.roomVerificationLockedUntil) {
    await db.nfcGuestSession.updateMany({
      where: { id: sessionId },
      data: {
        roomVerificationFailures: 0,
        roomVerificationLockedUntil: null,
      },
    });

    return 0;
  }

  return session.roomVerificationFailures;
}

async function registerRoomVerificationFailure(
  sessionId: string,
  currentFailures: number
) {
  const now = new Date();
  const nextFailures = currentFailures + 1;
  const shouldLock = nextFailures >= ROOM_VERIFICATION_MAX_FAILURES;
  const lockedUntil = shouldLock
    ? new Date(now.getTime() + ROOM_VERIFICATION_LOCK_MINUTES * 60_000)
    : null;

  await db.nfcGuestSession.updateMany({
    where: { id: sessionId },
    data: {
      roomVerificationFailures: nextFailures,
      roomVerificationLockedUntil: lockedUntil,
      lastRoomVerificationAt: now,
    },
  });

  if (shouldLock) {
    throw new GuestOrderIdentityError(
      'ROOM_VERIFICATION_LOCKED',
      `Too many incorrect room verification attempts. Try again in ${ROOM_VERIFICATION_LOCK_MINUTES} minutes or contact the front desk.`
    );
  }
}

async function clearRoomVerificationFailures(sessionId: string) {
  await db.nfcGuestSession.updateMany({
    where: { id: sessionId },
    data: {
      roomVerificationFailures: 0,
      roomVerificationLockedUntil: null,
      lastRoomVerificationAt: new Date(),
    },
  });
}

export function normalizeGuestPhone(value?: string | null) {
  const raw = cleanText(value || '', 40);

  if (!raw) return '';

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');

  return `${hasPlus ? '+' : ''}${digits}`;
}

function requireGuestDetails(input: {
  guestName?: string | null;
  guestPhone?: string | null;
}) {
  const guestName = cleanText(input.guestName ?? '', 100) ?? '';
  const guestPhone = normalizeGuestPhone(input.guestPhone);
  const digitCount = guestPhone.replace(/\D/g, '').length;

  if (guestName.length < 2) {
    throw new GuestOrderIdentityError(
      'GUEST_NAME_REQUIRED',
      'Please enter the guest name.'
    );
  }

  if (!guestPhone) {
    throw new GuestOrderIdentityError(
      'GUEST_PHONE_REQUIRED',
      'Please enter the guest phone number.'
    );
  }

  if (digitCount < 7 || digitCount > 15) {
    throw new GuestOrderIdentityError(
      'INVALID_GUEST_PHONE',
      'Please enter a valid phone number with 7 to 15 digits.'
    );
  }

  return { guestName, guestPhone };
}

export async function resolveGuestOrderIdentity(input: {
  tagCode: string;
  guestName?: string | null;
  guestPhone?: string | null;
  roomNumber?: string | null;
  roomPasscode?: string | null;
  requireRoomAssignment?: boolean;
  verifiedGuestStayId?: string | null;
}) {
  const context = await requireGuestXenditSecurityContext(input.tagCode);
  const details = requireGuestDetails(input);
  const isPublicLocation = context.policy.mode === 'PUBLIC_LOCATION';

  if (!isPublicLocation) {
    if (!context.guestStay || !context.tag.roomId) {
      throw new GuestOrderIdentityError(
        'ACTIVE_STAY_REQUIRED',
        'An active guest stay is required for this room.'
      );
    }

    return {
      context,
      isPublicLocation,
      ...details,
      roomId: context.tag.roomId,
      locationId: context.tag.locationId,
      guestStayId: context.guestStay.id,
      guestMemberId: context.guestStay.guestMemberId,
      assignedRoomNumber: context.tag.room?.number ?? null,
      roomAssignmentVerified: true,
    };
  }

  const roomNumber = cleanText(input.roomNumber || '', 40);
  const roomPasscode = cleanText(input.roomPasscode || '', 20);
  const wantsRoomAssignment = Boolean(
    input.requireRoomAssignment || roomNumber || roomPasscode
  );

  if (!wantsRoomAssignment) {
    return {
      context,
      isPublicLocation,
      ...details,
      roomId: null,
      locationId: context.tag.locationId,
      guestStayId: null,
      guestMemberId: context.guestMemberId,
      assignedRoomNumber: null,
      roomAssignmentVerified: false,
    };
  }

  const verifiedGuestStayId = cleanText(input.verifiedGuestStayId || '', 160);

  if (verifiedGuestStayId) {
    const verifiedStay = await db.guestStay.findFirst({
      where: {
        id: verifiedGuestStayId,
        hotelId: context.tag.hotelId,
        ...activeStayWhere(),
      },
      select: {
        id: true,
        roomId: true,
        guestMemberId: true,
        room: { select: { number: true } },
      },
    });

    if (
      verifiedStay &&
      context.session.guestStayId === verifiedStay.id &&
      context.session.roomId === verifiedStay.roomId
    ) {
      return {
        context,
        isPublicLocation,
        ...details,
        roomId: verifiedStay.roomId,
        locationId: context.tag.locationId,
        guestStayId: verifiedStay.id,
        guestMemberId: verifiedStay.guestMemberId,
        assignedRoomNumber: verifiedStay.room.number,
        roomAssignmentVerified: true,
      };
    }
  }

  if (!roomNumber) {
    throw new GuestOrderIdentityError(
      'ROOM_NUMBER_REQUIRED',
      'Enter the room number that should receive or be charged for this request.'
    );
  }

  if (!roomPasscode) {
    throw new GuestOrderIdentityError(
      'ROOM_PASSCODE_REQUIRED',
      'Enter the six-digit room passcode.'
    );
  }

  const currentVerificationFailures =
    await requireRoomVerificationAttemptAllowed(context.session.id);

  const stay = await db.guestStay.findFirst({
    where: {
      hotelId: context.tag.hotelId,
      ...activeStayWhere(),
      room: {
        number: roomNumber,
        isActive: true,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      roomId: true,
      guestMemberId: true,
      passcodeHash: true,
      room: {
        select: {
          number: true,
        },
      },
      guestMember: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
    orderBy: {
      checkInAt: 'desc',
    },
  });

  if (!stay) {
    await registerRoomVerificationFailure(
      context.session.id,
      currentVerificationFailures
    );

    throw new GuestOrderIdentityError(
      'ACTIVE_STAY_NOT_FOUND',
      'The room number or passcode is incorrect, or the stay is no longer active.'
    );
  }

  if (!verifyGuestStayPasscode(roomPasscode, stay.passcodeHash)) {
    await registerRoomVerificationFailure(
      context.session.id,
      currentVerificationFailures
    );

    throw new GuestOrderIdentityError(
      'INVALID_ROOM_PASSCODE',
      'The room number or passcode is incorrect, or the stay is no longer active.'
    );
  }

  await clearRoomVerificationFailures(context.session.id);

  return {
    context,
    isPublicLocation,
    ...details,
    roomId: stay.roomId,
    locationId: context.tag.locationId,
    guestStayId: stay.id,
    guestMemberId: stay.guestMemberId,
    assignedRoomNumber: stay.room.number,
    roomAssignmentVerified: true,
  };
}