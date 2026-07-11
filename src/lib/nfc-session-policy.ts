import { TagType } from '@prisma/client';

export type NfcSessionMode = 'PRIVATE_ROOM' | 'PUBLIC_LOCATION';

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
      allowMultipleDevices: false,
      reusePendingSession: true,
      requireStrictBrowserSession: true,
      keepUnresolvedPaymentsAlive: true,
      paymentRequiresActiveStay: true,
      paymentRequiresAuthorizedDevice: true,
      description:
        'Private room session. The active stay and authorized room device are required for online payment.',
    };
  }

  return {
    mode: 'PUBLIC_LOCATION' as NfcSessionMode,
    allowMultipleDevices: true,
    reusePendingSession: false,
    requireStrictBrowserSession: false,
    keepUnresolvedPaymentsAlive: true,
    paymentRequiresActiveStay: false,
    paymentRequiresAuthorizedDevice: false,
    description:
      'Public location session. Each browser receives its own session and may pay without a room stay.',
  };
}