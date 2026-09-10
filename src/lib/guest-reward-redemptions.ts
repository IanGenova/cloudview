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
        /*
          The no-duplicate-reservation rule, folded into the deduction.

          The findFirst above is a check-then-act with no @@unique behind it,
          so a double-tap could pass it twice and mint two RESERVED codes for
          one reward -- two independently redeemable codes at the front desk,
          which lines above explicitly forbid. Points were deducted correctly
          both times, so the damage was the broken invariant, not the balance.

          Evaluated as a subquery inside this locking UPDATE, it is a current
          read rather than a snapshot one, so the second caller sees the first
          caller's committed redemption and matches zero rows.

          The complete fix is a unique index on the reserved slot, which needs
          a migration; this closes the window without one.
        */
        guestMember: {
          redemptions: {
            none: {
              rewardId: reward.id,
              status: RewardRedemptionStatus.RESERVED,
            },
          },
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
      /*
        Zero rows means either too few points or a redemption that another
        request reserved in between. Re-read to say which, rather than
        reporting a points problem to a guest who has plenty.
      */
      const reservedNow = await tx.rewardRedemption.findFirst({
        where: {
          hotelId: params.hotelId,
          guestMemberId: params.guestMemberId,
          rewardId: reward.id,
          status: RewardRedemptionStatus.RESERVED,
        },
        select: { id: true },
      });

      if (reservedNow) {
        throw new RewardRedemptionError(
          'REWARD_ALREADY_RESERVED',
          'Guest already has an unused redemption code for this reward.'
        );
      }

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