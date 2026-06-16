'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import {
  claimRewardsForCurrentNfcSession,
  resolveGuestMemberIdForCurrentNfcSession,
} from '@/lib/nfc-rewards';
import {
  redeemGuestReward,
  RewardRedemptionError,
} from '@/lib/guest-reward-redemptions';

function cleanText(value: FormDataEntryValue | null, maxLength = 200) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

function redirectToRewards(
  tagCode: string,
  params: Record<string, string | number | undefined>
): never {
  if (!tagCode) {
    redirect('/nfc-access-denied?reason=invalid-tag');
  }

  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';

  redirect(`/t/${tagCode}/rewards${suffix}`);
}

function getClaimedPoints(result: unknown) {
  if (!result || typeof result !== 'object') {
    return 0;
  }

  const value =
    (result as { pointsAwarded?: unknown }).pointsAwarded ??
    (result as { awardedPoints?: unknown }).awardedPoints ??
    (result as { points?: unknown }).points;

  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function claimNfcRewardsAction(formData: FormData) {
  const tagCode = cleanText(formData.get('tagCode'), 80);
  const name = cleanText(formData.get('name'), 120);
  const phone = cleanText(formData.get('phone'), 80) || null;
  const email = cleanText(formData.get('email'), 160).toLowerCase() || null;

  if (!tagCode) {
    redirect('/nfc-access-denied?reason=invalid-tag');
  }

  if (!name) {
    redirectToRewards(tagCode, {
      error: 'missing_name',
    });
  }

  if (!phone && !email) {
    redirectToRewards(tagCode, {
      error: 'missing_contact',
    });
  }

  let points = 0;

  try {
    const result = await claimRewardsForCurrentNfcSession({
      tagCode,
      name,
      phone,
      email,
    });

    points = getClaimedPoints(result);
  } catch (error) {
    console.error('Failed to claim NFC rewards:', error);

    redirectToRewards(tagCode, {
      error: 'claim_failed',
    });
  }

  revalidatePath(`/t/${tagCode}`);
  revalidatePath(`/t/${tagCode}/contact`);
  revalidatePath(`/t/${tagCode}/rewards`);

  redirectToRewards(tagCode, {
    claimed: 1,
    points,
  });
}

export async function redeemGuestRewardAction(formData: FormData) {
  const tagCode = cleanText(formData.get('tagCode'), 80);
  const rewardId = cleanText(formData.get('rewardId'), 120);

  if (!tagCode) {
    redirect('/nfc-access-denied?reason=invalid-tag');
  }

  if (!rewardId) {
    redirectToRewards(tagCode, {
      error: 'invalid_reward',
    });
  }

  const tag = await db.nfcTag.findUnique({
    where: {
      code: tagCode,
    },
    select: {
      id: true,
      hotelId: true,
      status: true,
      deletedAt: true,
    },
  });

  if (!tag || tag.status !== 'ACTIVE' || tag.deletedAt) {
    redirectToRewards(tagCode, {
      error: 'invalid_tag',
    });
  }

  const hotelId = tag.hotelId;

  const guestMemberId = await resolveGuestMemberIdForCurrentNfcSession(tagCode);

  if (!guestMemberId) {
    redirectToRewards(tagCode, {
      error: 'claim_rewards_first',
    });
  }

  const linkedGuestMemberId = guestMemberId;

  let redemptionCode = '';

  try {
    const redemption = await redeemGuestReward({
      hotelId,
      guestMemberId: linkedGuestMemberId,
      rewardId,
    });

    redemptionCode = redemption.code;
  } catch (error) {
    if (error instanceof RewardRedemptionError) {
      if (error.code === 'INSUFFICIENT_POINTS') {
        redirectToRewards(tagCode, {
          error: 'insufficient_points',
        });
      }

      if (error.code === 'REWARD_INACTIVE') {
        redirectToRewards(tagCode, {
          error: 'reward_inactive',
        });
      }

      if (error.code === 'REWARD_NOT_FOUND') {
        redirectToRewards(tagCode, {
          error: 'invalid_reward',
        });
      }

      if (error.code === 'REWARD_ALREADY_RESERVED') {
        redirectToRewards(tagCode, {
          error: 'already_reserved',
        });
      }

      redirectToRewards(tagCode, {
        error: 'reward_failed',
      });
    }

    console.error('Failed to redeem guest reward:', error);

    redirectToRewards(tagCode, {
      error: 'reward_failed',
    });
  }

  revalidatePath(`/t/${tagCode}`);
  revalidatePath(`/t/${tagCode}/contact`);
  revalidatePath(`/t/${tagCode}/rewards`);

  redirectToRewards(tagCode, {
    success: 'reward_redeemed',
    code: redemptionCode,
  });
}