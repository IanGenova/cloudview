import { cookies } from 'next/headers';
import {
  GuestPointLedgerStatus,
  GuestPointLedgerType,
} from '@prisma/client';
import { db } from '@/lib/db';
import {
  findOrCreateGuestMember,
  getOrCreatePointAccount,
  getOrCreatePointSettings,
} from '@/lib/rewards';
import {
  getCurrentNfcGuestSession,
  requireCurrentNfcGuestSession,
} from '@/lib/nfc-guest-session';

export function getGuestRewardsCookieName(hotelId: string) {
  const safeHotelId = hotelId.replace(/[^a-zA-Z0-9_-]/g, '_');

  return `cv_rewards_member_${safeHotelId}`;
}

function getTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getDayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    start,
    end,
  };
}

export async function readGuestMemberIdFromRewardsCookie(hotelId: string) {
  const cookieStore = await cookies();
  const cookieName = getGuestRewardsCookieName(hotelId);

  return cookieStore.get(cookieName)?.value || null;
}

export async function setGuestMemberRewardsCookie(params: {
  hotelId: string;
  guestMemberId: string;
}) {
  const cookieStore = await cookies();

  cookieStore.set(getGuestRewardsCookieName(params.hotelId), params.guestMemberId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });
}

export async function getGuestRewardsContextForTag(tagCode: string) {
  const session = await getCurrentNfcGuestSession(tagCode);

  if (!session) {
    return {
      session: null,
      guestMember: null,
      pointAccount: null,
    };
  }

 const sessionGuestMemberId = session.guestMemberId ?? null;
const cookieGuestMemberId = sessionGuestMemberId
  ? null
  : await readGuestMemberIdFromRewardsCookie(session.hotelId);

const guestMemberId = sessionGuestMemberId ?? cookieGuestMemberId;

  if (!guestMemberId) {
    return {
      session,
      guestMember: null,
      pointAccount: null,
    };
  }

  const guestMember = await db.guestMember.findFirst({
    where: {
      id: guestMemberId,
      hotelId: session.hotelId,
      isActive: true,
    },
  });

  if (!guestMember) {
    return {
      session,
      guestMember: null,
      pointAccount: null,
    };
  }

  const pointAccount = await getOrCreatePointAccount({
    hotelId: session.hotelId,
    guestMemberId: guestMember.id,
  });

  return {
    session,
    guestMember,
    pointAccount,
  };
}

export async function awardNfcTapPointsIfEligible(params: {
  hotelId: string;
  guestMemberId: string;
  tagId: string;
  sessionId: string;
}) {
  const settings = await getOrCreatePointSettings(params.hotelId);

  if (!settings.enabled) {
    return {
      awarded: false,
      points: 0,
      reason: 'POINTS_DISABLED',
    };
  }

  if (settings.nfcTapPoints <= 0 || settings.nfcDailyMaxPoints <= 0) {
    return {
      awarded: false,
      points: 0,
      reason: 'NFC_REWARDS_DISABLED',
    };
  }

  const todayKey = getTodayKey();
  const { start, end } = getDayBounds();

  const referenceId = settings.nfcOncePerTagPerDay
    ? `${params.guestMemberId}:${params.tagId}:${todayKey}`
    : `${params.guestMemberId}:${params.tagId}:${params.sessionId}`;

  const existingLedger = await db.guestPointLedger.findUnique({
    where: {
      hotelId_type_source_referenceId: {
        hotelId: params.hotelId,
        type: GuestPointLedgerType.BONUS,
        source: 'NFC_DAILY_TAP',
        referenceId,
      },
    },
  });

  if (existingLedger) {
    return {
      awarded: false,
      points: 0,
      reason: 'ALREADY_CLAIMED',
    };
  }

  const dailyPoints = await db.guestPointLedger.aggregate({
    where: {
      hotelId: params.hotelId,
      guestMemberId: params.guestMemberId,
      source: 'NFC_DAILY_TAP',
      status: GuestPointLedgerStatus.CONFIRMED,
      createdAt: {
        gte: start,
        lt: end,
      },
    },
    _sum: {
      points: true,
    },
  });

  const usedToday = Math.max(dailyPoints._sum.points ?? 0, 0);
  const remainingToday = Math.max(settings.nfcDailyMaxPoints - usedToday, 0);

  if (remainingToday <= 0) {
    return {
      awarded: false,
      points: 0,
      reason: 'DAILY_LIMIT_REACHED',
    };
  }

  const pointsToAward = Math.min(settings.nfcTapPoints, remainingToday);

  await db.$transaction([
    db.guestPointLedger.create({
      data: {
        hotelId: params.hotelId,
        guestMemberId: params.guestMemberId,
        type: GuestPointLedgerType.BONUS,
        status: GuestPointLedgerStatus.CONFIRMED,
        points: pointsToAward,
        source: 'NFC_DAILY_TAP',
        referenceId,
        description: `NFC visit reward for ${todayKey}`,
      },
    }),

    db.guestPointAccount.upsert({
      where: {
        guestMemberId: params.guestMemberId,
      },
      update: {
        availablePoints: {
          increment: pointsToAward,
        },
        lifetimeEarnedPoints: {
          increment: pointsToAward,
        },
      },
      create: {
        hotelId: params.hotelId,
        guestMemberId: params.guestMemberId,
        availablePoints: pointsToAward,
        lifetimeEarnedPoints: pointsToAward,
      },
    }),
  ]);

  return {
    awarded: true,
    points: pointsToAward,
    reason: 'AWARDED',
  };
}

export async function claimRewardsForCurrentNfcSession(params: {
  tagCode: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}) {
  const session = await requireCurrentNfcGuestSession(params.tagCode);

  const guestMember = await findOrCreateGuestMember({
    hotelId: session.hotelId,
    name: params.name,
    phone: params.phone,
    email: params.email,
  });

  await db.$transaction([
    db.nfcGuestSession.update({
      where: {
        id: session.id,
      },
      data: {
        guestMemberId: guestMember.id,
      },
    }),

    db.order.updateMany({
      where: {
        guestSessionId: session.id,
        guestMemberId: null,
      },
      data: {
        guestMemberId: guestMember.id,
      },
    }),

    db.serviceRequest.updateMany({
      where: {
        guestSessionId: session.id,
        guestMemberId: null,
      },
      data: {
        guestMemberId: guestMember.id,
      },
    }),
  ]);

  await setGuestMemberRewardsCookie({
    hotelId: session.hotelId,
    guestMemberId: guestMember.id,
  });

  const nfcAward = await awardNfcTapPointsIfEligible({
    hotelId: session.hotelId,
    guestMemberId: guestMember.id,
    tagId: session.tagId,
    sessionId: session.id,
  });

  const pointAccount = await getOrCreatePointAccount({
    hotelId: session.hotelId,
    guestMemberId: guestMember.id,
  });

  return {
    session,
    guestMember,
    pointAccount,
    nfcAward,
  };
}

export async function resolveGuestMemberIdForCurrentNfcSession(tagCode: string) {
  const session = await getCurrentNfcGuestSession(tagCode);

  if (!session) {
    return null;
  }

  if (session.guestMemberId) {
    return session.guestMemberId;
  }

  const guestMemberId = await readGuestMemberIdFromRewardsCookie(session.hotelId);

  if (!guestMemberId) {
    return null;
  }

  const guestMember = await db.guestMember.findFirst({
    where: {
      id: guestMemberId,
      hotelId: session.hotelId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!guestMember) {
    return null;
  }

  await db.nfcGuestSession.update({
    where: {
      id: session.id,
    },
    data: {
      guestMemberId: guestMember.id,
    },
  });

  return guestMember.id;
}

export async function awardServiceRequestPointsIfEligible(serviceRequestId: string) {
  const request = await db.serviceRequest.findUnique({
    where: {
      id: serviceRequestId,
    },
    select: {
      id: true,
      hotelId: true,
      requestCode: true,
      type: true,
      status: true,
      guestMemberId: true,
    },
  });

  if (!request) {
    return {
      awarded: false,
      points: 0,
      reason: 'REQUEST_NOT_FOUND',
    };
  }

  if (!request.guestMemberId) {
    return {
      awarded: false,
      points: 0,
      reason: 'NO_GUEST_MEMBER',
    };
  }

  if (request.status !== 'COMPLETED') {
    return {
      awarded: false,
      points: 0,
      reason: 'REQUEST_NOT_COMPLETED',
    };
  }

  const settings = await getOrCreatePointSettings(request.hotelId);

  if (!settings.enabled) {
    return {
      awarded: false,
      points: 0,
      reason: 'POINTS_DISABLED',
    };
  }

  if (
    settings.serviceRequestCompletionPoints <= 0 ||
    settings.serviceRequestDailyMaxPoints <= 0
  ) {
    return {
      awarded: false,
      points: 0,
      reason: 'SERVICE_REWARDS_DISABLED',
    };
  }

  const { start, end } = getDayBounds();

  const referenceId = request.id;

  const existingLedger = await db.guestPointLedger.findUnique({
    where: {
      hotelId_type_source_referenceId: {
        hotelId: request.hotelId,
        type: GuestPointLedgerType.BONUS,
        source: 'SERVICE_REQUEST_COMPLETED',
        referenceId,
      },
    },
  });

  if (existingLedger) {
    return {
      awarded: false,
      points: 0,
      reason: 'ALREADY_AWARDED',
    };
  }

  const dailyPoints = await db.guestPointLedger.aggregate({
    where: {
      hotelId: request.hotelId,
      guestMemberId: request.guestMemberId,
      source: 'SERVICE_REQUEST_COMPLETED',
      status: GuestPointLedgerStatus.CONFIRMED,
      createdAt: {
        gte: start,
        lt: end,
      },
    },
    _sum: {
      points: true,
    },
  });

  const usedToday = Math.max(dailyPoints._sum.points ?? 0, 0);
  const remainingToday = Math.max(
    settings.serviceRequestDailyMaxPoints - usedToday,
    0
  );

  if (remainingToday <= 0) {
    return {
      awarded: false,
      points: 0,
      reason: 'DAILY_LIMIT_REACHED',
    };
  }

  const pointsToAward = Math.min(
    settings.serviceRequestCompletionPoints,
    remainingToday
  );

  await db.$transaction([
    db.guestPointLedger.create({
      data: {
        hotelId: request.hotelId,
        guestMemberId: request.guestMemberId,
        type: GuestPointLedgerType.BONUS,
        status: GuestPointLedgerStatus.CONFIRMED,
        points: pointsToAward,
        source: 'SERVICE_REQUEST_COMPLETED',
        referenceId,
        description: `Completed service request ${request.requestCode}: ${request.type}`,
      },
    }),

    db.guestPointAccount.upsert({
      where: {
        guestMemberId: request.guestMemberId,
      },
      update: {
        availablePoints: {
          increment: pointsToAward,
        },
        lifetimeEarnedPoints: {
          increment: pointsToAward,
        },
      },
      create: {
        hotelId: request.hotelId,
        guestMemberId: request.guestMemberId,
        availablePoints: pointsToAward,
        lifetimeEarnedPoints: pointsToAward,
      },
    }),
  ]);

  return {
    awarded: true,
    points: pointsToAward,
    reason: 'AWARDED',
  };
}