import {
  GuestPointLedgerStatus,
  GuestPointLedgerType,
  OrderStatus,
  PaymentStatus,
  ServiceRequestStatus,
  type Prisma,
} from '@prisma/client';
import { db } from '@/lib/db';

type Tx = Prisma.TransactionClient;

type AwardGuestPointsOnceParams = {
  hotelId: string;
  guestMemberId: string | null | undefined;
  guestStayId?: string | null;
  points: number;
  type: GuestPointLedgerType;
  status?: GuestPointLedgerStatus;
  source: string;
  referenceId: string;
  description?: string;
  createdById?: string | null;
};

async function getOrCreatePointSettings(tx: Tx, hotelId: string) {
  return tx.guestPointSettings.upsert({
    where: {
      hotelId,
    },
    update: {},
    create: {
      hotelId,
    },
  });
}

async function ensureGuestPointAccount({
  tx,
  hotelId,
  guestMemberId,
}: {
  tx: Tx;
  hotelId: string;
  guestMemberId: string;
}) {
  return tx.guestPointAccount.upsert({
    where: {
      guestMemberId,
    },
    update: {},
    create: {
      hotelId,
      guestMemberId,
    },
  });
}

function isPrismaUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export async function awardGuestPointsOnce({
  hotelId,
  guestMemberId,
  guestStayId,
  points,
  type,
  status = GuestPointLedgerStatus.CONFIRMED,
  source,
  referenceId,
  description,
  createdById,
}: AwardGuestPointsOnceParams) {
  if (!guestMemberId) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'missing_guest_member',
      pointsAwarded: 0,
    };
  }

  if (!Number.isInteger(points) || points <= 0) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'invalid_points',
      pointsAwarded: 0,
    };
  }

  if (!source.trim() || !referenceId.trim()) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'missing_reference',
      pointsAwarded: 0,
    };
  }

  try {
    return await db.$transaction(async (tx) => {
      const existingLedger = await tx.guestPointLedger.findUnique({
        where: {
          hotelId_type_source_referenceId: {
            hotelId,
            type,
            source,
            referenceId,
          },
        },
        select: {
          id: true,
          points: true,
        },
      });

      if (existingLedger) {
        return {
          awarded: false as const,
          skipped: true as const,
          reason: 'already_awarded',
          pointsAwarded: 0,
          ledgerId: existingLedger.id,
        };
      }

      await ensureGuestPointAccount({
        tx,
        hotelId,
        guestMemberId,
      });

      const ledger = await tx.guestPointLedger.create({
        data: {
          hotelId,
          guestMemberId,
          guestStayId: guestStayId || null,
          type,
          status,
          points,
          source,
          referenceId,
          description,
          createdById: createdById || null,
        },
        select: {
          id: true,
        },
      });

      if (status === GuestPointLedgerStatus.PENDING) {
        await tx.guestPointAccount.update({
          where: {
            guestMemberId,
          },
          data: {
            pendingPoints: {
              increment: points,
            },
          },
        });
      } else {
        await tx.guestPointAccount.update({
          where: {
            guestMemberId,
          },
          data: {
            availablePoints: {
              increment: points,
            },
            lifetimeEarnedPoints: {
              increment: points,
            },
          },
        });
      }

      return {
        awarded: true as const,
        skipped: false as const,
        reason: null,
        pointsAwarded: points,
        ledgerId: ledger.id,
      };
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return {
        awarded: false as const,
        skipped: true as const,
        reason: 'already_awarded',
        pointsAwarded: 0,
      };
    }

    throw error;
  }
}

export async function awardGuestStayCheckInPoints(guestStayId: string) {
  const guestStay = await db.guestStay.findUnique({
    where: {
      id: guestStayId,
    },
    select: {
      id: true,
      hotelId: true,
      guestMemberId: true,
      guestMember: {
        select: {
          name: true,
        },
      },
      room: {
        select: {
          number: true,
        },
      },
    },
  });

  if (!guestStay) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'guest_stay_not_found',
      pointsAwarded: 0,
    };
  }

  const settings = await db.$transaction(async (tx) =>
    getOrCreatePointSettings(tx, guestStay.hotelId)
  );

  if (!settings.enabled || !settings.guestStayCheckInEnabled) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'points_disabled',
      pointsAwarded: 0,
    };
  }

  if (settings.guestStayCheckInPoints <= 0) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'zero_check_in_points',
      pointsAwarded: 0,
    };
  }

  return awardGuestPointsOnce({
    hotelId: guestStay.hotelId,
    guestMemberId: guestStay.guestMemberId,
    guestStayId: guestStay.id,
    points: settings.guestStayCheckInPoints,
    type: GuestPointLedgerType.BONUS,
    status: GuestPointLedgerStatus.CONFIRMED,
    source: 'GUEST_STAY_CHECK_IN',
    referenceId: guestStay.id,
    description: `Check-in bonus for ${guestStay.guestMember.name} in Room ${guestStay.room.number}`,
  });
}

export async function syncOrderPoints(orderId: string) {
  const order = await db.order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      hotelId: true,
      orderCode: true,
      guestMemberId: true,
      guestStayId: true,
      status: true,
      paymentStatus: true,
      totalCents: true,
    },
  });

  if (!order) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'order_not_found',
      pointsAwarded: 0,
    };
  }

  if (!order.guestMemberId) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'missing_guest_member',
      pointsAwarded: 0,
    };
  }

  if (
    order.status === OrderStatus.CANCELLED ||
    order.paymentStatus === PaymentStatus.REFUNDED
  ) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'order_cancelled_or_refunded',
      pointsAwarded: 0,
    };
  }

  const isCompletedForPoints =
    order.status === OrderStatus.DELIVERED ||
    order.paymentStatus === PaymentStatus.PAID;

  if (!isCompletedForPoints) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'order_not_completed',
      pointsAwarded: 0,
    };
  }

  const settings = await db.$transaction(async (tx) =>
    getOrCreatePointSettings(tx, order.hotelId)
  );

  if (!settings.enabled) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'points_disabled',
      pointsAwarded: 0,
    };
  }

  if (order.totalCents < settings.minimumSpendCents) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'below_minimum_spend',
      pointsAwarded: 0,
    };
  }

  if (settings.spendCentsPerPoint <= 0) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'invalid_spend_rate',
      pointsAwarded: 0,
    };
  }

  const points = Math.floor(order.totalCents / settings.spendCentsPerPoint);

  return awardGuestPointsOnce({
    hotelId: order.hotelId,
    guestMemberId: order.guestMemberId,
    guestStayId: order.guestStayId,
    points,
    type: GuestPointLedgerType.EARNED,
    status: GuestPointLedgerStatus.CONFIRMED,
    source: 'ORDER_COMPLETED',
    referenceId: order.id,
    description: `Points earned from completed order ${order.orderCode}`,
  });
}

export async function syncServiceRequestPoints(serviceRequestId: string) {
  const request = await db.serviceRequest.findUnique({
    where: {
      id: serviceRequestId,
    },
    select: {
      id: true,
      hotelId: true,
      requestCode: true,
      type: true,
      guestMemberId: true,
      guestStayId: true,
      status: true,
    },
  });

  if (!request) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'service_request_not_found',
      pointsAwarded: 0,
    };
  }

  if (!request.guestMemberId) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'missing_guest_member',
      pointsAwarded: 0,
    };
  }

  if (request.status !== ServiceRequestStatus.COMPLETED) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'service_request_not_completed',
      pointsAwarded: 0,
    };
  }

  const settings = await db.$transaction(async (tx) =>
    getOrCreatePointSettings(tx, request.hotelId)
  );

  if (!settings.enabled || settings.serviceRequestCompletionPoints <= 0) {
    return {
      awarded: false as const,
      skipped: true as const,
      reason: 'points_disabled_or_zero',
      pointsAwarded: 0,
    };
  }

  return awardGuestPointsOnce({
    hotelId: request.hotelId,
    guestMemberId: request.guestMemberId,
    guestStayId: request.guestStayId,
    points: settings.serviceRequestCompletionPoints,
    type: GuestPointLedgerType.EARNED,
    status: GuestPointLedgerStatus.CONFIRMED,
    source: 'SERVICE_REQUEST_COMPLETED',
    referenceId: request.id,
    description: `Points earned from completed service request ${request.requestCode} — ${request.type}`,
  });
}

export async function getGuestStayPointSummary(guestStayId: string) {
  const guestStay = await db.guestStay.findUnique({
    where: {
      id: guestStayId,
    },
    select: {
      id: true,
      hotelId: true,
      guestMemberId: true,
      guestMember: {
        select: {
          id: true,
          name: true,
          pointAccount: true,
        },
      },
    },
  });

  if (!guestStay) {
    return null;
  }

  const [confirmedStayPoints, pendingStayPoints] = await Promise.all([
    db.guestPointLedger.aggregate({
      where: {
        hotelId: guestStay.hotelId,
        guestStayId: guestStay.id,
        status: GuestPointLedgerStatus.CONFIRMED,
        points: {
          gt: 0,
        },
      },
      _sum: {
        points: true,
      },
    }),

    db.guestPointLedger.aggregate({
      where: {
        hotelId: guestStay.hotelId,
        guestStayId: guestStay.id,
        status: GuestPointLedgerStatus.PENDING,
        points: {
          gt: 0,
        },
      },
      _sum: {
        points: true,
      },
    }),
  ]);

  return {
    guestStayId: guestStay.id,
    guestMemberId: guestStay.guestMemberId,
    guestName: guestStay.guestMember.name,
    availablePoints: guestStay.guestMember.pointAccount?.availablePoints ?? 0,
    pendingPoints: guestStay.guestMember.pointAccount?.pendingPoints ?? 0,
    lifetimeEarnedPoints:
      guestStay.guestMember.pointAccount?.lifetimeEarnedPoints ?? 0,
    lifetimeRedeemedPoints:
      guestStay.guestMember.pointAccount?.lifetimeRedeemedPoints ?? 0,
    confirmedStayPoints: confirmedStayPoints._sum.points ?? 0,
    pendingStayPoints: pendingStayPoints._sum.points ?? 0,
  };
}

export async function voidSyncedOrderPoints(orderId: string) {
  const order = await db.order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      hotelId: true,
      orderCode: true,
      guestMemberId: true,
      guestStayId: true,
    },
  });

  if (!order || !order.guestMemberId) {
    return {
      voided: false as const,
      skipped: true as const,
      reason: 'missing_order_or_guest_member',
      pointsVoided: 0,
    };
  }

  /**
   * Important:
   * Store nullable Prisma fields into narrowed constants before using them
   * inside the transaction callback.
   */
  const guestMemberId = order.guestMemberId;
  const guestStayId = order.guestStayId ?? null;

  return db.$transaction(async (tx) => {
    const existingVoid = await tx.guestPointLedger.findUnique({
      where: {
        hotelId_type_source_referenceId: {
          hotelId: order.hotelId,
          type: GuestPointLedgerType.VOIDED,
          source: 'ORDER_COMPLETED_VOID',
          referenceId: order.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingVoid) {
      return {
        voided: false as const,
        skipped: true as const,
        reason: 'already_voided',
        pointsVoided: 0,
      };
    }

    const earnedLedger = await tx.guestPointLedger.findUnique({
      where: {
        hotelId_type_source_referenceId: {
          hotelId: order.hotelId,
          type: GuestPointLedgerType.EARNED,
          source: 'ORDER_COMPLETED',
          referenceId: order.id,
        },
      },
      select: {
        id: true,
        points: true,
        status: true,
      },
    });

    if (
      !earnedLedger ||
      earnedLedger.status === GuestPointLedgerStatus.VOIDED ||
      earnedLedger.points <= 0
    ) {
      return {
        voided: false as const,
        skipped: true as const,
        reason: 'no_confirmed_points_to_void',
        pointsVoided: 0,
      };
    }

    const account = await tx.guestPointAccount.findUnique({
      where: {
        guestMemberId,
      },
      select: {
        availablePoints: true,
        lifetimeEarnedPoints: true,
      },
    });

    if (!account) {
      return {
        voided: false as const,
        skipped: true as const,
        reason: 'point_account_not_found',
        pointsVoided: 0,
      };
    }

    await tx.guestPointLedger.update({
      where: {
        id: earnedLedger.id,
      },
      data: {
        status: GuestPointLedgerStatus.VOIDED,
      },
    });

    const voidLedger = await tx.guestPointLedger.create({
      data: {
        hotelId: order.hotelId,
        guestMemberId,
        guestStayId,
        type: GuestPointLedgerType.VOIDED,
        status: GuestPointLedgerStatus.CONFIRMED,
        points: -earnedLedger.points,
        source: 'ORDER_COMPLETED_VOID',
        referenceId: order.id,
        description: `Voided points from cancelled/refunded order ${order.orderCode}`,
      },
      select: {
        id: true,
      },
    });

    await tx.guestPointAccount.update({
      where: {
        guestMemberId,
      },
      data: {
        availablePoints: Math.max(
          account.availablePoints - earnedLedger.points,
          0
        ),
        lifetimeEarnedPoints: Math.max(
          account.lifetimeEarnedPoints - earnedLedger.points,
          0
        ),
      },
    });

    return {
      voided: true as const,
      skipped: false as const,
      reason: null,
      pointsVoided: earnedLedger.points,
      ledgerId: voidLedger.id,
    };
  });
}
export async function voidSyncedServiceRequestPoints(serviceRequestId: string) {
  const request = await db.serviceRequest.findUnique({
    where: {
      id: serviceRequestId,
    },
    select: {
      id: true,
      hotelId: true,
      requestCode: true,
      type: true,
      guestMemberId: true,
      guestStayId: true,
    },
  });

  if (!request || !request.guestMemberId) {
    return {
      voided: false as const,
      skipped: true as const,
      reason: 'missing_request_or_guest_member',
      pointsVoided: 0,
    };
  }

  const guestMemberId = request.guestMemberId;
  const guestStayId = request.guestStayId ?? null;

  return db.$transaction(async (tx) => {
    const existingVoid = await tx.guestPointLedger.findUnique({
      where: {
        hotelId_type_source_referenceId: {
          hotelId: request.hotelId,
          type: GuestPointLedgerType.VOIDED,
          source: 'SERVICE_REQUEST_COMPLETED_VOID',
          referenceId: request.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingVoid) {
      return {
        voided: false as const,
        skipped: true as const,
        reason: 'already_voided',
        pointsVoided: 0,
      };
    }

    const earnedLedger = await tx.guestPointLedger.findUnique({
      where: {
        hotelId_type_source_referenceId: {
          hotelId: request.hotelId,
          type: GuestPointLedgerType.EARNED,
          source: 'SERVICE_REQUEST_COMPLETED',
          referenceId: request.id,
        },
      },
      select: {
        id: true,
        points: true,
        status: true,
      },
    });

    if (
      !earnedLedger ||
      earnedLedger.status === GuestPointLedgerStatus.VOIDED ||
      earnedLedger.points <= 0
    ) {
      return {
        voided: false as const,
        skipped: true as const,
        reason: 'no_confirmed_points_to_void',
        pointsVoided: 0,
      };
    }

    const account = await tx.guestPointAccount.findUnique({
      where: {
        guestMemberId,
      },
      select: {
        availablePoints: true,
        lifetimeEarnedPoints: true,
      },
    });

    if (!account) {
      return {
        voided: false as const,
        skipped: true as const,
        reason: 'point_account_not_found',
        pointsVoided: 0,
      };
    }

    await tx.guestPointLedger.update({
      where: {
        id: earnedLedger.id,
      },
      data: {
        status: GuestPointLedgerStatus.VOIDED,
      },
    });

    const voidLedger = await tx.guestPointLedger.create({
      data: {
        hotelId: request.hotelId,
        guestMemberId,
        guestStayId,
        type: GuestPointLedgerType.VOIDED,
        status: GuestPointLedgerStatus.CONFIRMED,
        points: -earnedLedger.points,
        source: 'SERVICE_REQUEST_COMPLETED_VOID',
        referenceId: request.id,
        description: `Voided points from cancelled service request ${request.requestCode} — ${request.type}`,
      },
      select: {
        id: true,
      },
    });

    await tx.guestPointAccount.update({
      where: {
        guestMemberId,
      },
      data: {
        availablePoints: Math.max(
          account.availablePoints - earnedLedger.points,
          0
        ),
        lifetimeEarnedPoints: Math.max(
          account.lifetimeEarnedPoints - earnedLedger.points,
          0
        ),
      },
    });

    return {
      voided: true as const,
      skipped: false as const,
      reason: null,
      pointsVoided: earnedLedger.points,
      ledgerId: voidLedger.id,
    };
  });
}