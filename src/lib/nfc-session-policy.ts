import { TagType } from '@prisma/client';

export type NfcSessionMode = 'PRIVATE_ROOM' | 'PUBLIC_LOCATION';

/*
 * allowMultipleDevices and keepUnresolvedPaymentsAlive used to be returned here
 * and were read by nothing. The first stated that a private room tag allows one
 * device -- a rule nothing enforced, and one the real device limit already
 * covers: guest-stay-device-auth counts active GuestStayDevice rows against
 * GuestStay.maxDevices. The second was true in both branches, so it decided
 * nothing even if something had read it.
 *
 * A policy object that returns flags nobody consults reads as a set of
 * guarantees the system does not actually make.
 */

export function getNfcSessionPolicy(tag: {
  tagType: TagType;
  roomId?: string | null;
  locationId?: string | null;
}) {
  const isPrivateRoomTag =
    tag.tagType === TagType.ROOM && Boolean(tag.roomId) && !tag.locationId;

  if (isPrivateRoomTag) {
    return {
      mode: 'PRIVATE_ROOM' as NfcSessionMode,
      reusePendingSession: true,
      requireStrictBrowserSession: true,
      paymentRequiresActiveStay: true,
      paymentRequiresAuthorizedDevice: true,
      description:
        'Private room session. The active stay and authorized room device are required for online payment.',
    };
  }

  return {
    mode: 'PUBLIC_LOCATION' as NfcSessionMode,
    reusePendingSession: false,
    requireStrictBrowserSession: false,
    paymentRequiresActiveStay: false,
    paymentRequiresAuthorizedDevice: false,
    description:
      'Public location session. Each browser receives its own session and may pay without a room stay.',
  };
}