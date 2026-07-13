import 'server-only';

import { GuestXenditFlow } from '@prisma/client';
import { db } from '@/lib/db';
import {
  getCurrentNfcGuestIdentity,
  requireCurrentNfcGuestSession,
} from '@/lib/nfc-guest-session';
import { getNfcSessionPolicy } from '@/lib/nfc-session-policy';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { requireAuthorizedGuestStayDevice } from '@/lib/guest-stay-device-auth';

export class GuestXenditSecurityError extends Error {
  constructor(
    public code:
      | 'INVALID_TAG_CONTEXT'
      | 'SESSION_MISMATCH'
      | 'ACTIVE_STAY_REQUIRED'
      | 'ROOM_MISMATCH'
      | 'LOCATION_MISMATCH'
      | 'PAYMENT_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'GuestXenditSecurityError';
  }
}

/**
 * Central security gate for Batch 3 food checkout and Batch 4 service checkout.
 * It binds a Xendit session to the NFC tag, browser session, active stay,
 * room/location, guest identity, and (for protected room stays) device cookie.
 */
export async function requireGuestXenditSecurityContext(tagCode: string) {
  const tag = await requireNfcGuestAccess(tagCode);
  const session = await requireCurrentNfcGuestSession(tagCode);
  const identity = await getCurrentNfcGuestIdentity(tagCode);

  if (
    session.hotelId !== tag.hotelId ||
    session.tagId !== tag.id ||
    identity.session?.id !== session.id
  ) {
    throw new GuestXenditSecurityError(
      'SESSION_MISMATCH',
      'The NFC browser session does not match this hotel tag.'
    );
  }

  const policy = getNfcSessionPolicy({
    tagType: tag.tagType,
    roomId: tag.roomId,
    locationId: tag.locationId,
  });

  let authorizedDeviceId: string | null = null;

  if (policy.mode === 'PRIVATE_ROOM') {
    if (!tag.roomId || session.roomId !== tag.roomId) {
      throw new GuestXenditSecurityError(
        'ROOM_MISMATCH',
        'The NFC session does not belong to this room.'
      );
    }

    if (
      policy.paymentRequiresActiveStay &&
      (!identity.guestStay || identity.guestStay.roomId !== tag.roomId)
    ) {
      throw new GuestXenditSecurityError(
        'ACTIVE_STAY_REQUIRED',
        'An active guest stay is required before paying from a room NFC portal.'
      );
    }

    if (
      policy.paymentRequiresAuthorizedDevice &&
      tag.hotel.settings?.nfcRoomPasscodeEnabled !== false &&
      identity.guestStay
    ) {
      const device = await requireAuthorizedGuestStayDevice(
        identity.guestStay.id
      );
      authorizedDeviceId = device.id;
    }
  } else if (
    tag.locationId &&
    session.locationId !== tag.locationId
  ) {
    throw new GuestXenditSecurityError(
      'LOCATION_MISMATCH',
      'The NFC session does not belong to this hotel location.'
    );
  }

  return {
    tag,
    policy,
    session,
    guestStay: identity.guestStay,
    guestMember: identity.guestMember,
    guestStayId: identity.guestStayId,
    guestMemberId: identity.guestMemberId,
    guestName: identity.guestName,
    authorizedDeviceId,
  };
}

/**
 * Use this for guest payment status/finalize/cancel actions. A guessed payment
 * session ID cannot be read unless it belongs to the same NFC browser context.
 */
export async function requireOwnedGuestXenditSession(input: {
  tagCode: string;
  paymentSessionId: string;
  flowType?: GuestXenditFlow;
}) {
  const context = await requireGuestXenditSecurityContext(input.tagCode);
  const paymentSessionId = input.paymentSessionId.trim();

  if (!paymentSessionId) {
    throw new GuestXenditSecurityError(
      'PAYMENT_NOT_FOUND',
      'Guest payment session is required.'
    );
  }

  const payment = await db.guestXenditSession.findFirst({
    where: {
      id: paymentSessionId,
      paymentProvider: 'XENDIT',
      hotelId: context.tag.hotelId,
      tagId: context.tag.id,
      guestSessionId: context.session.id,
      ...(context.guestStayId
        ? {
            guestStayId: context.guestStayId,
          }
        : {}),
      ...(input.flowType
        ? {
            flowType: input.flowType,
          }
        : {}),
    },
  });

  if (!payment) {
    throw new GuestXenditSecurityError(
      'PAYMENT_NOT_FOUND',
      'The guest payment session was not found for this NFC browser.'
    );
  }

  return {
    context,
    payment,
  };
}