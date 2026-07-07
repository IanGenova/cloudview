'use server';

import {
  GuestPointLedgerStatus,
  GuestPointLedgerType,
  RewardRedemptionStatus,
  RewardType,
  DashboardModule,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import {
  requireDashboardPermission,
  type DashboardPermissionAction,
} from '@/lib/dashboard-permissions';
import { getOrCreatePointAccount } from '@/lib/rewards';

function getString(formData: FormData, key: string, fallback = '') {
  const value = formData.get(key);

  if (typeof value !== 'string') {
    return fallback;
  }

  return value.trim() || fallback;
}

function getNumber(formData: FormData, key: string, fallback = 0) {
  const value = Number(formData.get(key));

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function getDate(formData: FormData, key: string, endOfDay = false) {
  const value = getString(formData, key);

  if (!value) {
    return null;
  }

  const date = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

async function requireRewardsPermission(action: DashboardPermissionAction) {
  return requireDashboardPermission(DashboardModule.REWARDS, action);
}

async function getActionHotelId(
  formData: FormData,
  action: DashboardPermissionAction
) {
  const user = await requireRewardsPermission(action);
  const hotelId = getString(formData, 'hotelId');

  if (!hotelId) {
    throw new Error('Hotel is required.');
  }

  const hotel = await db.hotel.findFirst({
    where: {
      id: hotelId,
    },
    select: {
      id: true,
    },
  });

  if (!hotel) {
    throw new Error('Selected hotel was not found.');
  }

  return {
    user,
    hotelId: hotel.id,
  };
}

function parseRewardType(input: string) {
  if (input === RewardType.DISCOUNT_PERCENT) {
    return RewardType.DISCOUNT_PERCENT;
  }

  if (input === RewardType.FREE_ITEM) {
    return RewardType.FREE_ITEM;
  }

  if (input === RewardType.CUSTOM) {
    return RewardType.CUSTOM;
  }

  return RewardType.DISCOUNT_AMOUNT;
}

function buildRewardData(formData: FormData) {
  const name = getString(formData, 'name');
  const description = getString(formData, 'description');
  const pointsCost = getNumber(formData, 'pointsCost');
  const rewardType = parseRewardType(getString(formData, 'rewardType'));

  const discountCents = Math.round(getNumber(formData, 'discountPesos') * 100);
  const discountPercent = getNumber(formData, 'discountPercent');
  const freeProductId = getString(formData, 'freeProductId');

  const validFrom = getDate(formData, 'validFrom');
  const validUntil = getDate(formData, 'validUntil', true);
  const isActive = formData.get('isActive') === 'true';

  if (!name) {
    throw new Error('Reward name is required.');
  }

  if (pointsCost <= 0) {
    throw new Error('Points cost must be greater than zero.');
  }

  if (rewardType === RewardType.DISCOUNT_AMOUNT && discountCents <= 0) {
    throw new Error('Discount amount is required for peso discount rewards.');
  }

  if (
    rewardType === RewardType.DISCOUNT_PERCENT &&
    (discountPercent <= 0 || discountPercent > 100)
  ) {
    throw new Error('Discount percent must be between 1 and 100.');
  }

  if (validFrom && validUntil && validUntil < validFrom) {
    throw new Error('Valid until date must be after valid from date.');
  }

  return {
    name,
    description: description || null,
    pointsCost,
    rewardType,
    discountCents:
      rewardType === RewardType.DISCOUNT_AMOUNT ? discountCents : null,
    discountPercent:
      rewardType === RewardType.DISCOUNT_PERCENT ? discountPercent : null,
    freeProductId:
      rewardType === RewardType.FREE_ITEM && freeProductId
        ? freeProductId
        : null,
    validFrom,
    validUntil,
    isActive,
  };
}

function getRewardIds(formData: FormData) {
  const rewardIds = new Set<string>();

  for (const value of formData.getAll('rewardId')) {
    if (typeof value === 'string' && value.trim()) {
      rewardIds.add(value.trim());
    }
  }

  const rewardIdsText = getString(formData, 'rewardIds');

  if (rewardIdsText) {
    for (const rewardId of rewardIdsText.split(',')) {
      const cleanedRewardId = rewardId.trim();

      if (cleanedRewardId) {
        rewardIds.add(cleanedRewardId);
      }
    }
  }

  return Array.from(rewardIds);
}

export async function createRewardAction(formData: FormData) {
  await requireRewardsPermission('canCreate');

  const data = buildRewardData(formData);

  const hotels = await db.hotel.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!hotels.length) {
    throw new Error('No active hotels found for global reward creation.');
  }

  await db.reward.createMany({
    data: hotels.map((hotel) => ({
      hotelId: hotel.id,
      ...data,
      isActive: true,
    })),
  });

  revalidatePath('/dashboard/rewards');
}

export async function updateRewardAction(formData: FormData) {
  await requireRewardsPermission('canEdit');

  const rewardIds = getRewardIds(formData);

  if (!rewardIds.length) {
    throw new Error('Reward is required.');
  }

  const existingRewardCount = await db.reward.count({
    where: {
      id: {
        in: rewardIds,
      },
    },
  });

  if (existingRewardCount !== rewardIds.length) {
    throw new Error('One or more rewards were not found.');
  }

  const data = buildRewardData(formData);

  await db.reward.updateMany({
    where: {
      id: {
        in: rewardIds,
      },
    },
    data,
  });

  revalidatePath('/dashboard/rewards');
}

export async function deleteRewardAction(formData: FormData) {
  await requireRewardsPermission('canDelete');

  const rewardIds = getRewardIds(formData);

  if (!rewardIds.length) {
    throw new Error('Reward is required.');
  }

  const rewards = await db.reward.findMany({
    where: {
      id: {
        in: rewardIds,
      },
    },
    select: {
      id: true,
      _count: {
        select: {
          redemptions: true,
        },
      },
    },
  });

  if (!rewards.length) {
    throw new Error('Reward not found.');
  }

  await db.$transaction(async (tx) => {
    for (const reward of rewards) {
      if (reward._count.redemptions > 0) {
        await tx.reward.update({
          where: {
            id: reward.id,
          },
          data: {
            isActive: false,
          },
        });
      } else {
        await tx.reward.delete({
          where: {
            id: reward.id,
          },
        });
      }
    }
  });

  revalidatePath('/dashboard/rewards');
}

export async function manualPointAdjustmentAction(formData: FormData) {
  const { hotelId, user } = await getActionHotelId(formData, 'canEdit');

  const guestMemberId = getString(formData, 'guestMemberId');
  const points = getNumber(formData, 'points');
  const description = getString(formData, 'description');

  if (!guestMemberId) {
    throw new Error('Guest member is required.');
  }

  if (!points) {
    throw new Error('Points adjustment cannot be zero.');
  }

  const guest = await db.guestMember.findFirst({
    where: {
      id: guestMemberId,
      hotelId,
    },
  });

  if (!guest) {
    throw new Error('Guest member not found.');
  }

  const account = await getOrCreatePointAccount({
    hotelId,
    guestMemberId,
  });

  const nextAvailable = Math.max(0, account.availablePoints + points);

  await db.$transaction([
    db.guestPointLedger.create({
      data: {
        hotelId,
        guestMemberId,
        type: points > 0 ? GuestPointLedgerType.BONUS : GuestPointLedgerType.ADJUSTED,
        status: GuestPointLedgerStatus.CONFIRMED,
        points,
        source: 'MANUAL_ADJUSTMENT',
        referenceId: `${Date.now()}-${guestMemberId}`,
        description: description || 'Manual point adjustment',
        createdById: user.id,
      },
    }),

    db.guestPointAccount.update({
      where: {
        guestMemberId,
      },
      data: {
        availablePoints: nextAvailable,
        lifetimeEarnedPoints:
          points > 0
            ? {
                increment: points,
              }
            : undefined,
        lifetimeRedeemedPoints:
          points < 0
            ? {
                increment: Math.abs(points),
              }
            : undefined,
      },
    }),
  ]);

  revalidatePath('/dashboard/rewards');
}

export async function createGuestMemberAction(formData: FormData) {
  const { hotelId } = await getActionHotelId(formData, 'canCreate');

  const name = getString(formData, 'name');
  const phone = getString(formData, 'phone');
  const email = getString(formData, 'email');

  if (!name) {
    throw new Error('Guest name is required.');
  }

  const guest = await db.guestMember.create({
    data: {
      hotelId,
      name,
      phone: phone || null,
      email: email ? email.toLowerCase() : null,
      pointAccount: {
        create: {
          hotelId,
        },
      },
    },
  });

  await getOrCreatePointAccount({
    hotelId,
    guestMemberId: guest.id,
  });

  revalidatePath('/dashboard/rewards');
}

export async function markRewardRedemptionUsedAction(formData: FormData) {
  await requireRewardsPermission('canEdit');

  const redemptionId = getString(formData, 'redemptionId');

  if (!redemptionId) {
    throw new Error('Redemption is required.');
  }

  const result = await db.rewardRedemption.updateMany({
    where: {
      id: redemptionId,
      status: RewardRedemptionStatus.RESERVED,
    },
    data: {
      status: RewardRedemptionStatus.USED,
      usedAt: new Date(),
    },
  });

  if (result.count !== 1) {
    throw new Error('Only reserved redemption codes can be marked as used.');
  }

  revalidatePath('/dashboard/rewards');
}

export async function cancelRewardRedemptionAction(formData: FormData) {
  const user = await requireRewardsPermission('canEdit');

  const redemptionId = getString(formData, 'redemptionId');

  if (!redemptionId) {
    throw new Error('Redemption is required.');
  }

  await db.$transaction(async (tx) => {
    const redemption = await tx.rewardRedemption.findFirst({
      where: {
        id: redemptionId,
        status: RewardRedemptionStatus.RESERVED,
      },
      include: {
        reward: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!redemption) {
      throw new Error('Only reserved redemption codes can be cancelled.');
    }

    await tx.rewardRedemption.update({
      where: {
        id: redemption.id,
      },
      data: {
        status: RewardRedemptionStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    await tx.guestPointAccount.update({
      where: {
        guestMemberId: redemption.guestMemberId,
      },
      data: {
        availablePoints: {
          increment: redemption.pointsUsed,
        },
        lifetimeRedeemedPoints: {
          decrement: redemption.pointsUsed,
        },
      },
    });

    await tx.guestPointLedger.create({
      data: {
        hotelId: redemption.hotelId,
        guestMemberId: redemption.guestMemberId,
        type: GuestPointLedgerType.REFUNDED,
        status: GuestPointLedgerStatus.CONFIRMED,
        points: redemption.pointsUsed,
        source: 'REWARD_REDEMPTION_REFUND',
        referenceId: redemption.id,
        description: `Refunded cancelled reward: ${redemption.reward.name}`,
        createdById: user.id,
      },
    });
  });

  revalidatePath('/dashboard/rewards');
}
