'use server';

import {
  GuestPointLedgerStatus,
  GuestPointLedgerType,
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

export async function createRewardAction(formData: FormData) {
  const { hotelId } = await getActionHotelId(formData);

  const name = getString(formData, 'name');
  const description = getString(formData, 'description');
  const pointsCost = getNumber(formData, 'pointsCost');
  const rewardTypeInput = getString(formData, 'rewardType');
  const discountCents = Math.round(getNumber(formData, 'discountPesos') * 100);
  const discountPercent = getNumber(formData, 'discountPercent');

  if (!name) {
    throw new Error('Reward name is required.');
  }

  if (pointsCost <= 0) {
    throw new Error('Points cost must be greater than zero.');
  }

  const rewardType =
    rewardTypeInput === RewardType.DISCOUNT_PERCENT
      ? RewardType.DISCOUNT_PERCENT
      : rewardTypeInput === RewardType.FREE_ITEM
        ? RewardType.FREE_ITEM
        : rewardTypeInput === RewardType.CUSTOM
          ? RewardType.CUSTOM
          : RewardType.DISCOUNT_AMOUNT;

  await db.reward.create({
    data: {
      hotelId,
      name,
      description: description || null,
      pointsCost,
      rewardType,
      discountCents:
        rewardType === RewardType.DISCOUNT_AMOUNT ? discountCents : null,
      discountPercent:
        rewardType === RewardType.DISCOUNT_PERCENT ? discountPercent : null,
      isActive: true,
    },
  });

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
