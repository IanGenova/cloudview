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
      description: 'Private room session. Pending guest work may be reused.',
    };
  }

  return {
    mode: 'PUBLIC_LOCATION' as NfcSessionMode,
    allowMultipleDevices: true,
    reusePendingSession: false,
    requireStrictBrowserSession: false,
    description:
      'Public location session. Unlimited devices may tap and each device gets its own session.',
  };
}