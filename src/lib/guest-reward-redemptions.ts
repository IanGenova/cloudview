import { randomBytes } from 'crypto';
import {
  GuestPointLedgerStatus,
  GuestPointLedgerType,
  RewardRedemptionStatus,
} from '@prisma/client';
import { db } from '@/lib/db';

export class RewardRedemptionError extends Error {
  constructor(
    public code:
      | 'REWARD_NOT_FOUND'
      | 'REWARD_INACTIVE'
      | 'REWARD_ALREADY_RESERVED'
      | 'INSUFFICIENT_POINTS'
      | 'GUEST_ACCOUNT_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'RewardRedemptionError';
  }
}

function generateRedemptionCode() {
  const part = randomBytes(4).toString('hex').toUpperCase();

  return `CVR-${part}`;
}

function isRewardCurrentlyValid(reward: {
  isActive: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
}) {
  const now = new Date();

  if (!reward.isActive) {
    return false;
  }

  if (reward.validFrom && reward.validFrom > now) {
    return false;
  }

  if (reward.validUntil && reward.validUntil < now) {
    return false;
  }

  return true;
}

export async function redeemGuestReward(params: {
  hotelId: string;
  guestMemberId: string;
  rewardId: string;
}) {
  return db.$transaction(async (tx) => {
    const reward = await tx.reward.findFirst({
      where: {
        id: params.rewardId,
        hotelId: params.hotelId,
      },
      select: {
        id: true,
        hotelId: true,
        name: true,
        description: true,
        pointsCost: true,
        rewardType: true,
        discountCents: true,
        discountPercent: true,
        freeProductId: true,
        isActive: true,
        validFrom: true,
        validUntil: true,
      },
    });

    if (!reward) {
      throw new RewardRedemptionError(
        'REWARD_NOT_FOUND',
        'Reward was not found.'
      );
    }

    if (!isRewardCurrentlyValid(reward)) {
      throw new RewardRedemptionError(
        'REWARD_INACTIVE',
        'Reward is not currently available.'
      );
    }

    const existingReservedRedemption = await tx.rewardRedemption.findFirst({
  where: {
    hotelId: params.hotelId,
    guestMemberId: params.guestMemberId,
    rewardId: reward.id,
    status: RewardRedemptionStatus.RESERVED,
  },
  select: {
    id: true,
    code: true,
  },
});

if (existingReservedRedemption) {
  throw new RewardRedemptionError(
    'REWARD_ALREADY_RESERVED',
    'Guest already has an unused redemption code for this reward.'
  );
}


    const account = await tx.guestPointAccount.findUnique({
      where: {
        guestMemberId: params.guestMemberId,
      },
      select: {
        id: true,
        availablePoints: true,
      },
    });

    if (!account) {
      throw new RewardRedemptionError(
        'GUEST_ACCOUNT_NOT_FOUND',
        'Guest point account was not found.'
      );
    }

    if (account.availablePoints < reward.pointsCost) {
      throw new RewardRedemptionError(
        'INSUFFICIENT_POINTS',
        'Guest does not have enough points.'
      );
    }

    /**
     * Race-condition safe deduction.
     * This prevents double redeeming if the guest taps the button twice.
     */
    const deduction = await tx.guestPointAccount.updateMany({
      where: {
        id: account.id,
        availablePoints: {
          gte: reward.pointsCost,
        },
      },
      data: {
        availablePoints: {
          decrement: reward.pointsCost,
        },
        lifetimeRedeemedPoints: {
          increment: reward.pointsCost,
        },
      },
    });

    if (deduction.count !== 1) {
      throw new RewardRedemptionError(
        'INSUFFICIENT_POINTS',
        'Guest does not have enough points.'
      );
    }

    const redemption = await tx.rewardRedemption.create({
      data: {
        hotelId: params.hotelId,
        guestMemberId: params.guestMemberId,
        rewardId: reward.id,
        pointsUsed: reward.pointsCost,
        code: generateRedemptionCode(),
        status: RewardRedemptionStatus.RESERVED,
      },
      select: {
        id: true,
        code: true,
        pointsUsed: true,
        status: true,
        redeemedAt: true,
        reward: {
          select: {
            name: true,
            description: true,
            rewardType: true,
            discountCents: true,
            discountPercent: true,
          },
        },
      },
    });

    await tx.guestPointLedger.create({
      data: {
        hotelId: params.hotelId,
        guestMemberId: params.guestMemberId,
        type: GuestPointLedgerType.REDEEMED,
        status: GuestPointLedgerStatus.CONFIRMED,
        points: -reward.pointsCost,
        source: 'REWARD_REDEMPTION',
        referenceId: redemption.id,
        description: `Redeemed reward: ${reward.name}`,
      },
    });

    return redemption;
  });
}