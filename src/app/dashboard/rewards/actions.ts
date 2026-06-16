'use server';

import {
  GuestPointLedgerStatus,
  GuestPointLedgerType,
  RewardRedemptionStatus,
  RewardType,
  Role,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
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

function canManageRewards(role: Role) {
  return role === Role.SUPER_ADMIN || role === Role.HOTEL_ADMIN;
}

function canVerifyRedemptions(role: Role) {
  return role === Role.SUPER_ADMIN || role === Role.HOTEL_ADMIN || role === Role.STAFF;
}

async function getActionHotelId(formData: FormData) {
  const user = await requireUser();

  if (user.role === Role.SUPER_ADMIN) {
    const hotelId = getString(formData, 'hotelId');

    if (!hotelId) {
      throw new Error('Hotel is required.');
    }

    return {
      user,
      hotelId,
    };
  }

  if (!user.hotelId) {
    throw new Error('Your account is not assigned to a hotel.');
  }

  return {
    user,
    hotelId: user.hotelId,
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

export async function createRewardAction(formData: FormData) {
  const { hotelId } = await getActionHotelId(formData);

  const data = buildRewardData(formData);

  await db.reward.create({
    data: {
      hotelId,
      ...data,
      isActive: true,
    },
  });

  revalidatePath('/dashboard/rewards');
}

export async function updateRewardAction(formData: FormData) {
  const user = await requireUser();

  if (!canManageRewards(user.role)) {
    throw new Error('You are not allowed to edit rewards.');
  }

  const rewardId = getString(formData, 'rewardId');

  if (!rewardId) {
    throw new Error('Reward is required.');
  }

  const reward = await db.reward.findFirst({
    where:
      user.role === Role.SUPER_ADMIN
        ? {
            id: rewardId,
          }
        : {
            id: rewardId,
            hotelId: user.hotelId!,
          },
    select: {
      id: true,
    },
  });

  if (!reward) {
    throw new Error('Reward not found.');
  }

  const data = buildRewardData(formData);

  await db.reward.update({
    where: {
      id: reward.id,
    },
    data,
  });

  revalidatePath('/dashboard/rewards');
}

export async function deleteRewardAction(formData: FormData) {
  const user = await requireUser();

  if (!canManageRewards(user.role)) {
    throw new Error('You are not allowed to delete rewards.');
  }

  const rewardId = getString(formData, 'rewardId');

  if (!rewardId) {
    throw new Error('Reward is required.');
  }

  const reward = await db.reward.findFirst({
    where:
      user.role === Role.SUPER_ADMIN
        ? {
            id: rewardId,
          }
        : {
            id: rewardId,
            hotelId: user.hotelId!,
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

  if (!reward) {
    throw new Error('Reward not found.');
  }

  if (reward._count.redemptions > 0) {
    await db.reward.update({
      where: {
        id: reward.id,
      },
      data: {
        isActive: false,
      },
    });
  } else {
    await db.reward.delete({
      where: {
        id: reward.id,
      },
    });
  }

  revalidatePath('/dashboard/rewards');
}

export async function manualPointAdjustmentAction(formData: FormData) {
  const { hotelId, user } = await getActionHotelId(formData);

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
  const { hotelId } = await getActionHotelId(formData);

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
  const user = await requireUser();

  if (!canVerifyRedemptions(user.role)) {
    throw new Error('You are not allowed to verify redemptions.');
  }

  const redemptionId = getString(formData, 'redemptionId');

  if (!redemptionId) {
    throw new Error('Redemption is required.');
  }

  const result = await db.rewardRedemption.updateMany({
    where:
      user.role === Role.SUPER_ADMIN
        ? {
            id: redemptionId,
            status: RewardRedemptionStatus.RESERVED,
          }
        : {
            id: redemptionId,
            hotelId: user.hotelId!,
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
  const user = await requireUser();

  if (!canVerifyRedemptions(user.role)) {
    throw new Error('You are not allowed to cancel redemptions.');
  }

  const redemptionId = getString(formData, 'redemptionId');

  if (!redemptionId) {
    throw new Error('Redemption is required.');
  }

  await db.$transaction(async (tx) => {
    const redemption = await tx.rewardRedemption.findFirst({
      where:
        user.role === Role.SUPER_ADMIN
          ? {
              id: redemptionId,
              status: RewardRedemptionStatus.RESERVED,
            }
          : {
              id: redemptionId,
              hotelId: user.hotelId!,
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