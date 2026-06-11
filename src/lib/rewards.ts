import {
  Prisma,
  GuestPointLedgerStatus,
  GuestPointLedgerType,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { db } from '@/lib/db';

export async function getOrCreatePointSettings(hotelId: string) {
  return db.guestPointSettings.upsert({
    where: {
      hotelId,
    },
    update: {},
    create: {
      hotelId,
      enabled: true,
      spendCentsPerPoint: 10000,
      minimumSpendCents: 0,
      redemptionEnabled: true,
    },
  });
}

export async function getOrCreatePointAccount(params: {
  hotelId: string;
  guestMemberId: string;
}) {
  return db.guestPointAccount.upsert({
    where: {
      guestMemberId: params.guestMemberId,
    },
    update: {},
    create: {
      hotelId: params.hotelId,
      guestMemberId: params.guestMemberId,
      availablePoints: 0,
      pendingPoints: 0,
      lifetimeEarnedPoints: 0,
      lifetimeRedeemedPoints: 0,
    },
  });
}

export async function findOrCreateGuestMember(params: {
  hotelId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}) {
  const phone = params.phone?.trim() || null;
  const email = params.email?.trim().toLowerCase() || null;

  const orFilters: Prisma.GuestMemberWhereInput[] = [];

  if (phone) {
    orFilters.push({
      phone,
    });
  }

  if (email) {
    orFilters.push({
      email,
    });
  }

  const existing = orFilters.length
    ? await db.guestMember.findFirst({
        where: {
          hotelId: params.hotelId,
          OR: orFilters,
        },
      })
    : null;

  if (existing) {
    await getOrCreatePointAccount({
      hotelId: params.hotelId,
      guestMemberId: existing.id,
    });

    return existing;
  }

  const guest = await db.guestMember.create({
    data: {
      hotelId: params.hotelId,
      name: params.name.trim() || 'Guest',
      phone,
      email,
      pointAccount: {
        create: {
          hotelId: params.hotelId,
        },
      },
    },
  });

  return guest;
}

export function calculateEarnedPoints(params: {
  totalCents: number;
  spendCentsPerPoint: number;
  minimumSpendCents: number;
}) {
  if (params.totalCents < params.minimumSpendCents) {
    return 0;
  }

  if (params.spendCentsPerPoint <= 0) {
    return 0;
  }

  return Math.floor(params.totalCents / params.spendCentsPerPoint);
}

export async function awardOrderPointsIfEligible(orderId: string) {
  const order = await db.order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      orderCode: true,
      hotelId: true,
      totalCents: true,
      status: true,
      paymentStatus: true,
      guestMemberId: true,
    },
  });

  if (!order) {
    return {
      awarded: false,
      reason: 'ORDER_NOT_FOUND',
    };
  }

  if (!order.guestMemberId) {
    return {
      awarded: false,
      reason: 'NO_GUEST_MEMBER',
    };
  }

  if (order.status !== OrderStatus.DELIVERED) {
    return {
      awarded: false,
      reason: 'ORDER_NOT_DELIVERED',
    };
  }

  if (order.paymentStatus !== PaymentStatus.PAID) {
    return {
      awarded: false,
      reason: 'ORDER_NOT_PAID',
    };
  }

  const settings = await getOrCreatePointSettings(order.hotelId);

  if (!settings.enabled) {
    return {
      awarded: false,
      reason: 'POINTS_DISABLED',
    };
  }

  const points = calculateEarnedPoints({
    totalCents: order.totalCents,
    spendCentsPerPoint: settings.spendCentsPerPoint,
    minimumSpendCents: settings.minimumSpendCents,
  });

  if (points <= 0) {
    return {
      awarded: false,
      reason: 'ZERO_POINTS',
    };
  }

  const existingLedger = await db.guestPointLedger.findUnique({
    where: {
      hotelId_type_source_referenceId: {
        hotelId: order.hotelId,
        type: GuestPointLedgerType.EARNED,
        source: 'ORDER',
        referenceId: order.id,
      },
    },
  });

  if (existingLedger) {
    return {
      awarded: false,
      reason: 'ALREADY_AWARDED',
    };
  }

  await db.$transaction([
    db.guestPointLedger.create({
      data: {
        hotelId: order.hotelId,
        guestMemberId: order.guestMemberId,
        type: GuestPointLedgerType.EARNED,
        status: GuestPointLedgerStatus.CONFIRMED,
        points,
        source: 'ORDER',
        referenceId: order.id,
        description: `Earned from order ${order.orderCode}`,
      },
    }),

    db.guestPointAccount.upsert({
      where: {
        guestMemberId: order.guestMemberId,
      },
      update: {
        availablePoints: {
          increment: points,
        },
        lifetimeEarnedPoints: {
          increment: points,
        },
      },
      create: {
        hotelId: order.hotelId,
        guestMemberId: order.guestMemberId,
        availablePoints: points,
        lifetimeEarnedPoints: points,
        pendingPoints: 0,
        lifetimeRedeemedPoints: 0,
      },
    }),
  ]);

  return {
    awarded: true,
    points,
  };
}

export async function voidOrderPoints(orderId: string) {
  const earnedLedger = await db.guestPointLedger.findFirst({
    where: {
      source: 'ORDER',
      referenceId: orderId,
      type: GuestPointLedgerType.EARNED,
      status: GuestPointLedgerStatus.CONFIRMED,
    },
  });

  if (!earnedLedger) {
    return {
      voided: false,
      reason: 'NO_EARNED_POINTS',
    };
  }

  const existingVoid = await db.guestPointLedger.findFirst({
    where: {
      source: 'ORDER_VOID',
      referenceId: orderId,
      type: GuestPointLedgerType.VOIDED,
    },
  });

  if (existingVoid) {
    return {
      voided: false,
      reason: 'ALREADY_VOIDED',
    };
  }

  const account = await db.guestPointAccount.findUnique({
    where: {
      guestMemberId: earnedLedger.guestMemberId,
    },
  });

  if (!account) {
    return {
      voided: false,
      reason: 'NO_ACCOUNT',
    };
  }

  const nextAvailable = Math.max(
    0,
    account.availablePoints - earnedLedger.points
  );

  await db.$transaction([
    db.guestPointLedger.update({
      where: {
        id: earnedLedger.id,
      },
      data: {
        status: GuestPointLedgerStatus.VOIDED,
      },
    }),

    db.guestPointLedger.create({
      data: {
        hotelId: earnedLedger.hotelId,
        guestMemberId: earnedLedger.guestMemberId,
        type: GuestPointLedgerType.VOIDED,
        status: GuestPointLedgerStatus.CONFIRMED,
        points: -earnedLedger.points,
        source: 'ORDER_VOID',
        referenceId: orderId,
        description: 'Points voided because order was cancelled/refunded',
      },
    }),

    db.guestPointAccount.update({
      where: {
        guestMemberId: earnedLedger.guestMemberId,
      },
      data: {
        availablePoints: nextAvailable,
      },
    }),
  ]);

  return {
    voided: true,
    points: earnedLedger.points,
  };
}