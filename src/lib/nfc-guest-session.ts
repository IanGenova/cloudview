import { cookies } from 'next/headers';
import {
  GuestPayMongoStatus,
  GuestStayStatus,
  OrderStatus,
  ServiceRequestStatus,
  TagStatus,
  TagType,
} from '@prisma/client';
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

/**
 * These payment states still represent money or checkout work that must not be
 * detached from the NFC browser session.
 */
export const ACTIVE_GUEST_PAYMENT_STATUSES = [
  GuestPayMongoStatus.PENDING,
  GuestPayMongoStatus.PAID,
  GuestPayMongoStatus.PROCESSING,
  GuestPayMongoStatus.PAID_REVIEW_REQUIRED,
  GuestPayMongoStatus.REFUND_PENDING,
  GuestPayMongoStatus.REFUND_FAILED,
] as const;

const nfcGuestSessionSelect = {
  id: true,
  sessionKey: true,
  hotelId: true,
  tagId: true,
  roomId: true,
  locationId: true,
  guestMemberId: true,
  guestStayId: true,
  endedAt: true,
} as const;

type BasicNfcGuestSession = {
  id: string;
  sessionKey: string;
  hotelId: string;
  tagId: string;
  roomId: string | null;
  locationId: string | null;
  guestMemberId: string | null;
  guestStayId: string | null;
  endedAt: Date | null;
};

function getActiveGuestStayDateFilter() {
  const now = new Date();

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

export function getNfcGuestSessionCookieName(tagCode: string) {
  const safeTagCode = tagCode.replace(/[^a-zA-Z0-9_-]/g, '_');

  return `cv_nfc_session_${safeTagCode}`;
}

export async function getNfcGuestSessionPendingCounts(sessionId: string) {
  const [pendingOrders, pendingServiceRequests, pendingPayments] =
    await Promise.all([
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

      db.guestPayMongoSession.count({
        where: {
          guestSessionId: sessionId,
          status: {
            in: [...ACTIVE_GUEST_PAYMENT_STATUSES],
          },
        },
      }),
    ]);

  return {
    pendingOrders,
    pendingServiceRequests,
    pendingPayments,
    totalPending: pendingOrders + pendingServiceRequests + pendingPayments,
  };
}

/**
 * If a session is linked to a GuestStay, the stay must still be active.
 * An unpaid checkout is expired when the stay has ended. Paid records remain
 * available for webhook/refund recovery but are no longer accessible as the
 * old room guest.
 */
async function normalizeSessionGuestStay(
  session: BasicNfcGuestSession
): Promise<BasicNfcGuestSession | null> {
  if (!session.guestStayId) {
    return session;
  }

  const activeStay = await db.guestStay.findFirst({
    where: {
      id: session.guestStayId,
      hotelId: session.hotelId,
      ...getActiveGuestStayDateFilter(),
    },
    select: {
      id: true,
      roomId: true,
      guestMemberId: true,
    },
  });

  if (!activeStay) {
    const now = new Date();

    await db.$transaction([
      db.nfcGuestSession.updateMany({
        where: {
          id: session.id,
          endedAt: null,
        },
        data: {
          endedAt: now,
        },
      }),
      db.guestPayMongoSession.updateMany({
        where: {
          guestSessionId: session.id,
          status: GuestPayMongoStatus.PENDING,
        },
        data: {
          status: GuestPayMongoStatus.EXPIRED,
          expiresAt: now,
          errorMessage:
            'The guest stay ended before the PayMongo checkout was completed.',
        },
      }),
    ]);

    return null;
  }

  const needsSync =
    session.guestMemberId !== activeStay.guestMemberId ||
    session.roomId !== activeStay.roomId;

  if (!needsSync) {
    return session;
  }

  return db.nfcGuestSession.update({
    where: {
      id: session.id,
    },
    data: {
      guestMemberId: activeStay.guestMemberId,
      roomId: activeStay.roomId,
    },
    select: nfcGuestSessionSelect,
  });
}

export async function getReusableNfcGuestSessionForTag({
  tagId,
  hotelId,
  tagType,
  roomId,
  locationId,
  guestStayId,
}: {
  tagId: string;
  hotelId: string;
  tagType: TagType;
  roomId?: string | null;
  locationId?: string | null;
  guestStayId?: string | null;
}) {
  const policy = getNfcSessionPolicy({
    tagType,
    roomId,
    locationId,
  });

  if (!policy.reusePendingSession) {
    return null;
  }

  if (policy.mode === 'PRIVATE_ROOM' && !guestStayId) {
    return null;
  }

  const sessionWithPendingWork = await db.nfcGuestSession.findFirst({
    where: {
      tagId,
      hotelId,
      ...(guestStayId ? { guestStayId } : {}),
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
        {
          payMongoSessions: {
            some: {
              status: {
                in: [...ACTIVE_GUEST_PAYMENT_STATUSES],
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

  const normalizedSession = await normalizeSessionGuestStay(
    sessionWithPendingWork
  );

  if (!normalizedSession) {
    return null;
  }

  return db.nfcGuestSession.update({
    where: {
      id: normalizedSession.id,
    },
    data: {
      endedAt: null,
      lastSeenAt: new Date(),
    },
    select: nfcGuestSessionSelect,
  });
}

export async function getCurrentNfcGuestSession(tagCodeInput: string) {
  const tagCode = tagCodeInput.trim();

  if (!tagCode) {
    return null;
  }

  const cookieStore = await cookies();
  const cookieName = getNfcGuestSessionCookieName(tagCode);
  const sessionKey = cookieStore.get(cookieName)?.value;

  if (!sessionKey) {
    return null;
  }

  const session = await db.nfcGuestSession.findFirst({
    where: {
      sessionKey,
      tag: {
        code: tagCode,
        status: TagStatus.ACTIVE,
        deletedAt: null,
      },
    },
    select: nfcGuestSessionSelect,
  });

  if (!session) {
    return null;
  }

  const normalizedSession = await normalizeSessionGuestStay(session);

  if (!normalizedSession) {
    return null;
  }

  if (normalizedSession.endedAt) {
    const pendingCounts = await getNfcGuestSessionPendingCounts(
      normalizedSession.id
    );

    if (pendingCounts.totalPending <= 0) {
      return null;
    }

    return db.nfcGuestSession.update({
      where: {
        id: normalizedSession.id,
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
      id: normalizedSession.id,
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
      pendingPayments: 0,
      totalPending: 0,
      session: null,
    };
  }

  const pendingCounts = await getNfcGuestSessionPendingCounts(session.id);

  return {
    hasSession: true,
    keepSession: pendingCounts.totalPending > 0,
    ...pendingCounts,
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
      pendingPayments: 0,
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
      pendingPayments: status.pendingPayments,
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
    pendingPayments: 0,
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

export async function getCurrentNfcGuestIdentity(tagCode: string) {
  const session = await getCurrentNfcGuestSession(tagCode);

  if (!session) {
    return {
      session: null,
      guestStay: null,
      guestMember: null,
      guestStayId: null,
      guestMemberId: null,
      guestName: null,
    };
  }

  if (session.guestStayId) {
    const guestStay = await db.guestStay.findFirst({
      where: {
        id: session.guestStayId,
        hotelId: session.hotelId,
        ...getActiveGuestStayDateFilter(),
      },
      select: {
        id: true,
        hotelId: true,
        roomId: true,
        guestMemberId: true,
        status: true,
        expectedCheckOutAt: true,
        guestMember: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    if (guestStay) {
      return {
        session,
        guestStay,
        guestMember: guestStay.guestMember,
        guestStayId: guestStay.id,
        guestMemberId: guestStay.guestMemberId,
        guestName: guestStay.guestMember.name,
      };
    }
  }

  if (session.guestMemberId) {
    const guestMember = await db.guestMember.findFirst({
      where: {
        id: session.guestMemberId,
        hotelId: session.hotelId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
    });

    if (guestMember) {
      return {
        session,
        guestStay: null,
        guestMember,
        guestStayId: null,
        guestMemberId: guestMember.id,
        guestName: guestMember.name,
      };
    }
  }

  return {
    session,
    guestStay: null,
    guestMember: null,
    guestStayId: null,
    guestMemberId: null,
    guestName: null,
  };
}