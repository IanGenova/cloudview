import { cookies } from 'next/headers';
import { OrderStatus, ServiceRequestStatus, TagType } from '@prisma/client';
import { getNfcSessionPolicy } from '@/lib/nfc-session-policy';
import { db } from '@/lib/db';


export const ACTIVE_ORDER_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
] as const;

export const ACTIVE_SERVICE_REQUEST_STATUSES = [
  ServiceRequestStatus.NEW,
  ServiceRequestStatus.IN_PROGRESS,
] as const;

const nfcGuestSessionSelect = {
  id: true,
  sessionKey: true,
  hotelId: true,
  tagId: true,
  roomId: true,
  locationId: true,
  guestMemberId: true,
  endedAt: true,
} as const;

export function getNfcGuestSessionCookieName(tagCode: string) {
  const safeTagCode = tagCode.replace(/[^a-zA-Z0-9_-]/g, '_');

  return `cv_nfc_session_${safeTagCode}`;
}

export async function getNfcGuestSessionPendingCounts(sessionId: string) {
  const [pendingOrders, pendingServiceRequests] = await Promise.all([
    db.order.count({
      where: {
        guestSessionId: sessionId,
        status: {
          in: [...ACTIVE_ORDER_STATUSES],
        },
      },
    }),

    db.serviceRequest.count({
      where: {
        guestSessionId: sessionId,
        status: {
          in: [...ACTIVE_SERVICE_REQUEST_STATUSES],
        },
      },
    }),
  ]);

  return {
    pendingOrders,
    pendingServiceRequests,
    totalPending: pendingOrders + pendingServiceRequests,
  };
}

export async function getReusableNfcGuestSessionForTag({
  tagId,
  hotelId,
  tagType,
  roomId,
  locationId,
}: {
  tagId: string;
  hotelId: string;
  tagType: TagType;
  roomId?: string | null;
  locationId?: string | null;
}) {
  const policy = getNfcSessionPolicy({
    tagType,
    roomId,
    locationId,
  });

  /**
   * Public location tags such as POOL, LOBBY, RESTAURANT, BAR, GYM, SPA,
   * AMENITY, PARKING, and OTHER must NOT reuse another guest's pending session.
   *
   * Each device/browser gets its own session.
   */
  if (!policy.reusePendingSession) {
    return null;
  }

  /**
   * Existing reusable-session logic remains for private ROOM tags only.
   */
  const sessionWithPendingWork = await db.nfcGuestSession.findFirst({
    where: {
      tagId,
      hotelId,
      OR: [
        {
          orders: {
            some: {
              status: {
                in: [...ACTIVE_ORDER_STATUSES],
              },
            },
          },
        },
        {
          serviceRequests: {
            some: {
              status: {
                in: [...ACTIVE_SERVICE_REQUEST_STATUSES],
              },
            },
          },
        },
      ],
    },
    select: nfcGuestSessionSelect,
    orderBy: [
      {
        lastSeenAt: 'desc',
      },
      {
        startedAt: 'desc',
      },
    ],
  });

  if (!sessionWithPendingWork) {
    return null;
  }

  return db.nfcGuestSession.update({
    where: {
      id: sessionWithPendingWork.id,
    },
    data: {
      endedAt: null,
      lastSeenAt: new Date(),
    },
    select: nfcGuestSessionSelect,
  });
}

export async function getCurrentNfcGuestSession(tagCode: string) {
  const cookieStore = await cookies();
  const cookieName = getNfcGuestSessionCookieName(tagCode);
  const sessionKey = cookieStore.get(cookieName)?.value;

  if (!sessionKey) {
    return null;
  }

  const session = await db.nfcGuestSession.findUnique({
    where: {
      sessionKey,
    },
    select: nfcGuestSessionSelect,
  });

  if (!session) {
    return null;
  }

  if (session.endedAt) {
    const pendingCounts = await getNfcGuestSessionPendingCounts(session.id);

    if (pendingCounts.totalPending <= 0) {
      return null;
    }

    return db.nfcGuestSession.update({
      where: {
        id: session.id,
      },
      data: {
        endedAt: null,
        lastSeenAt: new Date(),
      },
      select: nfcGuestSessionSelect,
    });
  }

  return db.nfcGuestSession.update({
    where: {
      id: session.id,
    },
    data: {
      lastSeenAt: new Date(),
    },
    select: nfcGuestSessionSelect,
  });
}

export async function getCurrentNfcGuestSessionStatus(tagCode: string) {
  const session = await getCurrentNfcGuestSession(tagCode);

  if (!session) {
    return {
      hasSession: false,
      keepSession: false,
      pendingOrders: 0,
      pendingServiceRequests: 0,
      totalPending: 0,
      session: null,
    };
  }

  const pendingCounts = await getNfcGuestSessionPendingCounts(session.id);

  return {
    hasSession: true,
    keepSession: pendingCounts.totalPending > 0,
    pendingOrders: pendingCounts.pendingOrders,
    pendingServiceRequests: pendingCounts.pendingServiceRequests,
    totalPending: pendingCounts.totalPending,
    session,
  };
}

export async function closeCurrentNfcGuestSessionIfNoPendingWork(
  tagCode: string
) {
  const status = await getCurrentNfcGuestSessionStatus(tagCode);

  if (!status.session) {
    return {
      hasSession: false,
      closed: false,
      keepSession: false,
      pendingOrders: 0,
      pendingServiceRequests: 0,
      totalPending: 0,
    };
  }

  if (status.keepSession) {
    return {
      hasSession: true,
      closed: false,
      keepSession: true,
      pendingOrders: status.pendingOrders,
      pendingServiceRequests: status.pendingServiceRequests,
      totalPending: status.totalPending,
    };
  }

  await db.nfcGuestSession.update({
    where: {
      id: status.session.id,
    },
    data: {
      endedAt: new Date(),
    },
  });

  return {
    hasSession: true,
    closed: true,
    keepSession: false,
    pendingOrders: 0,
    pendingServiceRequests: 0,
    totalPending: 0,
  };
}

export async function requireCurrentNfcGuestSession(tagCode: string) {
  const session = await getCurrentNfcGuestSession(tagCode);

  if (!session) {
    throw new Error('Guest session expired. Please tap the NFC card again.');
  }

  return session;
}